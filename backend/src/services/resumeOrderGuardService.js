const { parseResumeStructure, reassembleResume } = require('./resumeStructureService');

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionContentByHeading(text, heading, allHeadings = []) {
  if (!heading) return '';
  const headingRe = new RegExp(`(?:^|\\n)(${escapeRegExp(heading)})\\s*\\n`, 'i');
  const match = String(text || '').match(headingRe);
  if (!match) return '';

  const start = match.index + match[0].length;
  let end = text.length;

  for (const other of allHeadings) {
    if (!other || other.toLowerCase() === heading.toLowerCase()) continue;
    const re = new RegExp(`(?:^|\\n)${escapeRegExp(other)}\\s*\\n`, 'gi');
    const after = text.slice(start);
    let next;
    while ((next = re.exec(after)) !== null) {
      if (start + next.index < end) {
        end = start + next.index;
        break;
      }
    }
  }

  return text.slice(start, end).trim();
}

function tokenOverlapScore(a, b) {
  const wa = new Set(String(a).toLowerCase().split(/\W+/).filter((t) => t.length > 4));
  const wb = new Set(String(b).toLowerCase().split(/\W+/).filter((t) => t.length > 4));
  if (!wa.size || !wb.size) return 0;
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits += 1;
  return hits / Math.max(wa.size, wb.size);
}

/**
 * Reject summaries that invent a different career (e.g. "Design Engineer" + PostgreSQL
 * when the profile is a Platform Engineer). Keeps tailored wording only when grounded.
 */
function guardTailoredSummary(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const summarySection = structure.sections.find((s) => s.key === 'summary');
  if (!summarySection?.heading || !summarySection.content) return tailoredText;

  const headings = structure.sections.map((s) => s.heading).filter(Boolean);
  const tailoredSummary = extractSectionContentByHeading(
    tailoredText,
    summarySection.heading,
    headings
  );
  if (!tailoredSummary) return tailoredText;

  const originalSummary = summarySection.content;
  const overlap = tokenOverlapScore(originalSummary, tailoredSummary);

  const profileBlob = `${originalResume} ${originalSummary}`.toLowerCase();
  const tailoredLower = tailoredSummary.toLowerCase();

  const inventedRoleTerms = [
    'design engineer',
    'product designer',
    'ui designer',
    'ux designer',
    'frontend developer',
    'full stack developer',
    'software engineer ii',
    'postgresql',
    'figma',
    'sketch',
    'react native',
    'ruby on rails',
  ];

  const hasInventedRole = inventedRoleTerms.some(
    (term) => tailoredLower.includes(term) && !profileBlob.includes(term)
  );

  if (overlap < 0.12 || hasInventedRole) {
    const headingRe = new RegExp(`(${escapeRegExp(summarySection.heading)}\\s*\\n)`, 'i');
    const match = tailoredText.match(headingRe);
    if (!match) return tailoredText;
    const startIdx = match.index + match[0].length;
    let endIdx = tailoredText.length;
    for (const other of headings) {
      if (other === summarySection.heading) continue;
      const re = new RegExp(`${escapeRegExp(other)}\\s*\\n`, 'i');
      const next = tailoredText.slice(startIdx).match(re);
      if (next?.index != null && startIdx + next.index < endIdx) {
        endIdx = startIdx + next.index;
      }
    }
    return `${tailoredText.slice(0, startIdx)}${originalSummary}${tailoredText.slice(endIdx)}`.trim();
  }

  return tailoredText;
}

/**
 * Force section order and spacing to match the candidate's original resume structure.
 * Fixes AI output that places EXPERIENCE after EDUCATION/CERTIFICATIONS.
 */
function rebuildResumeInOriginalOrder(originalResume, tailoredText) {
  const structure = parseResumeStructure(originalResume);
  const headings = structure.sections.map((s) => s.heading).filter(Boolean);

  const sectionOutputs = structure.sections.map((section) => {
    if (section.immutable) {
      return { heading: section.heading, content: section.content };
    }
    let extracted = extractSectionContentByHeading(tailoredText, section.heading, headings);
    if (section.key === 'education' && extracted) {
      extracted = dedupeEducationLines(extracted);
    }
    return {
      heading: section.heading,
      content: extracted || section.content,
    };
  });

  return fixGluedSectionHeadings(reassembleResume(structure, sectionOutputs), structure);
}

function fixGluedSectionHeadings(text, structure) {
  let out = String(text || '');
  for (const section of structure.sections) {
    const heading = section.heading;
    if (!heading || heading.length < 4) continue;
    const re = new RegExp(`([^\\n\\s])(${escapeRegExp(heading)})\\s*\\n`, 'gi');
    out = out.replace(re, '$1\n\n$2\n');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function dedupeEducationLines(content) {
  const seen = new Set();
  return String(content || '')
    .split('\n')
    .filter((line) => {
      const key = line.trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .trim();
}

function ensureSectionSpacing(text, structure) {
  let out = String(text || '').trim();
  for (const section of structure.sections) {
    if (!section.heading || section.heading.length < 4) continue;
    const heading = escapeRegExp(section.heading);
    out = out.replace(new RegExp(`([^\\n\\s])\n(${heading})\\s*\\n`, 'gi'), '$1\n\n$2\n');
    out = out.replace(new RegExp(`([^\\n\\s])(${heading})\\s*\\n`, 'gi'), '$1\n\n$2\n');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  extractSectionContentByHeading,
  guardTailoredSummary,
  rebuildResumeInOriginalOrder,
  ensureSectionSpacing,
  fixGluedSectionHeadings,
};
