const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\b/i;

const TITLE_PREFIX_RE = /^(Senior|Staff|Principal|Lead|Associate|Junior|Chief|Head|VP|Director|Cloud|Platform|DevOps|SRE)$/i;

const ACTION_VERBS =
  'Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Established|Reduced|Improved|Automated|Deployed|Migrated|Optimized|Coordinated|Directed|Spearheaded|Delivered|Streamlined|Standardized|Maintained|Supported|Executed|Configured|Integrated|Partnered|Drove|Owned|Introduced|Championed|Facilitated|Engineered|Operationalized|Hardened|Monitored|Troubleshot|Resolved|Scaled|Transformed|Collaborated|Authored|Defined|Enhanced|Enforced|Participated|Conducted|Operated';

const ACTION_START_RE = new RegExp(
  `\\s+(${ACTION_VERBS.split('|').slice(0, 16).join('|')}|DevOps Engineer|Cloud Engineer\\/)`
);

const CAR_MEASURED_RE = /,?\s*as measured by\s+/i;
const CAR_BY_RE =
  /,?\s*by\s+(?=(?:designing|implementing|building|integrating|automating|establishing|managing|configuring|hardening|enforcing|optimizing|supporting|conducting|participating|strengthening|ensuring|developing|architecting))/i;

const MAX_BULLET_CHARS = 340;
const ACTION_SPLIT_RE = new RegExp(`(?<=\\.)\\s+(?=(?:${ACTION_VERBS})\\b)`, 'g');

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

  let bodyText = '';
  const actionSplit = remainder.search(ACTION_START_RE);
  if (actionSplit > 0) {
    bodyText = remainder.slice(actionSplit).trim();
    remainder = remainder.slice(0, actionSplit).trim().replace(/\|\s*$/, '');
  }

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

  const block = {
    type: 'job-block',
    title,
    dates,
    company,
    tags,
  };

  if (bodyText.length > 60) {
    block.bodyText = bodyText;
  }

  return block;
}

function trimToReadable(text = '') {
  const t = String(text).trim();
  if (t.length <= MAX_BULLET_CHARS) return t;
  const cut = t.slice(0, MAX_BULLET_CHARS);
  const lastPeriod = cut.lastIndexOf('.');
  if (lastPeriod > 70) return cut.slice(0, lastPeriod + 1);
  const lastComma = cut.lastIndexOf(',');
  if (lastComma > 70) return `${cut.slice(0, lastComma)}.`;
  return `${cut.replace(/\s+\S*$/, '').trim()}…`;
}

export function condenseCarBullet(text = '') {
  let t = String(text).trim().replace(/^[-•*●▪◦]\s+/, '');
  if (!t) return t;

  const measuredIdx = t.search(CAR_MEASURED_RE);
  if (measuredIdx > 35) {
    const action = t.slice(0, measuredIdx).trim().replace(/,\s*$/, '');
    const tail = t.slice(measuredIdx).replace(CAR_MEASURED_RE, '');
    const byIdx = tail.search(CAR_BY_RE);
    const metricRaw = (byIdx >= 0 ? tail.slice(0, byIdx) : tail).trim().replace(/[,.]\s*$/, '');
    const byClause =
      byIdx >= 0 ? tail.slice(byIdx).replace(CAR_BY_RE, '').trim().split(/[.!?]/)[0]?.trim() : '';

    let result = action;
    if (metricRaw) {
      result = `${action} — ${metricRaw.replace(/[,.]\s*$/, '')}`;
    }
    if (byClause && byClause.length > 20 && byClause.length < 120) {
      result = `${result}, ${byClause.replace(/^by\s+/i, '')}`;
    }
    result = trimToReadable(`${result}.`.replace(/\s{2,}/g, ' '));
    return result.length > 40 ? result : trimToReadable(`${action}.`);
  }

  if (t.length > MAX_BULLET_CHARS) {
    const byIdx = t.search(CAR_BY_RE);
    if (byIdx > 80) {
      return trimToReadable(`${t.slice(0, byIdx).trim().replace(/,\s*$/, '')}.`);
    }
    return trimToReadable(t);
  }

  return t;
}

function splitOnActionBoundaries(text = '') {
  const t = String(text).trim();
  if (!t) return [];

  const parts = t.split(ACTION_SPLIT_RE).map((p) => p.trim()).filter((p) => p.length > 25);
  if (parts.length >= 2) return parts;

  const actionRe = new RegExp(`(?<=[.!?]\\s+|^)(${ACTION_VERBS})\\b`, 'g');
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = actionRe.exec(t)) !== null) {
    if (match.index > lastIndex + 30) {
      segments.push(t.slice(lastIndex, match.index).trim());
    }
    lastIndex = match.index;
  }
  if (lastIndex < t.length) {
    segments.push(t.slice(lastIndex).trim());
  }

  const cleaned = segments.filter((p) => p.length > 25);
  return cleaned.length >= 2 ? cleaned : [t];
}

export function splitExperienceParagraph(text = '') {
  const t = String(text).trim();
  if (!t || t.length < 60) return null;

  const segments = splitOnActionBoundaries(t);
  const bullets = segments
    .map((s) => condenseCarBullet(s))
    .filter((s) => s.length > 20);

  if (bullets.length >= 1) {
    return bullets.map((text) => ({ type: 'bullet', text }));
  }
  return null;
}

export function splitParagraphToBullets(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 80) return null;

  if (/\bas measured by\b/i.test(t) || t.length > 180) {
    const car = splitExperienceParagraph(t);
    if (car) return car;
  }

  const bySentence = t.split(/(?<=[.!?])\s+(?=[A-Z(])/);
  if (bySentence.length >= 2) {
    const bullets = bySentence
      .map((s) => condenseCarBullet(s.trim().replace(/^[-•*●▪◦]\s+/, '')))
      .filter((s) => s.length > 20);
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

  const cleaned = parts
    .map((p) => condenseCarBullet(p.replace(/^[-•*●▪◦]\s+/, '').trim()))
    .filter((p) => p.length > 25);
  if (cleaned.length >= 2) {
    return cleaned.map((text) => ({ type: 'bullet', text }));
  }

  return null;
}

export function insertExperienceBulletBreaks(text = '') {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let inExperience = false;
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(professional\s+)?experience$/i.test(trimmed) || trimmed.toUpperCase() === 'WORK EXPERIENCE') {
      inExperience = true;
      out.push(line);
      continue;
    }

    if (
      inExperience &&
      /^[A-Z][A-Z\s/&\-]{2,}$/.test(trimmed) &&
      trimmed.length < 60 &&
      !/experience/i.test(trimmed)
    ) {
      inExperience = false;
    }

    if (inExperience && trimmed.length > 140 && !/^[-•*●▪]/.test(trimmed)) {
      const car = splitExperienceParagraph(trimmed);
      if (car?.length) {
        out.push(...car.map((row) => `- ${row.text}`));
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
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
