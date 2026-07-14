const {
  sanitizeJobDescriptionForAts,
  extractJdTerms,
  extractPrioritySectionLines,
  buildJdMatchBrief,
} = require('./atsKeywordService');

const ACTION_VERB_RE =
  /\b(manage|lead|design|build|implement|develop|deploy|migrate|automate|optimize|coordinate|support|maintain|analyze|architect|integrate|deliver|drive|own|operate|monitor|secure|troubleshoot|document|collaborate)\w*/gi;

const CERT_RE =
  /\b(CKA|CKAD|CKS|AWS\s+Certified|Azure\s+\w+\s+Associate|Azure\s+\w+\s+Expert|PMP|CISSP|CISM|Security\+|Network\+|Cloud\+|Terraform\s+Associate|Databricks|CompTIA|ITIL|Scrum\s+Master|SAFe)\b/gi;

const SENIORITY_PATTERNS = [
  { level: 'executive', re: /\b(vp|vice president|chief|cto|cio|director)\b/i },
  { level: 'principal', re: /\b(principal|staff|distinguished|fellow)\b/i },
  { level: 'senior', re: /\b(senior|sr\.?|lead)\b/i },
  { level: 'mid', re: /\b(mid[- ]level|intermediate)\b/i },
  { level: 'junior', re: /\b(junior|jr\.?|entry[- ]level|graduate|intern)\b/i },
];

function inferSeniority(text = '', job = {}) {
  const blob = `${job?.title || ''} ${text}`;
  for (const { level, re } of SENIORITY_PATTERNS) {
    if (re.test(blob)) return level;
  }
  const years = extractYearsExperience(text);
  if (years != null && years >= 8) return 'senior';
  if (years != null && years <= 2) return 'junior';
  return 'mid';
}

function extractYearsExperience(text = '') {
  const match = String(text).match(/(\d+)\+?\s*years?(?:\s+of)?\s+(?:relevant\s+)?(?:experience|exp)/i);
  return match ? Number(match[1]) : null;
}

function extractActionVerbs(text = '') {
  const verbs = new Set();
  let match;
  const re = new RegExp(ACTION_VERB_RE.source, ACTION_VERB_RE.flags);
  while ((match = re.exec(text)) !== null) {
    const verb = match[1].toLowerCase();
    if (verb.length >= 4) verbs.add(verb);
  }
  return [...verbs].slice(0, 15);
}

function extractCertificationMentions(text = '') {
  const certs = new Set();
  let match;
  const re = new RegExp(CERT_RE.source, CERT_RE.flags);
  while ((match = re.exec(text)) !== null) {
    certs.add(match[1].trim());
  }
  return [...certs].slice(0, 12);
}

function classifySkillLines(lines = []) {
  const required = [];
  const preferred = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/\b(nice to have|preferred|bonus|plus|desired|ideal)\b/.test(lower)) {
      preferred.push(line);
    } else if (
      /\b(required|must|minimum|mandatory|essential|need|years|proficient|strong|experience with)\b/.test(lower)
    ) {
      required.push(line);
    } else if (line.length >= 12) {
      required.push(line);
    }
  }

  return { required, preferred };
}

function extractTechnologies(terms = []) {
  const techMarkers =
    /^(kubernetes|k8s|terraform|aws|azure|gcp|docker|python|java|golang|node|react|angular|vue|sql|postgres|mongodb|redis|kafka|spark|databricks|snowflake|linux|ansible|jenkins|gitlab|github|devops|ci\/cd|helm|argocd|prometheus|grafana|datadog|splunk|vault|istio|lambda|eks|aks|gke|pulumi|cloudformation|mainframe|cobol|jcl|db2|zos)$/i;
  return terms.filter((t) => techMarkers.test(t) || t.length <= 18).slice(0, 20);
}

function inferIndustry(text = '', job = {}) {
  const blob = `${job?.title || ''} ${job?.company || ''} ${text}`.toLowerCase();
  if (/\b(healthcare|hospital|clinical|hipaa|patient)\b/.test(blob)) return 'healthcare';
  if (/\b(fintech|banking|finance|trading|payments)\b/.test(blob)) return 'finance';
  if (/\b(retail|ecommerce|commerce)\b/.test(blob)) return 'retail';
  if (/\b(government|federal|public sector|defense)\b/.test(blob)) return 'government';
  if (/\b(mainframe|insurance|logistics|manufacturing|energy|telecom)\b/.test(blob)) return 'enterprise';
  return 'technology';
}

function extractResponsibilities(text = '') {
  const blocks = [];
  const re =
    /(?:responsibilities|what you(?:'ll| will) do|you will|role overview|in this role)[:\s]*([\s\S]{0,1800}?)(?:\n\n|\n[A-Z][A-Z]{2,}|\n#{1,3}\s|$)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const block = match[1] || '';
    for (const line of block.split(/[\n•·\-;]+/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 20 && trimmed.length <= 220) blocks.push(trimmed);
    }
  }
  return [...new Set(blocks)].slice(0, 10);
}

/**
 * Phase 0: structured job posting analysis — runs before any LLM tailor call.
 */
function analyzeJobPosting(jobDescription = '', job = {}) {
  const cleaned = sanitizeJobDescriptionForAts(jobDescription);
  const brief = buildJdMatchBrief(cleaned, job);
  const priorityLines = extractPrioritySectionLines(cleaned);
  const { required, preferred } = classifySkillLines(priorityLines);
  const allTerms = extractJdTerms(cleaned, job);
  const technologies = extractTechnologies(allTerms);
  const responsibilities = extractResponsibilities(cleaned);

  return {
    roleTitle: job?.title || brief.roleTitle || '',
    company: job?.company || brief.company || '',
    seniority: inferSeniority(cleaned, job),
    industry: inferIndustry(cleaned, job),
    yearsExperience: extractYearsExperience(cleaned),
    requiredSkills: required.slice(0, 12),
    preferredSkills: preferred.slice(0, 8),
    technologies,
    actionVerbs: extractActionVerbs(cleaned),
    certifications: extractCertificationMentions(cleaned),
    responsibilities,
    requirements: brief.requirements,
    atsKeywords: allTerms.slice(0, 30),
    criticalTerms: brief.criticalTerms,
    analyzedAt: new Date().toISOString(),
  };
}

function formatJdAnalysisForPrompt(analysis) {
  if (!analysis) return '';
  const lines = [
    `Role: ${analysis.roleTitle || 'Target role'} at ${analysis.company || 'Company'}`,
    `Seniority: ${analysis.seniority}${analysis.yearsExperience ? ` · ${analysis.yearsExperience}+ years` : ''}`,
    `Industry: ${analysis.industry}`,
  ];

  if (analysis.requiredSkills?.length) {
    lines.push(`Required skills:\n${analysis.requiredSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }
  if (analysis.preferredSkills?.length) {
    lines.push(`Preferred / nice-to-have:\n${analysis.preferredSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }
  if (analysis.technologies?.length) {
    lines.push(`Technologies: ${analysis.technologies.join(', ')}`);
  }
  if (analysis.certifications?.length) {
    lines.push(`Certifications mentioned: ${analysis.certifications.join(', ')}`);
  }
  if (analysis.responsibilities?.length) {
    lines.push(
      `Key responsibilities:\n${analysis.responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    );
  }
  if (analysis.atsKeywords?.length) {
    lines.push(`Top ATS keywords (weave truthfully, max once each): ${analysis.atsKeywords.slice(0, 20).join(', ')}`);
  }
  if (analysis.actionVerbs?.length) {
    lines.push(`Action verbs from posting: ${analysis.actionVerbs.slice(0, 10).join(', ')}`);
  }

  return lines.join('\n\n');
}

module.exports = {
  analyzeJobPosting,
  formatJdAnalysisForPrompt,
  inferSeniority,
  extractYearsExperience,
  extractActionVerbs,
  extractCertificationMentions,
};
