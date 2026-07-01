/**
 * Fix broken line breaks in pasted/extracted resumes before section parsing.
 */

const FALSE_MID_SENTENCE_HEADERS = new Set(['EXPERIENCE', 'CERTIFICATION', 'SKILLS', 'TOOLS', 'EDUCATION']);
const SECTION_HEADER_WORDS = new Set([
  'EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
  'CERTIFICATION',
  'TOOLS',
  'SKILLS',
  'SUMMARY',
  'PROFILE',
  'PROJECTS',
  'AWARDS',
]);

function endsIncomplete(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/[.!?]$/.test(t)) return false;
  return /\b(of|and|with|for|in|to|the|a|an|Extensive|including)$/i.test(t) || t.length < 120;
}

function startsContinuation(line) {
  return /^[a-z(]/.test(String(line || '').trim());
}

function repairFalseSectionBreaks(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    const prev = out.length ? out[out.length - 1].trim() : '';
    const next = (lines[i + 1] || '').trim();
    const upper = t.toUpperCase();

    if (FALSE_MID_SENTENCE_HEADERS.has(upper) && t.length < 40) {
      if (upper === 'EXPERIENCE' && /\bof$/i.test(prev) && startsContinuation(next)) {
        out[out.length - 1] = `${prev} ${next}`;
        i += 1;
        continue;
      }
      if (upper === 'CERTIFICATION' && /\bExtensive$/i.test(prev) && /^portfolio/i.test(next)) {
        out[out.length - 1] = `${prev} certification ${next}`;
        i += 1;
        continue;
      }
      if (upper === 'TOOLS' && (startsContinuation(next) || /\b(scanning|integrating|security)$/i.test(prev))) {
        out[out.length - 1] = `${prev} ${next}`.trim();
        i += 1;
        continue;
      }
      if (endsIncomplete(prev) && startsContinuation(next)) {
        out[out.length - 1] = `${prev} ${next}`;
        i += 1;
        continue;
      }
      if (upper === 'TOOLS' && next && /\b(as measured by|Cloud Engineer|DevOps Engineer)\b/i.test(next)) {
        if (prev) out[out.length - 1] = `${prev} ${next}`.trim();
        else out.push(next);
        i += 1;
        continue;
      }
    }

    out.push(raw);
  }
  return out;
}

function repairSplitNameLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] || '').trim();
    const next = (lines[i + 1] || '').trim();

    if (SECTION_HEADER_WORDS.has(t.toUpperCase())) {
      out.push(lines[i]);
      continue;
    }

    if (/^[A-Z]{2,20}$/.test(t) && /^[A-Z][A-Za-z'-]+\s+/.test(next)) {
      const parts = next.split(/\s+/);
      const surname = parts[0];
      const rest = parts.slice(1).join(' ');
      out.push(`${t} ${surname}`);
      if (rest) out.push(rest);
      i += 1;
      continue;
    }

    if (/^[A-Z]{2,20}$/.test(t) && /^[A-Z]{2,20}$/.test(next)) {
      out.push(`${t} ${next}`);
      i += 1;
      continue;
    }

    out.push(lines[i]);
  }
  return out;
}

function repairResumeLines(lines) {
  let fixed = [...lines];
  fixed = repairSplitNameLines(fixed);
  fixed = repairFalseSectionBreaks(fixed);
  return fixed;
}

function isSpuriousToolsContent(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^(into|and|or|by|with)\b/i.test(t)) return true;
  if (/\b(as measured by|by configuring|by building|by implementing|by designing)\b/i.test(t)) return true;
  if (/\b(Cloud|DevOps|Platform|Senior)\s+.*\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)) return true;
  if (/\b(Engineer|DevOps)\b.*\b(19|20)\d{2}\b/i.test(t)) return true;
  if (t.length > 250 && /\b(managed|built|implemented|supported|architected|operated)\b/i.test(t)) return true;
  if (t.length > 120 && /\b(as measured by|into CI\/CD|ensuring|establishing)\b/i.test(t)) return true;
  if (t.length < 400 && !/\b(as measured by)\b/i.test(t)) {
    const commaCount = (t.match(/,/g) || []).length;
    if (commaCount >= 4 && t.split(',').every((part) => part.trim().length < 50)) return false;
  }
  return false;
}

function isFalseToolsHeader(lines, lineIndex) {
  let next = '';
  for (let j = lineIndex + 1; j < lines.length; j += 1) {
    next = String(lines[j] || '').trim();
    if (next) break;
  }
  if (!next) return false;
  if (/^[a-z(]/.test(next)) return true;
  if (isSpuriousToolsContent(next)) return true;
  return false;
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

function repairResumeText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return repairResumeLines(lines).join('\n');
}

function prepareResumeTextForParsing(text) {
  const { normalizeResumeLayout } = require('./resumeLayoutService');
  const { insertExperienceBulletBreaks } = require('./resumeCarBulletService');
  const { sanitizeResumeText } = require('./resumeSanitizeService');
  const normalized = normalizeResumeLayout(repairResumeText(text));
  const dechunked = insertExperienceBulletBreaks(normalized);
  return sanitizeResumeText(repairResumeText(dechunked));
}

module.exports = {
  repairResumeText,
  repairResumeLines,
  isSpuriousToolsContent,
  isFalseToolsHeader,
  reconcileSpuriousToolsSections,
  prepareResumeTextForParsing,
};
