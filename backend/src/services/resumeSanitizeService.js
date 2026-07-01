const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\b/i;

const ACTION_VERBS =
  'Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Established|Reduced|Improved|Automated|Deployed|Integrated|Supported|Enhanced|Enforced|Operated|Conducted';

const ACTION_IN_LINE_RE = new RegExp(`\\s+(${ACTION_VERBS})\\b`);

function isGarbageLine(line = '') {
  const t = String(line).trim().replace(/^[-•*●▪]+\s*/, '');
  if (!t) return true;
  if (/^[-–—|.\s]+$/.test(t)) return true;
  if (t.length < 8 && !DATE_RANGE_RE.test(t)) return true;
  return false;
}

function isJobMetaLine(line = '') {
  const t = String(line).trim().replace(/^[-•*●▪]+\s*/, '');
  if (!t) return false;
  if (DATE_RANGE_RE.test(t)) return true;
  const actionMatch = t.match(ACTION_IN_LINE_RE);
  if (actionMatch && actionMatch.index !== undefined && actionMatch.index >= 15) return false;
  if (t.includes('|') && t.length < 200) return true;
  return false;
}

function splitMergedTagAndBullet(line = '') {
  const raw = String(line).trim();
  const hadBullet = /^[-•*●▪]/.test(raw);
  const t = raw.replace(/^[-•*●▪]+\s*/, '');
  if (!t.includes('|')) return [raw];

  const match = t.match(ACTION_IN_LINE_RE);
  if (!match || match.index === undefined || match.index < 15) return [raw];

  const tags = t.slice(0, match.index).trim().replace(/\|\s*$/, '');
  const bullet = t.slice(match.index).trim();
  if (!bullet || bullet.length < 20) return [raw];

  const out = [];
  if (tags) out.push(tags);
  out.push(hadBullet || raw.startsWith('-') ? `- ${bullet}` : bullet);
  return out;
}

function sanitizeExperienceLines(text = '') {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let inExperience = false;
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(professional\s+)?experience$/i.test(trimmed)) {
      inExperience = true;
      out.push(line);
      continue;
    }

    if (inExperience && /^[A-Z][A-Z\s/&\-]{2,}$/.test(trimmed) && trimmed.length < 60 && !/experience/i.test(trimmed)) {
      inExperience = false;
    }

    if (!inExperience) {
      out.push(line);
      continue;
    }

    if (isGarbageLine(trimmed)) continue;

    if (isJobMetaLine(trimmed)) {
      out.push(trimmed.replace(/^[-•*●▪]+\s*/, ''));
      continue;
    }

    const expanded = splitMergedTagAndBullet(trimmed);
    if (expanded.length > 1) {
      out.push(...expanded);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

function sanitizeResumeText(text = '') {
  return sanitizeExperienceLines(String(text || ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sanitizeResumeText, sanitizeExperienceLines };
