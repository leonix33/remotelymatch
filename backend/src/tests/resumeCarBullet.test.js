const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  condenseCarBullet,
  splitExperienceParagraph,
  insertExperienceBulletBreaks,
} = require('../services/resumeCarBulletService');

describe('resumeCarBulletService', () => {
  const sample =
    'Architected and deployed Azure Databricks environments from scratch including secure workspace architecture, cluster policies, VNet injection, private endpoints, and integration with Azure Data Lake, Key Vault, and Azure Data Factory, as measured by enterprise data platform supporting analytics, data engineering, and AI workloads running reliably since deployment, by designing Terraform-driven Databricks automation covering clusters, ACLs, secrets, Unity Catalog governance, and workspace configuration with reproducible IaC that enabled consistent multi-environment deployments without manual intervention.';

  it('condenses CAR-style bullets to action + metric', () => {
    const out = condenseCarBullet(sample);
    assert.ok(out.length < sample.length);
    assert.ok(out.includes('Architected'));
    assert.ok(!out.includes('by designing Terraform-driven'));
  });

  it('splits multi-sentence experience blobs', () => {
    const blob = `${sample} Built scalable ETL pipelines in Azure Databricks using PySpark processing large datasets from ADLS Gen2, as measured by data processing time reduced by 35% and pipeline reliability improved through Delta Lake ACID architecture, by implementing Delta Lake with schema enforcement.`;
    const bullets = splitExperienceParagraph(blob);
    assert.ok(bullets.length >= 2);
    assert.ok(bullets.every((b) => b.length <= 340));
  });

  it('inserts bullet lines in experience section', () => {
    const text = `PROFESSIONAL EXPERIENCE
Senior Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health | Houston, TX
${sample}`;
    const out = insertExperienceBulletBreaks(text);
    assert.ok(out.includes('- Architected'));
    assert.ok(out.split('\n').filter((l) => l.trim().startsWith('-')).length >= 1);
  });
});
