const { TECH_KEYWORDS } = require('./resumeTailorService');
const { READY_ATS_MIN } = require('./kitReadinessService');

const STOP_WORDS = new Set([
  'with', 'that', 'this', 'from', 'have', 'will', 'your', 'their', 'about', 'years', 'experience',
  'ability', 'strong', 'working', 'using', 'including', 'within', 'across', 'other', 'such',
]);

const PRIORITY_SECTION_RE =
  /(?:requirements?|qualifications?|what you(?:'ll| will) bring|must have|you have|ideal candidate|bonus|nice to have|responsibilities)[:\s]*([\s\S]{0,2400}?)(?:\n\n|\n[A-Z][A-Z][A-Z]|\n#{1,3}\s|$)/gi;

function normalize(text = '') {
  return String(text).toLowerCase();
}

function sanitizeJobDescriptionForAts(text = '') {
  return String(text || '')
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(/www\.[^\s]+/gi, ' ')
    .replace(/\bURL:\s*[^\n]+/gi, ' ')
    .replace(/\b[a-f0-9]{8,}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidAtsTerm(term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t || t.length < 3 || t.length > 36) return false;
  if (STOP_WORDS.has(t)) return false;
  if (/^https?/.test(t) || /^\/\//.test(t)) return false;
  if (/\.(com|io|org|net|co)\b/.test(t)) return false;
  if (/^[a-f0-9]{6,}$/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/[/#?=&]/.test(t)) return false;
  if (/^(detail|job|remote|apply|posted|source|location|url|viva|usa|inc|llc|corp)$/.test(t)) return false;
  if (!/[a-z]/.test(t)) return false;
  return true;
}

function inferTermsFromJob(job = {}) {
  const blob = normalize(`${job?.title || ''} ${job?.company || ''}`);
  const inferred = new Set(TECH_KEYWORDS.filter((keyword) => blob.includes(keyword)));

  if (/\b(devops|devsecops|sre|site reliability|platform engineer|cloud engineer|infrastructure)\b/i.test(blob)) {
    for (const keyword of [
      'devops',
      'ci/cd',
      'kubernetes',
      'terraform',
      'docker',
      'aws',
      'azure',
      'linux',
      'jenkins',
      'ansible',
      'security',
      'observability',
    ]) {
      inferred.add(keyword);
    }
  }

  return [...inferred];
}

function tokenize(text = '') {
  return normalize(sanitizeJobDescriptionForAts(text))
    .replace(/[^a-z0-9+#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function addLineTerms(terms, line, weight = 1) {
  const words = tokenize(line).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  for (const w of words.slice(0, weight > 1 ? 12 : 8)) {
    terms.add(w);
  }
  const phraseMatch = line.match(
    /\b(kubernetes|k8s|terraform|aws|azure|gcp|docker|python|golang|devops|sre|ci\/cd|linux|ansible|jenkins|datadog|kafka|postgres|mongodb|helm|argocd|istio|pulumi|databricks|snowflake|vault|prometheus|grafana)\b/gi
  );
  if (phraseMatch) phraseMatch.forEach((p) => terms.add(normalize(p)));
}

function isValidRequirementLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length < 12 || t.length > 200) return false;
  if (/&[a-z]+;|&quot;|&lt;|class\s*=|href\s*=|https?:\/\//i.test(t)) return false;
  if (/\b(quot|href|class|link|nbsp|span|div)\b/i.test(t) && t.length < 80) return false;
  if (/^[^a-zA-Z]*$/.test(t)) return false;
  return true;
}

function extractPrioritySectionLines(jobDescription = '') {
  const lines = [];
  const text = sanitizeJobDescriptionForAts(jobDescription);
  let match;
  const re = new RegExp(PRIORITY_SECTION_RE.source, PRIORITY_SECTION_RE.flags);
  while ((match = re.exec(text)) !== null) {
    const block = match[1] || '';
    for (const line of block.split(/[\n•·\-;]+/)) {
      const trimmed = line.trim();
      if (isValidRequirementLine(trimmed)) lines.push(trimmed);
    }
  }
  return lines.slice(0, 20);
}

function extractJdTerms(jobDescription = '', job = {}) {
  const cleaned = sanitizeJobDescriptionForAts(jobDescription);
  const blob = normalize(cleaned);
  const terms = new Set();

  for (const keyword of TECH_KEYWORDS) {
    if (blob.includes(keyword)) terms.add(keyword);
  }

  for (const line of extractPrioritySectionLines(cleaned)) {
    addLineTerms(terms, line, 2);
  }

  const lines = cleaned
    .split(/[\n•·\-;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 120);

  for (const line of lines.slice(0, 30)) {
    addLineTerms(terms, line);
  }

  for (const inferred of inferTermsFromJob(job)) {
    terms.add(inferred);
  }

  const filtered = [...terms].filter(isValidAtsTerm);
  if (filtered.length < 6) {
    for (const inferred of inferTermsFromJob(job)) {
      if (isValidAtsTerm(inferred)) filtered.push(inferred);
    }
  }

  return [...new Set(filtered)].slice(0, 45);
}

function getRedTerms(atsOrBreakdown, limit = 12) {
  const breakdown = Array.isArray(atsOrBreakdown)
    ? atsOrBreakdown
    : atsOrBreakdown?.breakdown || atsOrBreakdown?.atsBreakdown || [];
  return breakdown
    .filter((b) => b.status === 'red')
    .map((b) => b.term)
    .filter(isValidAtsTerm)
    .slice(0, limit);
}

function buildJdMatchBrief(jobDescription = '', job = {}) {
  const cleaned = sanitizeJobDescriptionForAts(jobDescription);
  const requirements = extractPrioritySectionLines(cleaned);
  const extra = cleaned
    .split(/[\n•·]+/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        isValidRequirementLine(l) &&
        /\b(experience|required|must|years|proficient|knowledge|ability)\b/i.test(l)
    )
    .slice(0, 6);
  const merged = [...new Set([...requirements, ...extra])].slice(0, 12);

  return {
    roleTitle: job?.title || '',
    company: job?.company || '',
    requirements: merged,
    criticalTerms: extractJdTerms(cleaned, job).slice(0, 28),
  };
}

function requirementCovered(resumeText, requirement) {
  const blob = normalize(resumeText);
  const tokens = tokenize(requirement).filter((w) => w.length >= 5 && !STOP_WORDS.has(w));
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => blob.includes(t) || blob.includes(t.slice(0, Math.max(4, t.length - 1))));
  const minHits = tokens.length <= 2 ? 1 : Math.min(2, tokens.length);
  return hits.length >= minHits;
}

function scoreJdRequirementCoverage(resumeText = '', jobDescription = '', job = {}) {
  const brief = buildJdMatchBrief(jobDescription, job);
  const requirements = brief.requirements;
  if (!requirements.length) {
    return {
      jdMatchPct: 100,
      jdRequirementsCovered: 0,
      jdRequirementsTotal: 0,
      uncoveredRequirements: [],
      brief,
    };
  }

  const covered = [];
  const uncovered = [];
  for (const req of requirements) {
    if (requirementCovered(resumeText, req)) covered.push(req);
    else uncovered.push(req);
  }

  const jdMatchPct = Math.round((covered.length / requirements.length) * 100);
  return {
    jdMatchPct,
    jdRequirementsCovered: covered.length,
    jdRequirementsTotal: requirements.length,
    uncoveredRequirements: uncovered.slice(0, 8),
    brief,
  };
}

function buildAtsTips(ats) {
  const tips = [];
  if (!ats) return tips;

  if (ats.readyToSubmit) {
    tips.push(`ATS ${ats.score}% — strong keyword match for screening filters`);
    tips.push('Lead top bullets with outcomes — recruiters scan ~6 seconds on first pass');
  } else {
    const missing = getRedTerms(ats, 6);
    tips.push(
      missing.length
        ? `ATS ${ats.score}% — weave these JD terms into experience bullets: ${missing.join(', ')}`
        : `ATS ${ats.score}% — re-tailor with ATS high match to close keyword gaps`
    );
    tips.push('Use ATS high match mode before applying to this role');
  }
  tips.push('Cover letter: one quantified win + why this role fits you');
  return tips;
}

function buildRecruiterTips(ats, jdCoverage) {
  const tips = buildAtsTips(ats);
  if (jdCoverage?.jdRequirementsTotal > 0) {
    if (jdCoverage.jdMatchPct >= 75) {
      tips.unshift(
        `Job fit ${jdCoverage.jdMatchPct}% — ${jdCoverage.jdRequirementsCovered}/${jdCoverage.jdRequirementsTotal} posting requirements reflected`
      );
    } else {
      const sample = (jdCoverage.uncoveredRequirements || []).slice(0, 3).join('; ');
      tips.unshift(
        sample
          ? `Job fit ${jdCoverage.jdMatchPct}% — strengthen bullets for: ${sample}`
          : `Job fit ${jdCoverage.jdMatchPct}% — re-tailor to mirror more posting requirements`
      );
    }
  }
  return tips;
}

function isRecruiterReady(ats, jdCoverage) {
  const jdOk = !jdCoverage?.jdRequirementsTotal || jdCoverage.jdMatchPct >= 75;
  return Boolean(ats?.readyToSubmit && jdOk && (ats?.score ?? 0) >= READY_ATS_MIN);
}

function termInResume(term, resumeBlob, resumeTokens) {
  const t = normalize(term);
  if (!t) return 'red';
  if (resumeBlob.includes(t)) return 'green';
  const parts = t.split(/[\s/]+/).filter((p) => p.length >= 4);
  if (parts.some((p) => resumeBlob.includes(p))) return 'green';
  if (parts.some((p) => resumeTokens.some((rt) => rt.includes(p) || p.includes(rt)))) return 'yellow';
  if (t.length >= 5 && resumeTokens.some((rt) => rt.startsWith(t.slice(0, 4)))) return 'yellow';
  return 'red';
}

function scoreAtsKeywords({ resumeText = '', tailoredText = '', jobDescription = '', job = {} } = {}) {
  const resume = String(tailoredText || resumeText || '').trim();
  const resumeBlob = normalize(resume);
  const resumeTokens = tokenize(resume);
  const cleanedJd = sanitizeJobDescriptionForAts(jobDescription);
  const terms = extractJdTerms(cleanedJd, job);

  const breakdown = terms.map((term) => ({
    term,
    status: termInResume(term, resumeBlob, resumeTokens),
  }));

  const green = breakdown.filter((b) => b.status === 'green').length;
  const yellow = breakdown.filter((b) => b.status === 'yellow').length;
  const red = breakdown.filter((b) => b.status === 'red').length;
  const termCount = breakdown.length || 1;
  const score = Math.min(100, Math.round(((green + yellow * 0.45) / termCount) * 100));

  return {
    score,
    targetScore: 100,
    green,
    yellow,
    red,
    termCount,
    breakdown,
    readyToSubmit: score >= READY_ATS_MIN && red <= Math.max(2, Math.floor(termCount * 0.15)),
  };
}

module.exports = {
  scoreAtsKeywords,
  extractJdTerms,
  buildAtsTips,
  buildRecruiterTips,
  getRedTerms,
  extractPrioritySectionLines,
  buildJdMatchBrief,
  scoreJdRequirementCoverage,
  requirementCovered,
  isRecruiterReady,
};
