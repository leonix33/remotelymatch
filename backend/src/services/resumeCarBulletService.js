const ACTION_VERBS =
  'Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Established|Reduced|Improved|Automated|Deployed|Migrated|Optimized|Coordinated|Directed|Spearheaded|Delivered|Streamlined|Standardized|Maintained|Supported|Executed|Configured|Integrated|Partnered|Drove|Owned|Introduced|Championed|Facilitated|Engineered|Operationalized|Hardened|Monitored|Troubleshot|Resolved|Scaled|Transformed|Collaborated|Authored|Defined|Enhanced|Enforced|Participated|Conducted|Operated';

const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\b/i;

const CAR_MEASURED_RE = /,?\s*as measured by\s+/i;
const CAR_BY_RE =
  /,?\s*by\s+(?=(?:designing|implementing|building|integrating|automating|establishing|managing|configuring|hardening|enforcing|optimizing|supporting|conducting|participating|strengthening|ensuring|developing|architecting))/i;

const MAX_BULLET_CHARS = 480;
const ACTION_SPLIT_RE = new RegExp(`(?<=\\.)\\s+(?=(?:${ACTION_VERBS})\\b)`, 'g');

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

function condenseCarBullet(text = '') {
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
    if (byClause && byClause.length > 20 && byClause.length < 180) {
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

function splitExperienceParagraph(text = '') {
  const t = String(text).trim();
  if (!t || t.length < 60) return null;

  const segments = splitOnActionBoundaries(t);
  const bullets = segments
    .map((s) => condenseCarBullet(s))
    .filter((s) => s.length > 20);

  if (bullets.length >= 1) {
    return bullets;
  }
  return null;
}

function dechunkExperienceLine(line = '') {
  const t = String(line).trim();
  if (!t || t.length < 100) return [t];

  const bullets = splitExperienceParagraph(t);
  if (!bullets?.length) return [t];

  return bullets.map((b) => (b.startsWith('-') ? b : `- ${b}`));
}

function isJobMetaLine(line = '') {
  const t = String(line).trim().replace(/^[-•*●▪]+\s*/, '');
  if (!t) return false;
  if (DATE_RANGE_RE.test(t)) return true;
  if (t.includes('|') && t.length < 220 && !/\b(Architected|Built|Implemented|Designed|Led)\b/.test(t)) return true;
  return false;
}

function insertExperienceBulletBreaks(text = '') {
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

    if (inExperience && /^[A-Z][A-Z\s/&\-]{2,}$/.test(trimmed) && trimmed.length < 60 && !/experience/i.test(trimmed)) {
      inExperience = false;
    }

    if (inExperience && trimmed.length > 140 && !/^[-•*●▪]/.test(trimmed) && !isJobMetaLine(trimmed)) {
      const chunks = dechunkExperienceLine(trimmed);
      if (chunks.length > 1 || (chunks.length === 1 && chunks[0] !== trimmed)) {
        out.push(...chunks);
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

function polishExperienceText(text = '') {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let inExperience = false;
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(professional\s+)?experience$/i.test(trimmed)) {
      inExperience = true;
      out.push(line);
      continue;
    }

    if (inExperience && /^[A-Z][A-Z\s/&\-]{2,}$/.test(trimmed) && trimmed.length < 60 && !/experience/i.test(trimmed)) {
      inExperience = false;
    }

    if (inExperience && trimmed.length > 80) {
      if (/^[-•*●▪]/.test(trimmed)) {
        out.push(line);
        continue;
      }
      if (isJobMetaLine(trimmed)) {
        out.push(line);
        continue;
      }
      const raw = trimmed.replace(/^[-•*●▪]\s+/, '');
      const bullets = splitExperienceParagraph(raw);
      if (bullets?.length) {
        for (const b of bullets) {
          out.push(b.startsWith('-') ? b : `- ${b}`);
        }
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

module.exports = {
  condenseCarBullet,
  splitExperienceParagraph,
  dechunkExperienceLine,
  insertExperienceBulletBreaks,
  polishExperienceText,
  trimToReadable,
  ACTION_VERBS,
};
