const BULLET_RE = /^(\s*[-•*●▪]\s+)/;
const MAX_BULLETS_PER_ROLE = 8;
const MAX_BULLET_CHARS = 480;
const MAX_SUMMARY_LINES = 3;

const JD_ECHO_SUFFIX =
  /\s*[—–-]\s*(?:aligned with|requirements?|qualifications?|your posting|the role requires|as mentioned in|per the job|matching the|focus on).{12,}$/i;

function normalizeBullet(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bulletSimilarity(a, b) {
  const wa = new Set(normalizeBullet(a).split(' ').filter((w) => w.length > 3));
  const wb = new Set(normalizeBullet(b).split(' ').filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(wa.size, wb.size);
}

function collapseRepeatedWords(line = '') {
  return String(line).replace(/\b(\w{3,})(\s+\1\b)+/gi, '$1');
}

function stripJdEcho(line = '') {
  return collapseRepeatedWords(String(line).replace(JD_ECHO_SUFFIX, '').trimEnd());
}

function trimLongBullet(line = '') {
  const t = String(line).trim();
  if (t.length <= MAX_BULLET_CHARS) return t;
  const cut = t.slice(0, MAX_BULLET_CHARS);
  const lastPeriod = cut.lastIndexOf('.');
  if (lastPeriod > 70) return cut.slice(0, lastPeriod + 1);
  const lastComma = cut.lastIndexOf(',');
  if (lastComma > 70) return `${cut.slice(0, lastComma)}.`;
  return `${cut.trim()}…`;
}

function isSectionHeading(line = '') {
  const t = line.trim();
  if (!t) return false;
  return /^[A-Z][A-Z\s/&.,'-]{2,}$/.test(t) && t.length < 60;
}

function isRoleHeaderLine(line = '') {
  const t = line.trim().replace(/^[-•*●▪]+\s+/, '');
  if (!t) return false;
  if (isSectionHeading(t)) return false;
  return (
    /\b(20\d{2}|19\d{2})\b/.test(t) ||
    /\b(present|current)\b/i.test(t) ||
    / — | – | - /.test(t)
  );
}

function trimSummaryBlock(lines, startIdx) {
  const block = [];
  let i = startIdx;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (i > startIdx && isSectionHeading(trimmed)) break;
    block.push(lines[i]);
    i += 1;
  }

  let kept = 0;
  const trimmedBlock = block
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || BULLET_RE.test(trimmed)) return line;
      if (kept >= MAX_SUMMARY_LINES) return null;
      kept += 1;
      return stripJdEcho(trimLongBullet(trimmed));
    })
    .filter((line) => line !== null);

  return { block: trimmedBlock, nextIdx: i };
}

function reduceStackedTechLists(line = '') {
  let out = String(line);
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(
      /\b(kubernetes|terraform|aws|azure|gcp|docker|python|golang|devops|linux|ansible|jenkins|datadog|kafka|prometheus|grafana|helm|argocd)(?:,\s*(?:and\s+)?(?:kubernetes|terraform|aws|azure|gcp|docker|python|golang|devops|linux|ansible|jenkins|datadog|kafka|prometheus|grafana|helm|argocd)){2,}/gi,
      '$1'
    );
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
}

function trimExperienceBullets(lines) {
  const { isRoleTagline } = require('./resumeKitLayoutService');
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (isRoleTagline(trimmed)) {
      out.push(trimmed.replace(/^[-•*●▪]+\s+/, ''));
      continue;
    }

    if (isRoleHeaderLine(trimmed)) {
      const normalized = trimmed.replace(/^[-•*●▪]+\s+/, '');
      out.push(/^[-•*●▪]/.test(trimmed) ? normalized : line);
      continue;
    }

    if (BULLET_RE.test(trimmed)) {
      const bullet = reduceStackedTechLists(stripJdEcho(trimLongBullet(trimmed)));
      if (!bullet.replace(/^[-•*●▪]+\s*/, '').trim() || bullet.replace(/^[-•*●▪]+\s*/, '').trim().length < 15) {
        out.push(line);
        continue;
      }
      out.push(bullet);
      continue;
    }

    out.push(stripJdEcho(line));
  }

  return out;
}

function capTermFrequency(text, terms = [], maxPerTerm = 2) {
  if (!terms.length) return text;
  const lines = text.split('\n');
  const counts = new Map();

  return lines
    .map((line) => {
      if (!BULLET_RE.test(line.trim())) return line;
      let out = line;
      for (const term of terms) {
        if (term.length < 4) continue;
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        out = out.replace(re, (match) => {
          const key = term.toLowerCase();
          const n = (counts.get(key) || 0) + 1;
          counts.set(key, n);
          if (n <= maxPerTerm) return match;
          return '';
        });
      }
      return reduceStackedTechLists(
        out.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/\s+and\s+\./g, '.').trim()
      );
    })
    .join('\n');
}

function polishTailoredResumeText(text = '', jobDescription = '') {
  if (!text?.trim()) return text;

  const { polishExperienceText } = require('./resumeCarBulletService');
  const working = polishExperienceText(text);
  const lines = String(working).split('\n');
  const polished = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (/^(summary|profile|objective|professional summary)\b/i.test(trimmed)) {
      polished.push(lines[i]);
      i += 1;
      const { block, nextIdx } = trimSummaryBlock(lines, i);
      polished.push(...block);
      i = nextIdx;
      continue;
    }

    if (/^(experience|work history|employment|professional experience)\b/i.test(trimmed)) {
      polished.push(lines[i]);
      i += 1;
      const expLines = [];
      while (i < lines.length && !isSectionHeading(lines[i].trim())) {
        expLines.push(lines[i]);
        i += 1;
      }
      polished.push(...trimExperienceBullets(expLines));
      continue;
    }

    polished.push(stripJdEcho(lines[i]));
    i += 1;
  }

  let result = polished.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (jobDescription) {
    try {
      const { extractJdTerms } = require('./atsKeywordService');
      const terms = extractJdTerms(jobDescription).filter((t) => t.length >= 5);
      result = capTermFrequency(result, terms, 2);
    } catch {
      // optional enrichment
    }
  }

  return result;
}

module.exports = {
  polishTailoredResumeText,
  stripJdEcho,
  trimExperienceBullets,
  bulletSimilarity,
  MAX_BULLETS_PER_ROLE,
  MAX_BULLET_CHARS,
};
