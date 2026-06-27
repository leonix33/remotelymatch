/**
 * Reconstruct readable line/section structure from flattened resume text
 * (common after PDF/DOCX extraction that collapsed whitespace).
 */

const SECTION_HEADERS = [
  'PROFESSIONAL SUMMARY',
  'EXECUTIVE SUMMARY',
  'CAREER SUMMARY',
  'SUMMARY',
  'PROFILE',
  'OBJECTIVE',
  'ABOUT ME',
  'WORK EXPERIENCE',
  'PROFESSIONAL EXPERIENCE',
  'RELEVANT EXPERIENCE',
  'EMPLOYMENT HISTORY',
  'EMPLOYMENT',
  'EXPERIENCE',
  'CAREER HISTORY',
  'EDUCATION',
  'ACADEMIC BACKGROUND',
  'DEGREES',
  'CERTIFICATIONS',
  'CERTIFICATION',
  'CREDENTIALS',
  'LICENSES',
  'LICENCES',
  'PROFESSIONAL DEVELOPMENT',
  'TRAINING',
  'TECHNICAL SKILLS',
  'CORE COMPETENCIES',
  'SKILLS',
  'TECHNOLOGIES',
  'TOOLS',
  'SELECTED PROJECTS',
  'KEY PROJECTS',
  'PROJECTS',
  'AWARDS',
  'HONORS',
  'ACHIEVEMENTS',
  'PUBLICATIONS',
  'PATENTS',
  'VOLUNTEER',
  'COMMUNITY',
  'REFERENCES',
];

const TITLE_CASE_HEADERS = [
  'Professional Summary',
  'Executive Summary',
  'Career Summary',
  'Work Experience',
  'Professional Experience',
  'Employment History',
  'Technical Skills',
  'Core Competencies',
  'Selected Projects',
  'Key Projects',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanLines(lines) {
  const out = [];
  for (const line of lines) {
    const t = String(line).replace(/\s+/g, ' ').trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    out.push(t);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isStructuredResume(text) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 6) return false;

  const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  if (avgLen > 160) return false;

  let sectionHits = 0;
  for (const line of lines) {
    const bare = line.replace(/:+\s*$/, '');
    if (SECTION_HEADERS.some((h) => bare.toUpperCase() === h)) sectionHits += 1;
    if (TITLE_CASE_HEADERS.some((h) => bare === h)) sectionHits += 1;
  }

  return sectionHits >= 2 || (lines.length >= 12 && avgLen < 90);
}

function insertSectionBreaks(flat) {
  let text = flat;
  const sorted = [...SECTION_HEADERS].sort((a, b) => b.length - a.length);
  const tokens = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const header = sorted[i];
    const token = `@@SEC${i}@@`;
    tokens.push({ token, header });
    const re = new RegExp(`\\s+${escapeRegex(header)}(?=\\s)`, 'gi');
    text = text.replace(re, () => `\n\n${token}\n`);
  }

  for (const { token, header } of tokens) {
    text = text.split(token).join(header);
  }

  const titleSorted = [...TITLE_CASE_HEADERS].sort((a, b) => b.length - a.length);
  for (let i = 0; i < titleSorted.length; i += 1) {
    const header = titleSorted[i];
    const token = `@@TSEC${i}@@`;
    const re = new RegExp(`\\s+${escapeRegex(header)}\\s*:?(?=\\s)`);
    text = text.replace(re, () => `\n\n${token}\n`);
    text = text.split(token).join(header);
  }

  return text;
}

function insertContentBreaks(text) {
  let t = text;

  // Bullets mid-line
  t = t.replace(/\s+[-•●▪◦]\s+/g, '\n- ');
  t = t.replace(/\s+(?=\d+[\).]\s)/g, '\n');

  // Contact block after name
  t = t.replace(
    /^([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,4})\s+((?:[\w.+-]+@[\w.-]+\.\w+|[\d+().\s-]{10,}).*)$/m,
    '$1\n$2'
  );

  // Split pipe-separated contact fragments
  t = t.replace(
    /([\w.+-]+@[\w.-]+\.\w+)\s*\|\s*/g,
    '$1\n'
  );

  // Date ranges on their own line
  t = t.replace(
    /\s+((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\.?\s+\d{4}\s*[–\-—]\s*(?:Present|Current|Now|\d{4}))/gi,
    '\n$1'
  );

  // Job title | company
  t = t.replace(
    /\s+([A-Z][^.\n]{4,70}\s*\|\s*[^|\n]{3,70})/g,
    '\n$1'
  );

  // Job title — company
  t = t.replace(
    /\s+([A-Z][^.\n]{4,70}\s+—\s+[^—\n]{3,70})/g,
    '\n$1'
  );

  // Degree lines
  t = t.replace(
    /\s+((?:B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?|MBA)[^.\n]{0,80}(?:University|College|Institute|School)[^.\n]{0,40})/gi,
    '\n$1'
  );

  return t;
}

function normalizeResumeLayout(resumeText = '') {
  let text = String(resumeText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u00a0\u200b\ufeff]/g, ' ')
    .replace(/\u2013|\u2014/g, '–')
    .trim();

  if (!text) return '';

  if (isStructuredResume(text)) {
    return cleanLines(text.split('\n'));
  }

  // Single-line or few long lines — reconstruct
  const flat = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let rebuilt = insertSectionBreaks(flat);
  rebuilt = insertContentBreaks(rebuilt);

  return cleanLines(rebuilt.split('\n'));
}

function preserveLineBreaksFromExtracted(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u00a0\u200b\ufeff]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

module.exports = {
  normalizeResumeLayout,
  preserveLineBreaksFromExtracted,
  isStructuredResume,
};
