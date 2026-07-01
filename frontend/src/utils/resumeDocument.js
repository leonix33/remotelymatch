import { prepareResumeTextForParsing } from './resumeRepair';
import {
  parseExperienceSectionLines,
  parseSkillsSectionLines,
  parseToolsSectionLines,
  parseEducationSectionLines,
  parseCertificationsSectionLines,
  isSpuriousToolsContent,
  isFalseToolsHeader,
} from './resumeSectionParsers';
import { splitParagraphToBullets } from './resumeExperienceParser';

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
  { key: 'skills', labels: /^(technical\s+)?skills$|^core\s+competencies$|^technologies$/i },
  { key: 'tools', labels: /^tools$/i },
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

function isLikelySectionHeader(line, lines = null, lineIndex = -1) {
  const t = stripHeader(line);
  if (!t || t.length > 90) return false;
  if (/^[-•*●▪]\s/.test(t)) return false;
  if (/^\d+[\).]\s/.test(t)) return false;
  if (t.includes('@') || /\(\d{3}\)/.test(t)) return false;
  if (/\b(19|20)\d{2}\b/.test(t) && (t.includes('–') || t.includes('-') || t.includes('to'))) return false;

  // Mid-sentence false breaks — only when the next line continues lowercase prose
  if (t.toUpperCase() === 'EXPERIENCE' && t.length < 20 && lines && lineIndex >= 0) {
    let next = '';
    for (let j = lineIndex + 1; j < lines.length; j += 1) {
      next = String(lines[j] || '').trim();
      if (next) break;
    }
    if (/^[a-z(]/.test(next)) return false;
  }
  if (t.toUpperCase() === 'CERTIFICATION' && t.length < 25 && lines && lineIndex >= 0) {
    let next = '';
    for (let j = lineIndex + 1; j < lines.length; j += 1) {
      next = String(lines[j] || '').trim();
      if (next) break;
    }
    if (/^portfolio/i.test(next)) return false;
  }
  if (
    t.toUpperCase() === 'TOOLS' &&
    t.length < 20 &&
    lines &&
    lineIndex >= 0 &&
    isFalseToolsHeader(lines, lineIndex)
  ) {
    return false;
  }

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
  if (sectionKey === 'experience') return parseExperienceSectionLines(contentLines);
  if (sectionKey === 'skills') return parseSkillsSectionLines(contentLines);
  if (sectionKey === 'tools') return parseToolsSectionLines(contentLines);
  if (sectionKey === 'education') return parseEducationSectionLines(contentLines);
  if (sectionKey === 'certifications' || sectionKey === 'credentials') {
    return parseCertificationsSectionLines(contentLines);
  }
  if (sectionKey === 'summary') {
    const text = contentLines.map((l) => String(l).trim()).filter(Boolean).join(' ');
    if (text.length > 200) {
      const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
      if (parts.length >= 2) {
        return parts.map((p) => ({ type: 'text', text: p.trim() })).filter((r) => r.text.length > 20);
      }
    }
  }

  const rows = [];
  for (const line of contentLines) {
    rows.push(...classifyContentLine(line, sectionKey));
  }
  return rows;
}

function reconcileSpuriousToolsSections(sections) {
  const out = [];

  for (const section of sections) {
    if (section.key !== 'tools') {
      out.push(section);
      continue;
    }

    const content = section.contentLines.join('\n').trim();
    if (!isSpuriousToolsContent(content)) {
      out.push(section);
      continue;
    }

    let experience = null;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i].key === 'experience') {
        experience = out[i];
        break;
      }
    }

    if (experience) {
      const merged = section.contentLines.filter((l) => String(l).trim());
      if (merged.length) experience.contentLines.push(...merged);
    } else {
      out.push({
        key: 'experience',
        heading: 'Professional Experience',
        contentLines: section.contentLines.filter((l) => String(l).trim()),
        immutable: false,
      });
    }
  }

  return out;
}

export function parseResumeForDisplay(resumeText = '') {
  const repaired = prepareResumeTextForParsing(resumeText);
  const lines = repaired.split('\n');
  const sections = [];
  let headerLines = [];
  let current = null;
  let seenSection = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    if (!trimmed) {
      if (current) current.contentLines.push('');
      else if (seenSection) continue;
      continue;
    }

    if (!seenSection && isLikelySectionHeader(trimmed, lines, lineIdx)) {
      seenSection = true;
      const key = classifySectionHeading(trimmed);
      current = { key, heading: stripHeader(trimmed), contentLines: [], immutable: IMMUTABLE_SECTION_KEYS.has(key) };
      sections.push(current);
      continue;
    }

    if (seenSection && isLikelySectionHeader(trimmed, lines, lineIdx)) {
      const key = classifySectionHeading(trimmed);
      current = { key, heading: stripHeader(trimmed), contentLines: [], immutable: IMMUTABLE_SECTION_KEYS.has(key) };
      sections.push(current);
      continue;
    }

    if (!seenSection) {
      headerLines.push(line);
      continue;
    }

    if (trimmed.toUpperCase() === 'TOOLS' && isFalseToolsHeader(lines, lineIdx)) {
      continue;
    }

    if (current) current.contentLines.push(line);
  }

  if (!sections.length && repaired.trim()) {
    sections.push({ key: 'body', heading: '', contentLines: lines.filter((l) => l.trim()), immutable: false });
    headerLines = inferHeaderFromBody(lines);
  }

  const reconciled = reconcileSpuriousToolsSections(sections).filter((s) => {
    if (s.key !== 'tools') return true;
    return s.contentLines.join('\n').trim().length > 0 && !isSpuriousToolsContent(s.contentLines.join('\n'));
  });

  const headingStyle = reconciled.find((s) => s.heading)?.heading
    ? /^[A-Z][A-Z0-9\s/&\-:()'.]+$/.test(reconciled.find((s) => s.heading).heading.trim())
      ? 'ALL_CAPS'
      : 'TITLE_CASE'
    : 'PLAIN';

  return {
    headerLines: headerLines.map((l) => l.trimEnd()),
    sections: reconciled.map((s) => ({
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
    if (isLikelySectionHeader(line)) break;

    const email = line.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
    const phone = line.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0];
    const urls = line.match(/(?:https?:\/\/\S+|linkedin\.com\/\S+|github\.com\/\S+|leonix\.\S+)/gi) || [];
    const location = line.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/)?.[0];

    if (email || phone || urls.length || location) {
      if (email) contact.push(email);
      if (phone) contact.push(phone);
      contact.push(...urls);
      if (location) contact.push(location);
      const leftover = line
        .replace(email || '', '')
        .replace(phone || '', '')
        .replace(location || '', '')
        .replace(/(?:https?:\/\/\S+|linkedin\.com\/\S+|github\.com\/\S+|leonix\.\S+)/gi, '')
        .trim();
      if (leftover && /^CKA$/i.test(leftover) && !taglines.join(' ').includes('CKA')) {
        taglines.push('CKA');
      }
      continue;
    }

    if (line.includes('|') && taglines.length < 3) {
      const parts = line.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/.test(part)) {
          contact.push(part.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/)[0]);
          const rest = part.replace(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/, '').trim();
          if (rest && taglines.length < 3) taglines.push(rest);
        } else if (part.length < 90) {
          taglines.push(part);
        }
      }
    } else if (line.length < 100 && taglines.length < 3) {
      taglines.push(line);
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

  // Long experience paragraphs → bullets
  if (t.length > 100 && sectionKey === 'experience') {
    const bullets = splitParagraphToBullets(t);
    if (bullets) return bullets;
  }

  // Long paragraph in summary — split into sentences
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
    .filter((p) => p.length > 0);
}
