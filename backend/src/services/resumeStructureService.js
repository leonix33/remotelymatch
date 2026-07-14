/**
 * Parse a plain-text resume into ordered sections while preserving original headings.
 */

const { prepareResumeTextForParsing, isFalseToolsHeader, reconcileSpuriousToolsSections, isSpuriousToolsContent } = require('./resumeRepairService');

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
  { key: 'publications', labels: /^publications$|^patents$/i },
  { key: 'volunteer', labels: /^volunteer(ing)?$|^community$/i },
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
    return /\b(EXPERIENCE|EDUCATION|SKILLS|SUMMARY|CERT|PROJECT|EMPLOY|PROFILE|OBJECTIVE|TRAINING|LICENSE|WORK|TECHNICAL|COMPETENC|VOLUNTEER|AWARD)/i.test(
      t
    );
  }

  return false;
}

function detectHeadingStyle(line) {
  const t = line.trim();
  if (/^[A-Z][A-Z0-9\s/&\-:()'.]+$/.test(t)) return 'ALL_CAPS';
  if (/^[A-Z]/.test(t)) return 'TITLE_CASE';
  return 'PLAIN';
}

function parseResumeStructure(resumeText = '') {
  const repaired = prepareResumeTextForParsing(resumeText);
  const lines = repaired.replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let headerLines = [];
  let current = null;
  let seenSection = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    if (!seenSection && isLikelySectionHeader(trimmed, lines, lineIdx)) {
      seenSection = true;
      const key = classifySectionHeading(trimmed);
      current = {
        key,
        heading: stripHeader(trimmed),
        contentLines: [],
        immutable: IMMUTABLE_SECTION_KEYS.has(key),
      };
      sections.push(current);
      continue;
    }

    if (seenSection && isLikelySectionHeader(trimmed, lines, lineIdx)) {
      const key = classifySectionHeading(trimmed);
      current = {
        key,
        heading: stripHeader(trimmed),
        contentLines: [],
        immutable: IMMUTABLE_SECTION_KEYS.has(key),
      };
      sections.push(current);
      continue;
    }

    if (!seenSection) {
      if (trimmed || headerLines.length) headerLines.push(line);
      continue;
    }

    if (trimmed.toUpperCase() === 'TOOLS' && isFalseToolsHeader(lines, lineIdx)) {
      continue;
    }

    if (current) current.contentLines.push(line);
  }

  if (!sections.length && repaired.trim()) {
    sections.push({
      key: 'body',
      heading: '',
      contentLines: lines,
      immutable: false,
    });
    headerLines = [];
  }

  const reconciled = reconcileSpuriousToolsSections(sections).filter((s) => {
    if (s.key !== 'tools') return true;
    const content = s.contentLines.join('\n').trim();
    return content.length > 0 && !isSpuriousToolsContent(content);
  });

  const headingStyle = reconciled.find((s) => s.heading)?.heading
    ? detectHeadingStyle(reconciled.find((s) => s.heading).heading)
    : 'PLAIN';

  return {
    headerLines: headerLines.map((l) => l.trimEnd()),
    sections: reconciled.map((s) => {
      let content = s.contentLines.join('\n').trim();
      if (s.key === 'education') {
        const { cleanEducationSectionContent } = require('./resumeExperiencePreserveService');
        content = cleanEducationSectionContent(content);
      }
      return {
        ...s,
        content,
      };
    }),
    sectionOrder: reconciled.map((s) => s.key),
    headingStyle,
  };
}

function describeStructureForPrompt(structure) {
  const lines = ['RESUME STRUCTURE (keep this exact order and headings):'];

  if (structure.headerLines.filter((l) => l.trim()).length) {
    lines.push(
      `- [CONTACT HEADER] — copy exactly: name on line 1, pipe-separated title/tagline lines below, then email/phone/links. Do not merge into one paragraph.`
    );
  }

  for (const section of structure.sections) {
    const label = section.heading || section.key.toUpperCase();
    if (section.immutable) {
      lines.push(`- [${section.key.toUpperCase()}] "${label}" — COPY VERBATIM, no edits`);
    } else if (section.key === 'experience') {
      lines.push(
        `- [EXPERIENCE] "${label}" — keep EVERY employer; target ~10 accomplishment bullets per role (expand from real accomplishments when the original has fewer); copy titles, dates, and companies verbatim; rewrite bullet wording only to match the target job`
      );
    } else if (section.key === 'summary') {
      lines.push(
        `- [SUMMARY] "${label}" — keep the candidate's real role and employers; weave a few JD keywords only; never invent a different job title or career path`
      );
    } else {
      lines.push(`- [${section.key.toUpperCase()}] "${label}" — light edits only; keep facts and layout`);
    }
  }

  return lines.join('\n');
}

function reassembleResume(structure, sectionOutputs) {
  const byHeading = new Map();
  for (const row of sectionOutputs || []) {
    if (row?.heading) byHeading.set(row.heading.trim(), String(row.content || '').trim());
  }

  const parts = [];
  const header = structure.headerLines.join('\n').trim();
  if (header) parts.push(header);

  for (const section of structure.sections) {
    const heading = section.heading.trim();
    let content;
    if (section.immutable) {
      content = section.content;
    } else {
      content = byHeading.get(heading);
      if (content === undefined) {
        content = byHeading.get(section.key) || section.content;
      }
    }
    if (!content && !heading) continue;
    if (heading) {
      parts.push(content ? `${heading}\n${content}` : heading);
    } else if (content) {
      parts.push(content);
    }
  }

  return parts.join('\n\n').trim();
}

function normalizeForMatch(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function lineAppearsInResume(line, resumeText) {
  const needle = normalizeForMatch(line);
  if (!needle || needle.length < 4) return true;
  const hay = normalizeForMatch(resumeText);
  if (hay.includes(needle)) return true;
  const tokens = needle.split(' ').filter((t) => t.length > 3);
  if (tokens.length < 2) return hay.includes(needle);
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length >= 0.85;
}

function findMissingPreservedLines(preservedLines, tailoredText) {
  return preservedLines.filter((line) => !lineAppearsInResume(line, tailoredText));
}

function injectMissingIntoSection(tailoredText, structure, missingLines) {
  if (!missingLines.length) return tailoredText;

  const certSection = structure.sections.find((s) =>
    ['certifications', 'credentials', 'education', 'training'].includes(s.key)
  );
  const certHeading = certSection?.heading || 'CERTIFICATIONS';
  const block = missingLines.join('\n');

  if (tailoredText.toLowerCase().includes(certHeading.toLowerCase())) {
    const re = new RegExp(`(${certHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)`, 'i');
    if (re.test(tailoredText)) {
      return tailoredText.replace(re, `$1${block}\n`);
    }
  }

  return `${tailoredText.trim()}\n\n${certHeading}\n${block}`;
}

function structureToSectionPayload(structure) {
  return structure.sections.map((s) => ({
    key: s.key,
    heading: s.heading,
    content: s.content,
    immutable: s.immutable,
  }));
}

module.exports = {
  IMMUTABLE_SECTION_KEYS,
  parseResumeStructure,
  describeStructureForPrompt,
  reassembleResume,
  findMissingPreservedLines,
  injectMissingIntoSection,
  structureToSectionPayload,
  lineAppearsInResume,
  isLikelySectionHeader,
};
