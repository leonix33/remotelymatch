const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeResumeLayout, isStructuredResume } = require('../services/resumeLayoutService');
const { parseResumeStructure } = require('../services/resumeStructureService');

describe('resumeLayoutService', () => {
  const flatPdfBlob = `LEONIX ASONGWE leonix23@gmail.com | (555) 123-4567 PROFESSIONAL SUMMARY Senior platform engineer with Azure, Databricks, and Kubernetes experience across enterprise environments. EXPERIENCE Senior Platform Engineer | Acme Corp Jan 2020 – Present - Built CI/CD pipelines on Azure DevOps - Managed Databricks workspaces and Unity Catalog EDUCATION B.S. Computer Science — State University, 2018 CERTIFICATIONS AWS Solutions Architect Associate, Azure Administrator Associate, Databricks Certified Data Engineer`;

  it('reconstructs sections from flattened PDF-style text', () => {
    const normalized = normalizeResumeLayout(flatPdfBlob);
    assert.ok(isStructuredResume(normalized) || normalized.includes('\n'));
    assert.ok(normalized.includes('PROFESSIONAL SUMMARY'));
    assert.ok(normalized.includes('EXPERIENCE'));
    assert.ok(normalized.includes('CERTIFICATIONS'));
    assert.ok(normalized.indexOf('EXPERIENCE') < normalized.indexOf('EDUCATION'));
  });

  it('parses reconstructed text into ordered sections', () => {
    const normalized = normalizeResumeLayout(flatPdfBlob);
    const structure = parseResumeStructure(normalized);
    const keys = structure.sections.map((s) => s.key);
    assert.ok(keys.includes('summary'));
    assert.ok(keys.includes('experience'));
    assert.ok(keys.includes('education'));
    assert.ok(keys.includes('certifications'));
    assert.ok(structure.headerLines.join(' ').includes('LEONIX'));
  });

  it('preserves already-structured resumes', () => {
    const structured = `Alex Rivera\nalex@email.com\n\nEXPERIENCE\nSenior DevOps Engineer — Acme\n- Managed Kubernetes\n\nEDUCATION\nB.S. CS`;
    const normalized = normalizeResumeLayout(structured);
    assert.ok(normalized.includes('EXPERIENCE'));
    assert.ok(normalized.includes('Managed Kubernetes'));
  });
});
