const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTailoredResumeLayout, formatSkillsSectionContent } = require('../services/resumeKitLayoutService');
const { splitExperienceContentIntoJobs } = require('../services/resumeExperiencePreserveService');
const { parseResumeStructure } = require('../services/resumeStructureService');
const { splitJobHeaderAndBullets } = require('../services/resumeExperiencePerfectionService');

const leonixResume = `LEONIX ASONGWE
leonix23@gmail.com | 713-875-2809

PROFESSIONAL SUMMARY
Senior platform engineer with Azure and Databricks experience.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory AWS Platform: EC2, VPC, IAM Databricks & Data Platforms: Unity Catalog, Delta Lake

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
Houston, TX
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.
- Designed secure Azure network architectures for SOC 2 compliance.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
- Managed Kubernetes clusters on AKS with Terraform automation.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
- Led on-premises to cloud migration programs with SOC 2 aligned controls.

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA | Terraform Associate`;

const messyPolish = `LEONIX ASONGWE
Senior Platform Engineer | Azure & Databricks

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory, ADLS Gen2 Azure SQL Cosmos DB Microsoft Fabric AWS Platform: EC2, VPC, IAM S3 RDS Lambda

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health | Houston, TX |
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology | Kubernetes & DevSecOps | Azure & AWS Built and secured Kubernetes clusters including deployments, scaling, ingress controllers, and network policies – Kubernetes platform availability maintained and production incidents resolved within SLA.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services | Multi-Account AWS | Enterprise & Regulated Clients Built and operated multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise and regulated clients – infrastructure availability and SOC 2-aligned security controls maintained across all managed client environments.
- Healthcare | Azure & Databricks Platform | On-Call Rotation | SOC 2 / NIST / ISO 27001
Architected and deployed Azure Databricks environments from scratch including secure workspace architecture, cluster policies, VNet injection, private endpoints, and integration with Azure Data Lake, Key Vault, and Azure Data Factory – enterprise data platform supporting analytics, data engineering, and AI workloads running reliably since deployment.
Built scalable ETL pipelines in Azure Databricks using PySpark processing large datasets from ADLS Gen2 – data processing time reduced by 35% and pipeline reliability improved through Delta Lake ACID architecture.
Implemented DevSecOps pipelines with SAST, DAST, dependency scanning, and container image scanning – security control coverage established across all deployment workflows.`;

describe('resumeLayoutService', () => {
  it('formats skills categories on separate lines', () => {
    const formatted = formatSkillsSectionContent(
      'Azure Platform: AKS, ADF Microsoft Fabric AWS Platform: EC2, VPC Databricks & Data Platforms: Delta Lake'
    );
    assert.ok(formatted.includes('Azure Platform:'));
    assert.ok(formatted.includes('\n\nAWS Platform:'));
    assert.ok(formatted.includes('\n\nDatabricks & Data Platforms:'));
  });

  it('normalizes messy polish into neat multi-line jobs with all bullets', () => {
    const restored = normalizeTailoredResumeLayout(leonixResume, messyPolish);
    const structure = parseResumeStructure(leonixResume);
    const exp = extractExp(restored);
    const jobs = splitExperienceContentIntoJobs(exp);

    assert.equal(jobs.length, 3);
    assert.ok(restored.includes('Bon Secours Mercy Health'));
    assert.ok(restored.includes('Wimora Technology'));
    assert.ok(restored.includes('PRIMUS Global Services'));
    assert.ok(!restored.includes('Healthcare | Azure & Databricks Platform | On-Call'));

    const bonBlock = jobs.find((j) => /Bon Secours/i.test(j.company));
    const bonBullets = splitJobHeaderAndBullets(bonBlock.text).bullets;
    assert.ok(bonBullets.length >= 3, `Bon Secours should have 3+ bullets, got ${bonBullets.length}`);
    assert.ok(bonBullets.some((b) => /Databricks/i.test(b)));

    assert.ok(restored.includes('\n\nAWS Platform:') || restored.includes('AWS Platform:'));
  });

  it('fixes wrong section order, invented summary, and orphan bullets from user mess', () => {
    const { repairKitAgainstProfile } = require('../services/resumeTailorService');
    const profile = leonixResume;
    const uglyKit = {
      tailored: true,
      tailoredResumeText: `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Design Engineer with extensive experience in PostgreSQL and developer tools.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress) Bachelor of Science
Mathematics | University of Yaounde, Cameroon
CERTIFICATIONS
Azure DevOps Engineer Expert | CKA
PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health | Houston, TX |
- Healthcare | Azure & Databricks Platform | On-Call Rotation | SOC 2 / NIST / ISO 27001
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology | Kubernetes & DevSecOps | Azure & AWS Built and secured Kubernetes clusters including deployments, scaling, ingress controllers, and network policies – Kubernetes platform availability maintained and production incidents resolved within SLA.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services | Multi-Account AWS | Enterprise & Regulated Clients Built and operated multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise and regulated clients – infrastructure availability and SOC 2-aligned security controls maintained across all managed client environments.
- Architected and deployed Azure Databricks environments from scratch including secure workspace architecture, cluster policies, VNet injection, private endpoints, and integration with Azure Data Lake, Key Vault, and Azure Data Factory – enterprise data platform supporting analytics, data engineering, and AI workloads running reliably since deployment.
- Built scalable ETL pipelines in Azure Databricks using PySpark, processing large datasets from ADLS Gen2, resulting in a 35% reduction in data processing time and enhanced pipeline reliability through Delta Lake ACID architecture.
- Implemented DevSecOps pipelines with SAST, DAST, dependency scanning, and container image scanning – security control coverage established across all deployment workflows.
- Managed Azure and AWS environments including identity federation, RBAC, secrets management, and audit logging – identity governance and security standards maintained across managed environments.
- Supported on-premises to AWS migration initiatives modernizing legacy workloads and improving scalability – legacy workloads migrated with operational continuity maintained across all client migration programs.`,
    };

    const repaired = repairKitAgainstProfile(profile, uglyKit);
    const text = repaired.tailoredResumeText;
    const expIdx = text.search(/PROFESSIONAL EXPERIENCE/i);
    const eduIdx = text.search(/EDUCATION/i);

    assert.ok(expIdx >= 0 && eduIdx >= 0 && expIdx < eduIdx, 'experience should appear before education');
    assert.ok(!text.includes('Design Engineer'), 'summary should not invent Design Engineer');
    assert.ok(text.includes('Senior platform engineer') || text.includes('Platform'));

    const exp = extractExp(text);
    const jobs = splitExperienceContentIntoJobs(exp);
    assert.equal(jobs.length, 3);
    const bon = jobs.find((j) => /Bon Secours/i.test(j.company));
    const wimora = jobs.find((j) => /Wimora/i.test(j.company));
    const primus = jobs.find((j) => /PRIMUS/i.test(j.company));
    assert.ok(splitJobHeaderAndBullets(bon.text).bullets.length >= 3);
    assert.ok(splitJobHeaderAndBullets(wimora.text).bullets.length >= 2);
    assert.ok(splitJobHeaderAndBullets(primus.text).bullets.length >= 2);
  });
});

function extractExp(text) {
  const structure = parseResumeStructure(leonixResume);
  const heading = structure.sections.find((s) => s.key === 'experience')?.heading || 'PROFESSIONAL EXPERIENCE';
  const idx = text.indexOf(heading);
  if (idx < 0) return '';
  const after = text.slice(idx + heading.length);
  const end = after.search(/\nEDUCATION\n/i);
  return (end >= 0 ? after.slice(0, end) : after).trim();
}
