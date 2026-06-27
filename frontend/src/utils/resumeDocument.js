import { normalizeResumeLayout } from './resumeLayout';

const IMMUTABLE_SECTION_KEYS = new Set([
  'education',
  'certifications',
  'credentials',
  'licenses',
  'training',
  'clearances',
]);

const SECTION_DEFS = [
  { key: 'summary', labels: /^(professional\s+)?summary$|^executive\s+summary$|^career\s+summary$|^profile$|^objective$|^about(\s+me)?$/i },
  {
    key: 'experience',
    labels:
      /^(work\s+)?experience$|^employment(\s+history)?$|^professional\s+experience$|^career(\s+history)?$|^relevant\s+experience$/i,
  },
  { key: 'education', labels: /^education$|^academic(\s+background)?$|^degrees?$/i },
  {
    key: 'certifications',
    labels: /^certifications?$|^credentials$|^licenses?$|^licences?$|^professional\s+development$|^training$/i,
  },
  { key: 'skills', labels: /^(technical\s+)?skills$|^core\s+competencies$|^technologies$|^tools$/i },
  { key: 'projects', labels: /^projects$|^selected\s+projects$|^key\s+projects$/i },
  { key: 'awards', labels: /^awards$|^honors$|^achievements$/i },
];

function stripHeader(line) {
  return String(line).trim().replace(/:+\s*$/, '');
}

function classifySectionHeading(line) {
  const t = stripHeader(line);
  for (const def of SECTION_DEFS) {
    if (def.labels.test(t)) return def.key;
  }
  return 'other';
}

function isLikelySectionHeader(line) {
  const t = stripHeader(line);
  if (!t || t.length > 90) return false;
  if (/^[-•*●▪]\s/.test(t)) return false;
  if (/^\d+[\).]\s/.test(t)) return false;
  if (t.includes('@') || /\(\d{3}\)/.test(t)) return false;
  if (/\b(19|20)\d{2}\b/.test(t) && (t.includes('–') || t.includes('-') || t.includes('to'))) return false;

  const key = classifySectionHeading(t);
  if (key !== 'other') return true;

  if (/^[A-Z][A-Z0-9\s/&\-:()'.]{2,}$/.test(t) && /[A-Z]{2,}/.test(t)) {
    return /\b(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|CERT|PROJECT|EMPLOY|PROFILE|OBJECTIVE|TRAINING|LICENSE|WORK|TECHNICAL|COMPETENC|VOLUNTEER|AWARD|REFEREN)/i.test(
      t
    );
  }

  return false;
}

function classifySectionLines(contentLines, sectionKey) {
  const rows = [];
  for (const line of contentLines) {
    rows.push(...classifyContentLine(line, sectionKey));
  }
  return rows;
}

export function parseResumeForDisplay(resumeText = '') {
  const normalized = normalizeResumeLayout(resumeText);
  const lines = normalized.split('\n');
  const sections = [];
  let headerLines = [];
  let current = null;
  let seenSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (current) current.contentLines.push('');
      else if (seenSection) continue;
      continue;
    }

    if (!seenSection && isLikelySectionHeader(trimmed)) {
      seenSection = true;
      const key = classifySectionHeading(trimmed);
      current = { key, heading: stripHeader(trimmed), contentLines: [], immutable: IMMUTABLE_SECTION_KEYS.has(key) };
      sections.push(current);
      continue;
    }

    if (seenSection && isLikelySectionHeader(trimmed)) {
      const key = classifySectionHeading(trimmed);
      current = { key, heading: stripHeader(trimmed), contentLines: [], immutable: IMMUTABLE_SECTION_KEYS.has(key) };
      sections.push(current);
      continue;
    }

    if (!seenSection) {
      headerLines.push(line);
      continue;
    }

    if (current) current.contentLines.push(line);
  }

  if (!sections.length && normalized.trim()) {
    sections.push({ key: 'body', heading: '', contentLines: lines.filter((l) => l.trim()), immutable: false });
    headerLines = inferHeaderFromBody(lines);
  }

  const headingStyle = sections.find((s) => s.heading)?.heading
    ? /^[A-Z][A-Z0-9\s/&\-:()'.]+$/.test(sections.find((s) => s.heading).heading.trim())
      ? 'ALL_CAPS'
      : 'TITLE_CASE'
    : 'PLAIN';

  return {
    headerLines: headerLines.map((l) => l.trimEnd()),
    sections: sections.map((s) => ({
      ...s,
      content: s.contentLines.join('\n').trim(),
      lines: classifySectionLines(s.contentLines, s.key),
    })),
    headingStyle,
  };
}

function inferHeaderFromBody(lines) {
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length < 2) return nonEmpty.slice(0, 1);

  const header = [nonEmpty[0]];
  for (let i = 1; i < Math.min(4, nonEmpty.length); i += 1) {
    const line = nonEmpty[i];
    if (
      line.includes('@') ||
      /\(\d{3}\)/.test(line) ||
      /\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(line) ||
      /linkedin|github|http/i.test(line) ||
      line.includes('|')
    ) {
      header.push(line);
    } else if (line.length < 90 && !/^[-•]/.test(line)) {
      header.push(line);
    } else {
      break;
    }
  }
  return header;
}

export function parseResumeHeader(headerLines = []) {
  const lines = headerLines.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { name: '', taglines: [], contact: [] };

  const name = lines[0];
  const taglines = [];
  const contact = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isContactLine(line)) {
      contact.push(line);
    } else if (!isLikelySectionHeader(line) && (isTaglineLine(line) || taglines.length < 2)) {
      taglines.push(line);
    } else if (!isLikelySectionHeader(line) && line.length < 140) {
      taglines.push(line);
    } else {
      contact.push(line);
    }
  }

  return { name, taglines, contact };
}

function isContactLine(line) {
  return (
    line.includes('@') ||
    /https?:\/\//i.test(line) ||
    /linkedin\.com/i.test(line) ||
    /github\.com/i.test(line) ||
    /\(\d{3}\)/.test(line) ||
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(line) ||
    /^\+?\d[\d().\s-]{8,}$/.test(line)
  );
}

function isTaglineLine(line) {
  if (isContactLine(line)) return false;
  if (line.includes('|')) return true;
  return /engineer|architect|manager|developer|analyst|consultant|specialist|lead|director/i.test(line);
}

export function isSkillsTagline(text) {
  const t = String(text || '');
  if (!t.includes('|')) return false;
  const techHits = (t.match(/\b(Azure|AWS|GCP|Kubernetes|Terraform|Docker|Python|Java|CKA|DevOps|Databricks)\b/gi) || [])
    .length;
  return techHits >= 2;
}

export function classifyContentLine(line, sectionKey = '') {
  const raw = String(line);
  const t = raw.trim();
  if (!t) return [{ type: 'spacer' }];

  if (/^[-•*●▪◦]\s/.test(t)) {
    return [{ type: 'bullet', text: t.replace(/^[-•*●▪◦]\s+/, ''), indent: raw.match(/^\s*/)?.[0]?.length || 0 }];
  }

  if (/^\d+[\).]\s/.test(t)) {
    return [{ type: 'bullet', text: t.replace(/^\d+[\).]\s+/, ''), ordered: true }];
  }

  if (
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/i.test(t) ||
    /\b(19|20)\d{2}\s*[–\-—]\s*(Present|Current|Now|\d{4})/i.test(t)
  ) {
    if (t.length < 90) return [{ type: 'date', text: t }];
  }

  if ((/\|/.test(t) || /\s—\s/.test(t) || / - [A-Z]/.test(t)) && t.length < 160 && !/^[-•]/.test(t)) {
    if (!/^https?:\/\//i.test(t)) {
      return [{ type: 'job-header', text: t }];
    }
  }

  // Skills / certs: pipe or comma separated → single styled line
  if (sectionKey === 'skills' || sectionKey === 'certifications' || sectionKey === 'credentials') {
    if (t.includes('|') && t.length < 320) {
      return [{ type: 'pipe-line', text: t }];
    }
    if (t.includes(',') && t.length < 320) {
      const parts = t.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.every((p) => p.length < 55)) {
        return [{ type: 'pipe-line', text: parts.join(' | ') }];
      }
    }
  }

  // Long paragraph in body — split into sentences for readability
  if (t.length > 220 && sectionKey === 'summary') {
    const sentences = t.match(/[^.!?]+[.!?]+/g) || [t];
    if (sentences.length > 1) {
      return sentences.map((s) => ({ type: 'text', text: s.trim() })).filter((r) => r.text);
    }
  }

  return [{ type: 'text', text: t }];
}

export function splitContactParts(line) {
  return String(line)
    .split(/\s*[|•·]\s*|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
