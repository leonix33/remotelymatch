export const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\b/i;

const JOB_ROLE_WORD =
  /\b(Engineer|Developer|Architect|Manager|Analyst|Consultant|Specialist|Administrator|Coordinator|Technician|Director|Supervisor|Associate|Intern|SRE|DevOps|Platform|Scientist|Designer|Producer|Representative|Officer|Nurse|Therapist|Accountant|Recruiter|Attorney|Paralegal|Writer|Editor|Strategist|Marketer|Technologist|Administrator)\b/i;

const ACTION_LINE_START =
  /^(Architected|Built|Managed|Designed|Developed|Led|Improved|Integrated|Enforced|Operated|Coordinated|Delivered|Established|Automated|Deployed|Migrated|Optimized|Supported|Configured|Partnered|Drove|Owned|Introduced|Championed|Facilitated|Engineered|Hardened|Monitored|Troubleshot|Resolved|Scaled|Transformed|Collaborated|Authored|Defined|Enhanced|Participated|Conducted)\b/i;

const JOB_TITLE_TAIL_RE =
  /((?:Senior|Staff|Lead|Principal|Associate|Junior|Chief|Head|VP|Cloud|Platform|DevOps|SRE)?\s*(?:[\w/&.-]+\s+){0,8}(?:Engineer|Developer|Architect|Manager|Analyst|Consultant|Specialist|Administrator|Coordinator|Technician|Director|Supervisor|Scientist|Designer|Representative|Officer|SRE)(?:\s*\/\s*[\w]+)?)\s*$/i;

export function isDateOnlyLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 90) return false;
  if (ACTION_LINE_START.test(t)) return false;
  return DATE_RANGE_RE.test(t);
}

export function isLikelyJobTitleLine(line) {
  const t = String(line || '').trim();
  if (!t || t.length < 4 || t.length > 120) return false;
  if (DATE_RANGE_RE.test(t)) return false;
  if (/^[-•*●▪]/.test(t)) return false;
  if (ACTION_LINE_START.test(t)) return false;
  if (JOB_ROLE_WORD.test(t)) return true;
  return (
    /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,6}$/.test(t) &&
    !/\b(University|College|School|Azure|AWS|Kubernetes|Terraform|Databricks)\b/i.test(t)
  );
}

function isLocationLine(line) {
  return /^[A-Za-z .'-]+,\s*[A-Z]{2}([, ]+[A-Za-z .'-]+)?$/i.test(String(line || '').trim());
}

function isMetaPipeLine(line) {
  const t = String(line || '').trim();
  return t.includes('|') && t.length < 220 && !DATE_RANGE_RE.test(t) && !/^https?:\/\//i.test(t);
}

function isValidExperienceBulletRow(row) {
  if (row.type !== 'bullet') return true;
  const t = String(row.text || '').trim();
  return t.length >= 15 && !/^[-–—|.\s]+$/.test(t);
}

function pushExperienceBodyLines(bodyLines, rows, maxBullets = 12) {
  let bulletCount = rows.filter((r) => r.type === 'bullet').length;

  for (const raw of bodyLines) {
    const bl = String(raw || '').trim();
    if (!bl) continue;

    if (/^[-•*●▪◦]\s/.test(bl)) {
      if (bulletCount < maxBullets) {
        rows.push({ type: 'bullet', text: bl.replace(/^[-•*●▪◦]\s+/, '') });
        bulletCount += 1;
      }
      continue;
    }

    if (bl.length > 80) {
      const bullets = splitParagraphToBullets(bl);
      if (bullets) {
        for (const bullet of bullets) {
          if (bulletCount >= maxBullets) break;
          if (isValidExperienceBulletRow(bullet)) {
            rows.push(bullet);
            bulletCount += 1;
          }
        }
        continue;
      }
    }

    rows.push({ type: 'text', text: bl });
  }
}

function parseMultilineJob(lines, dateIdx) {
  const title = lines.slice(0, dateIdx).join(' ').trim();
  const dateLine = lines[dateIdx];
  const dateMatch = dateLine.match(DATE_RANGE_RE);
  const dates = dateMatch ? `${dateMatch[1]} – ${dateMatch[2]}` : dateLine;

  let idx = dateIdx + 1;
  let company = '';
  const tags = [];

  if (
    idx < lines.length &&
    !isDateOnlyLine(lines[idx]) &&
    !isMetaPipeLine(lines[idx]) &&
    !/^[-•]/.test(lines[idx]) &&
    lines[idx].length < 100 &&
    !ACTION_LINE_START.test(lines[idx])
  ) {
    company = lines[idx];
    idx += 1;
  }

  if (idx < lines.length && isLocationLine(lines[idx])) {
    tags.push(lines[idx]);
    idx += 1;
  }

  if (idx < lines.length && isMetaPipeLine(lines[idx])) {
    tags.push(...lines[idx].split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean));
    idx += 1;
  }

  const rows = [{ type: 'job-block', title, dates, company, tags: tags.slice(0, 4) }];
  pushExperienceBodyLines(lines.slice(idx), rows);
  return rows;
}

export function parseExperienceChunkLines(chunkLines) {
  const lines = chunkLines.map((l) => String(l).trim()).filter(Boolean);
  if (!lines.length) return [];

  // Prefer already-structured multi-line jobs (title / dates / company / bullets).
  // Joining first and re-parsing flattens neat kits into 1–2 bullets.
  const dateIdx = lines.findIndex(
    (l, i) => isDateOnlyLine(l) && (i === 0 || isLikelyJobTitleLine(lines[i - 1]) || i <= 2)
  );
  if (
    dateIdx >= 0 &&
    (dateIdx === 0 ||
      isLikelyJobTitleLine(lines[0]) ||
      lines.slice(0, dateIdx).every((l) => isLikelyJobTitleLine(l) || TITLE_PREFIX_RE.test(l)))
  ) {
    return parseMultilineJob(lines, dateIdx);
  }

  // Flat header on line 1 + bullet lines below
  if (
    lines.length >= 2 &&
    tryParseJobBlock(lines[0]) &&
    lines.slice(1).some((l) => /^[-•*●▪]/.test(l) || ACTION_LINE_START.test(l))
  ) {
    const header = tryParseJobBlock(lines[0]);
    const rows = [{ ...header, tags: (header.tags || []).slice(0, 4) }];
    pushExperienceBodyLines(lines.slice(1), rows);
    return rows;
  }

  const singleLine = lines.join(' ');
  const inline = tryParseJobBlock(singleLine);
  if (inline) {
    const rows = [{ ...inline, tags: (inline.tags || []).slice(0, 4) }];
    if (inline.bodyText) {
      const bullets = splitParagraphToBullets(inline.bodyText);
      if (bullets) rows.push(...bullets.slice(0, 12).filter(isValidExperienceBulletRow));
      else rows.push({ type: 'text', text: condenseCarBullet(inline.bodyText) });
    }
    return rows;
  }

  if (singleLine.length > 100) {
    const bullets = splitParagraphToBullets(singleLine);
    if (bullets) return bullets.slice(0, 12).filter(isValidExperienceBulletRow);
  }

  return [{ type: 'text', text: singleLine }];
}

export function groupExperienceLinesIntoChunks(contentLines) {
  const merged = mergeOrphanPrefixLines(contentLines.map((l) => String(l).trim()).filter(Boolean));
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length) chunks.push([...current]);
    current = [];
  };

  for (let i = 0; i < merged.length; i += 1) {
    const line = merged[i];
    const next = merged[i + 1] || '';

    if (tryParseJobBlock(line)) {
      flush();
      chunks.push([line]);
      continue;
    }

    if (isLikelyJobTitleLine(line) && isDateOnlyLine(next)) {
      if (current.length) flush();
      current = [line];
      continue;
    }

    if (current.length && isLikelyJobTitleLine(line) && isDateOnlyLine(next) && JOB_ROLE_WORD.test(line)) {
      flush();
      current = [line];
      continue;
    }

    // Company/location lines are often Title Case ("Bon Secours Mercy Health") and
    // must NOT start a new job — that orphaned all bullets under a fake second chunk.
    if (current.length && isLikelyJobTitleLine(line) && JOB_ROLE_WORD.test(line)) {
      const hasDate = current.some((l) => isDateOnlyLine(l));
      const hasBullets = current.some(
        (l) => /^[-•*●▪]/.test(l) || ACTION_LINE_START.test(l)
      );
      if (hasDate && (hasBullets || isDateOnlyLine(next))) {
        flush();
        current = [line];
        continue;
      }
    }

    current.push(line);
  }

  flush();
  return chunks.length ? chunks : [merged];
}

export function splitExperienceBlob(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t || t.length < 80) return null;

  const dateRe = new RegExp(DATE_RANGE_RE.source, 'gi');
  const matches = [...t.matchAll(dateRe)];
  if (matches.length < 2) return null;

  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const dateIdx = matches[i].index;
    const prevDateEnd = i > 0 ? matches[i - 1].index + matches[i - 1][0].length : 0;
    const beforeDate = t.slice(prevDateEnd, dateIdx).trim();
    let titleStart = prevDateEnd;

    const titleMatch = beforeDate.match(JOB_TITLE_TAIL_RE);
    if (titleMatch?.index !== undefined) {
      titleStart = prevDateEnd + titleMatch.index;
    } else {
      const lastBreak = Math.max(beforeDate.lastIndexOf('. '), beforeDate.lastIndexOf('; '));
      if (lastBreak >= 0) titleStart = prevDateEnd + lastBreak + 2;
    }

    const end =
      i + 1 < matches.length
        ? (() => {
            const nextDateIdx = matches[i + 1].index;
            const between = t.slice(matches[i].index + matches[i][0].length, nextDateIdx).trim();
            const nextTitle = between.match(JOB_TITLE_TAIL_RE);
            if (nextTitle?.index !== undefined) {
              return nextDateIdx - (between.length - nextTitle.index);
            }
            return nextDateIdx;
          })()
        : t.length;

    const chunk = t.slice(titleStart, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
  }

  return chunks.length >= 2 ? chunks : null;
}

const TITLE_PREFIX_RE = /^(Senior|Staff|Principal|Lead|Associate|Junior|Chief|Head|VP|Director|Cloud|Platform|DevOps|SRE)$/i;

const ACTION_VERBS =
  'Architected|Led|Built|Managed|Implemented|Designed|Developed|Created|Established|Reduced|Improved|Automated|Deployed|Migrated|Optimized|Coordinated|Directed|Spearheaded|Delivered|Streamlined|Standardized|Maintained|Supported|Executed|Configured|Integrated|Partnered|Drove|Owned|Introduced|Championed|Facilitated|Engineered|Operationalized|Hardened|Monitored|Troubleshot|Resolved|Scaled|Transformed|Collaborated|Authored|Defined|Enhanced|Enforced|Participated|Conducted|Operated';

const ACTION_START_RE = new RegExp(
  `\\s+(${ACTION_VERBS.split('|').slice(0, 16).join('|')}|DevOps Engineer|Cloud Engineer\\/)`
);

const CAR_MEASURED_RE = /,?\s*as measured by\s+/i;
const CAR_BY_RE =
  /,?\s*by\s+(?=(?:designing|implementing|building|integrating|automating|establishing|managing|configuring|hardening|enforcing|optimizing|supporting|conducting|participating|strengthening|ensuring|developing|architecting))/i;

const MAX_BULLET_CHARS = 480;
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
