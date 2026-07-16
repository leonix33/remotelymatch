import {
  groupExperienceLinesIntoChunks,
  parseExperienceChunkLines,
  splitExperienceBlob,
} from './resumeExperienceParser';

/**
 * Split comma-separated skill/tool lists while respecting parentheses.
 */
export function splitListTokens(text) {
  const tokens = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(') depth += 1;
    if (c === ')') depth = Math.max(0, depth - 1);
    if ((c === ',' || c === ';') && depth === 0) {
      const t = current.trim();
      if (t) tokens.push(t);
      current = '';
    } else {
      current += c;
    }
  }

  const tail = current.trim();
  if (tail) tokens.push(tail);

  return tokens
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 1 && t.length < 90);
}

const SKILL_CATEGORY_PATTERNS = [
  'Azure Platform',
  'AWS Platform',
  'Databricks & Data Platforms',
  'Generative AI & MLOps',
  'Containers & Kubernetes',
  'IaC & Automation',
  'CI/CD & DevSecOps',
  'Security & Compliance',
  'Observability & Reliability',
  'Cloud Platforms',
  'Data Platforms',
  'DevSecOps',
  'MLOps',
];

function buildCategoryRegex() {
  const escaped = SKILL_CATEGORY_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')}):\\s*`, 'gi');
}

const SKILL_CATEGORY_RE = buildCategoryRegex();

const KNOWN_TOOLS =
  /\b(Terraform|Ansible|Python|PowerShell|Bash|Jenkins|GitHub Actions|GitLab CI|Docker|Kubernetes|Helm|Kustomize|Prometheus|Grafana|Kafka|Splunk|Datadog|Vault|ArgoCD|ARM Templates|ELK(?:\s+Stack)?|SIEM|Linux|Windows Server|Azure DevOps|Azure|AWS|GCP|Databricks)\b/gi;

function extractToolNames(text) {
  return [...new Set([...String(text || '').matchAll(KNOWN_TOOLS)].map((m) => m[1].replace(/\s+Stack$/i, ' Stack')))];
}

function isProseBlock(text) {
  const t = String(text || '').trim();
  return t.length > 120 && /\b(as measured by|by designing|into CI\/CD|ensuring|establishing)\b/i.test(t);
}

export function isSpuriousToolsContent(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^(into|and|or|by|with)\b/i.test(t)) return true;
  if (/\b(as measured by|by configuring|by building|by implementing|by designing)\b/i.test(t)) return true;
  if (/\b(Cloud|DevOps|Platform|Senior)\s+.*\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)) return true;
  if (/\b(Engineer|DevOps)\b.*\b(19|20)\d{2}\b/i.test(t)) return true;
  if (t.length > 250 && /\b(managed|built|implemented|supported|architected|operated)\b/i.test(t)) return true;

  const commaItems = splitListTokens(t);
  if (
    commaItems.length >= 3 &&
    commaItems.every((item) => item.length < 45 && !/\b(as measured by)\b/i.test(item))
  ) {
    return false;
  }

  const tools = extractToolNames(t);
  if (tools.length >= 4 && t.length < 400 && !/\b(as measured by)\b/i.test(t)) return false;

  return isProseBlock(t);
}

export function isFalseToolsHeader(lines, lineIndex) {
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

const MAX_SKILLS_PER_CATEGORY = 16;

function compactSkillLabel(item = '') {
  let t = String(item).trim();
  const short = t.match(/^([^(|]{2,36})\s*\(/);
  if (short && t.length > 32) return short[1].trim();
  if (t.length > 38) return `${t.slice(0, 36).trim()}…`;
  return t;
}

function dedupeSkills(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = compactSkillLabel(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseSkillsSectionLines(contentLines) {
  const text = contentLines.map((l) => String(l).trim()).filter(Boolean).join(' ');
  if (!text) return [];

  const rows = [];
  const hits = [...text.matchAll(SKILL_CATEGORY_RE)];

  if (hits.length >= 1) {
    for (let i = 0; i < hits.length; i += 1) {
      const label = hits[i][1].trim();
      const start = hits[i].index + hits[i][0].length;
      const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
      const chunk = text.slice(start, end).trim();
      const items = dedupeSkills(splitListTokens(chunk));
      if (items.length) {
        const compact = items.map(compactSkillLabel);
        rows.push({
          type: 'skill-category',
          label,
          items: compact.slice(0, MAX_SKILLS_PER_CATEGORY),
          overflow: Math.max(0, compact.length - MAX_SKILLS_PER_CATEGORY),
        });
      }
    }
    if (rows.length) return rows;
  }

  const items = dedupeSkills(splitListTokens(text));
  if (items.length >= 4) {
    const compact = items.map(compactSkillLabel);
    return [{
      type: 'skill-category',
      label: 'Core skills',
      items: compact.slice(0, MAX_SKILLS_PER_CATEGORY),
      overflow: Math.max(0, compact.length - MAX_SKILLS_PER_CATEGORY),
    }];
  }

  if (text.includes('|') && text.length < 400) {
    return [{ type: 'pipe-line', text }];
  }

  return [{ type: 'text', text }];
}

export function parseToolsSectionLines(contentLines) {
  const text = contentLines.map((l) => String(l).trim()).filter(Boolean).join(' ');
  if (!text) return [];

  if (isSpuriousToolsContent(text)) {
    return [];
  }

  if (isProseBlock(text)) {
    const tools = extractToolNames(text);
    if (tools.length >= 2) {
      return [{ type: 'tools-grid', label: 'Platforms & tooling', items: tools }];
    }
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.trim().length > 30);
    if (sentences.length >= 1) {
      return sentences.map((s) => ({ type: 'bullet', text: s.trim() }));
    }
  }

  const commaItems = splitListTokens(text);
  if (commaItems.length >= 3 && commaItems.every((t) => t.length < 45)) {
    return [{ type: 'tools-grid', label: '', items: commaItems }];
  }

  const extracted = extractToolNames(text);
  if (extracted.length >= 2) {
    return [{ type: 'tools-grid', label: 'Tools', items: extracted }];
  }

  return [{ type: 'text', text }];
}

export function parseEducationSectionLines(contentLines) {
  const merged = contentLines.map((l) => String(l).trim()).filter(Boolean);
  const rows = [];

  const DEGREE_LINE_RE =
    /^(Master|Bachelor|Associate|Doctor|Doctorate|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D\.?|Diploma|Certificate)\b/i;
  const MISPLACED_SUMMARY_RE =
    /\b(certification portfolio|enterprise cloud platforms|Databricks SME|Azure \(\d+ certs\)|AWS \(\d+ certs\)|extensive certification)\b/i;

  for (let i = 0; i < merged.length; i += 1) {
    const t = merged[i];
    const next = merged[i + 1];

    if (MISPLACED_SUMMARY_RE.test(t) && t.length > 180) {
      continue;
    }

    if (t.includes('|') && DEGREE_LINE_RE.test(t)) {
      const bachelorSplit = t.search(/\bBachelor\b/i);
      if (bachelorSplit > 24 && /\bMaster\b/i.test(t.slice(0, bachelorSplit))) {
        const firstDegree = t.slice(0, bachelorSplit).trim();
        const secondDegree = t.slice(bachelorSplit).trim();
        for (const degreeLine of [firstDegree, secondDegree]) {
          const parts = degreeLine.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            rows.push({ type: 'education-block', degree: parts[0], school: parts.slice(1).join(' | ') });
          }
        }
        continue;
      }

      const parts = t.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        rows.push({ type: 'education-block', degree: parts[0], school: parts.slice(1).join(' | ') });
        continue;
      }
    }

    const inlineDegrees = t.match(
      /((?:Master|Bachelor|Associate|Doctor(?:ate)?|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D\.?)[^|]+(?:\|[^|]+)+)/gi
    );
    if (inlineDegrees?.length >= 2) {
      for (const degreeChunk of inlineDegrees) {
        const parts = degreeChunk.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          rows.push({ type: 'education-block', degree: parts[0], school: parts.slice(1).join(' | ') });
        }
      }
      continue;
    }

    if (
      next &&
      /University|College|Institute|School|Academy|WGU|Yaounde|Governors/i.test(next) &&
      !/University|College|Institute/i.test(t)
    ) {
      rows.push({ type: 'education-block', degree: t, school: next });
      i += 1;
    } else if (
      /University|College|Institute|School|WGU|Yaounde/i.test(t) &&
      rows.length &&
      rows[rows.length - 1].type === 'education-block' &&
      !rows[rows.length - 1].school
    ) {
      rows[rows.length - 1].school = t;
    } else if (DEGREE_LINE_RE.test(t) && next && /University|College|Institute|School|WGU|Yaounde|Governors/i.test(next)) {
      rows.push({ type: 'education-block', degree: t, school: next });
      i += 1;
    } else if (t.includes('|') && /University|College|Institute|School|WGU|Yaounde|Governors/i.test(t)) {
      const parts = t.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        rows.push({ type: 'education-block', degree: parts[0], school: parts.slice(1).join(' | ') });
      }
    } else if (t) {
      rows.push({ type: 'text', text: t });
    }
  }
  return rows;
}

const CERT_GROUP_HEADER =
  /(Azure(?:\s*\(\d+\))?|AWS(?:\s*\(\d+\))?|GCP(?:\s*\(\d+\))?|Databricks(?:\s*\(\d+\))?|Security(?:\s*&\s*Infra)?|Lakehouse|Generative(?:\s+AI)?|Terraform|CKA)(?:\s*\(\d+\))?\s*:\s*/gi;

function splitCertLines(lines) {
  const expanded = [];
  for (const line of lines) {
    const t = String(line || '').trim();
    if (!t) continue;

    const hits = [...t.matchAll(CERT_GROUP_HEADER)];
    if (!hits.length) {
      expanded.push(t);
      continue;
    }

    const first = hits[0];
    if (first.index > 0) {
      const prefix = t.slice(0, first.index).trim();
      if (prefix) expanded.push(prefix);
    }

    for (let i = 0; i < hits.length; i += 1) {
      const start = hits[i].index;
      const end = i + 1 < hits.length ? hits[i + 1].index : t.length;
      expanded.push(t.slice(start, end).trim());
    }
  }
  return expanded;
}

const CERT_GROUP_LINE =
  /^(Azure(?:\s*\(\d+\))?|AWS(?:\s*\(\d+\))?|GCP(?:\s*\(\d+\))?|Databricks(?:\s*\(\d+\))?|Security(?:\s*&\s*Infra)?|Lakehouse|Generative(?:\s+AI)?|Terraform|CKA)(?:\s*\(\d+\))?\s*:\s*(.*)$/i;

const CERT_NAME_LINE =
  /^(Azure|AWS|GCP|Databricks|CKA|Terraform|Security\+|CompTIA|Lakehouse|Generative).+/i;

export function parseCertificationsSectionLines(contentLines) {
  const lines = splitCertLines(contentLines.map((l) => String(l).trim()).filter(Boolean));
  const rows = [];
  let currentGroup = null;

  for (const line of lines) {
    const groupMatch = line.match(CERT_GROUP_LINE);
    if (groupMatch) {
      if (currentGroup) rows.push(currentGroup);
      const label = line.split(':')[0].trim();
      const firstItem = groupMatch[2]?.trim();
      const firstItems = firstItem
        ? firstItem.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
        : [];
      currentGroup = {
        type: 'cert-group',
        label,
        items: firstItems,
      };
      continue;
    }

    if (currentGroup && line.length < 120) {
      if (line.includes('|')) {
        currentGroup.items.push(...line.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean));
      } else if (!line.includes(':')) {
        currentGroup.items.push(line);
      }
      continue;
    }

    if (CERT_NAME_LINE.test(line) || /Associate|Expert|Fundamentals|Professional|Administrator|Engineer/i.test(line)) {
      if (currentGroup) {
        currentGroup.items.push(line);
      } else {
        rows.push({ type: 'cert-item', text: line });
      }
      continue;
    }

    if (line) rows.push({ type: 'text', text: line });
  }

  if (currentGroup) rows.push(currentGroup);

  for (const row of rows) {
    if (row.type === 'cert-group' && Array.isArray(row.items)) {
      const seen = new Set();
      row.items = row.items
        .flatMap((item) => String(item).split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean))
        .filter((item) => {
          const key = item.toLowerCase();
          if (!item || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
  }

  if (!rows.length && lines.length) {
    return lines.map((t) => ({ type: 'cert-item', text: t }));
  }

  return rows;
}


export function parseExperienceSectionLines(contentLines) {
  const lines = contentLines.map((l) => String(l).trim()).filter(Boolean);
  const lineChunks = groupExperienceLinesIntoChunks(lines);
  const hasStructuredDates = lines.some((l) =>
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/i.test(l) &&
    l.length < 100
  );
  const hasBullets = lines.some((l) => /^[-•*●▪]/.test(l));

  // Prefer line-based chunks when backend already produced multi-line jobs.
  // Flattening into a blob was collapsing 8–10 bullets down to 1–2.
  const chunks =
    hasStructuredDates || hasBullets || lineChunks.length >= 2
      ? lineChunks
      : splitExperienceBlob(lines.join(' ')) || lineChunks;

  const rows = [];
  for (const chunk of chunks) {
    const chunkLines = Array.isArray(chunk) ? chunk : [String(chunk)];
    rows.push(...parseExperienceChunkLines(chunkLines));
  }
  return rows;
}
