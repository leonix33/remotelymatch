const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\b/i;

const TITLE_PREFIX_RE = /^(Senior|Staff|Principal|Lead|Associate|Junior|Chief|Head|VP|Director|Cloud|Platform|DevOps|SRE)$/i;

const ACTION_VERBS =
  'Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Established|Reduced|Improved|Automated|Deployed|Migrated|Optimized|Coordinated|Directed|Spearheaded|Delivered|Streamlined|Standardized|Maintained|Supported|Executed|Configured|Integrated|Partnered|Drove|Owned|Introduced|Championed|Facilitated|Engineered|Operationalized|Hardened|Monitored|Troubleshot|Resolved|Scaled|Transformed|Collaborated|Authored|Defined';

export function mergeOrphanPrefixLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = String(lines[i] || '').trim();
    if (!t) {
      out.push('');
      continue;
    }
    const next = String(lines[i + 1] || '').trim();
    if (TITLE_PREFIX_RE.test(t) && next && !DATE_RANGE_RE.test(t)) {
      out.push(`${t} ${next}`);
      i += 1;
    } else {
      out.push(t);
    }
  }
  return out;
}

export function tryParseJobBlock(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 12) return null;

  const dateMatch = t.match(DATE_RANGE_RE);
  if (!dateMatch || dateMatch.index === undefined) return null;

  const title = t.slice(0, dateMatch.index).trim().replace(/[,\-–—]\s*$/, '');
  const dates = `${dateMatch[1]} – ${dateMatch[2]}`;
  let remainder = t.slice(dateMatch.index + dateMatch[0].length).trim().replace(/^[|,\-–—]\s*/, '');

  if (!title || title.length > 120) return null;

  let company = remainder;
  let tags = [];

  if (remainder.includes('|')) {
    const parts = remainder.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    company = parts[0] || remainder;
    tags = parts.slice(1);
  } else if (remainder.includes(' — ')) {
    const [co, rest] = remainder.split(/\s+—\s+/);
    company = co.trim();
    if (rest) tags = [rest];
  }

  return {
    type: 'job-block',
    title,
    dates,
    company,
    tags,
  };
}

export function splitParagraphToBullets(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 80) return null;

  const bySentence = t.split(/(?<=[.!?])\s+(?=[A-Z(])/);
  if (bySentence.length >= 2) {
    const bullets = bySentence.map((s) => s.trim().replace(/^[-•*●▪◦]\s+/, '')).filter((s) => s.length > 20);
    if (bullets.length >= 2) {
      return bullets.map((text) => ({ type: 'bullet', text }));
    }
  }

  const actionRe = new RegExp(`(?<=[.!?]\\s+|^)(${ACTION_VERBS})\\b`, 'g');
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = actionRe.exec(t)) !== null) {
    if (match.index > lastIndex + 30) {
      parts.push(t.slice(lastIndex, match.index).trim());
    }
    lastIndex = match.index;
  }
  if (lastIndex < t.length) {
    parts.push(t.slice(lastIndex).trim());
  }

  const cleaned = parts.map((p) => p.replace(/^[-•*●▪◦]\s+/, '').trim()).filter((p) => p.length > 25);
  if (cleaned.length >= 2) {
    return cleaned.map((text) => ({ type: 'bullet', text }));
  }

  return null;
}

export function parseJobHeaderLine(text) {
  if (text.includes('|')) {
    const parts = text.split(/\s*\|\s*/);
    const title = parts[0].trim();
    const meta = parts.slice(1).join(' | ');
    return { type: 'job-block', title, dates: '', company: meta, tags: [] };
  }
  if (/\s—\s/.test(text)) {
    const [title, company] = text.split(/\s—\s/).map((s) => s.trim());
    return { type: 'job-block', title, dates: '', company, tags: [] };
  }
  return { type: 'job-block', title: text, dates: '', company: '', tags: [] };
}
