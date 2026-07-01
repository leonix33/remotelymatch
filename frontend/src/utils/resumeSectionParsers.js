import { mergeOrphanPrefixLines, tryParseJobBlock, splitParagraphToBullets, condenseCarBullet } from './resumeExperienceParser';

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
      const items = splitListTokens(chunk);
      if (items.length) {
        rows.push({ type: 'skill-category', label, items });
      }
    }
    if (rows.length) return rows;
  }

  const items = splitListTokens(text);
  if (items.length >= 4) {
    return [{ type: 'skill-category', label: 'Core skills', items }];
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

  for (let i = 0; i < merged.length; i += 1) {
    const t = merged[i];
    const next = merged[i + 1];
    if (
      next &&
      /University|College|Institute|School|Academy|WGU|Yaounde|Governors/i.test(next) &&
      !/University|College|Institute/i.test(t)
    ) {
      rows.push({ type: 'education-block', degree: t, school: next });
      i += 1;
    } else if (/University|College|Institute|School|WGU|Yaounde/i.test(t) && rows.length && rows[rows.length - 1].type === 'education-block' && !rows[rows.length - 1].school) {
      rows[rows.length - 1].school = t;
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
      currentGroup = {
        type: 'cert-group',
        label,
        items: firstItem ? [firstItem] : [],
      };
      continue;
    }

    if (currentGroup && line.length < 100 && !line.includes(':')) {
      currentGroup.items.push(line);
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

  if (!rows.length && lines.length) {
    return lines.map((t) => ({ type: 'cert-item', text: t }));
  }

  return rows;
}

const JOB_TITLE_DATE =
  /((?:Senior\s+|Lead\s+)?(?:Cloud\s+(?:Platform\s+)?|Platform\s+|DevOps\s+)?Engineer(?:\s*\/\s*DevOps)?|DevOps\s+Engineer|Cloud\s+Engineer(?:\s*\/\s*DevOps)?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s+(?:[–\-—]\s*|\s+)(Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/gi;

export function splitExperienceBlob(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t || t.length < 80) return null;

  const matches = [...t.matchAll(JOB_TITLE_DATE)];
  if (matches.length < 2) return null;

  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : t.length;
    chunks.push(t.slice(start, end).trim());
  }
  return chunks.filter(Boolean);
}

export function parseExperienceSectionLines(contentLines) {
  const flat = contentLines.map((l) => String(l).trim()).filter(Boolean).join(' ');
  const multi = splitExperienceBlob(flat);
  const chunks = multi || mergeOrphanPrefixLines(contentLines.map((l) => String(l).trim()).filter(Boolean));

  const rows = [];
  for (const chunk of chunks) {
    const t = String(chunk || '').trim();
    if (!t) continue;

    const jobBlock = tryParseJobBlock(t);
    if (jobBlock) {
      rows.push({
        ...jobBlock,
        tags: (jobBlock.tags || []).slice(0, 4),
      });
      if (jobBlock.bodyText) {
        const bullets = splitParagraphToBullets(jobBlock.bodyText);
        if (bullets) rows.push(...bullets.slice(0, 4));
        else rows.push({ type: 'text', text: condenseCarBullet(jobBlock.bodyText) });
      }
      continue;
    }

    if (t.length > 100) {
      const bullets = splitParagraphToBullets(t);
      if (bullets) {
        rows.push(...bullets.slice(0, 4));
        continue;
      }
    }

    rows.push({ type: 'text', text: t });
  }

  return rows;
}
