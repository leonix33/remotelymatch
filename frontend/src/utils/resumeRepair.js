/**
 * Fix broken line breaks in pasted/extracted resumes before section parsing.
 */

import { normalizeResumeLayout } from './resumeLayout';
import { insertExperienceBulletBreaks } from './resumeExperienceParser';

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

export function repairFalseSectionBreaks(lines) {
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

export function repairSplitNameLines(lines) {
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

export function separateHeaderFromContact(lines) {
  const out = [];
  for (const line of lines) {
    const t = String(line || '').trim();
    if (!t) {
      out.push('');
      continue;
    }

    const emailMatch = t.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const phoneMatch = t.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    const hasUrl = /(?:https?:\/\/|linkedin\.com|github\.com|leonix\.)/i.test(t);

    if ((emailMatch || phoneMatch || hasUrl) && (t.includes('|') || t.length > 50)) {
      let remainder = t;
      if (emailMatch) {
        remainder = remainder.replace(emailMatch[0], '').trim();
        out.push(emailMatch[0]);
      }
      if (phoneMatch) {
        remainder = remainder.replace(phoneMatch[0], '').trim();
        out.push(phoneMatch[0]);
      }
      const urlParts = remainder.match(/(?:https?:\/\/\S+|linkedin\.com\/\S+|github\.com\/\S+|leonix\.\S+)/gi) || [];
      for (const url of urlParts) {
        remainder = remainder.replace(url, '').trim();
        out.push(url);
      }
      const location = remainder.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/);
      if (location) {
        remainder = remainder.replace(location[0], '').trim();
        out.push(location[0]);
      }
      remainder = remainder.replace(/\|\s*$/g, '').replace(/^\|\s*/g, '').trim();
      if (remainder && !/^(CKA|GenAI)/i.test(remainder)) {
        out.push(remainder);
      } else if (remainder) {
        out.push(remainder);
      }
      continue;
    }

    out.push(line);
  }
  return out;
}

export function repairResumeLines(lines) {
  let fixed = [...lines];
  fixed = repairSplitNameLines(fixed);
  fixed = repairFalseSectionBreaks(fixed);
  fixed = separateHeaderFromContact(fixed);
  return fixed;
}

export function repairResumeText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return repairResumeLines(lines).join('\n');
}

export function prepareResumeTextForParsing(text) {
  const normalized = normalizeResumeLayout(repairResumeText(text));
  const dechunked = insertExperienceBulletBreaks(normalized);
  return repairResumeText(dechunked);
}
