const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assembleBlueprintResume } = require('../services/resumeBlueprintService');
const { splitExperienceJobsNormalized } = require('../services/resumeExperiencePreserveService');
const { splitJobHeaderAndBullets } = require('../services/resumeExperiencePerfectionService');
const { parseResumeStructure } = require('../services/resumeStructureService');

const leonixProfile = `LEONIX ASONGWE
Senior Platform Engineer | Azure & Databricks | Cloud Security & DevSecOps | leonix23@gmail.com 713-875-2809 leonix.online linkedin.com/in/leonix-asongwe github.com/leonix33
GenAI & Data Platforms | CKA Houston, TX | Azure | AWS | GCP | Databricks
Terraform | Kubernetes | Delta Lake | DevSecOps | Microsoft Fabric | GenAI

PROFESSIONAL SUMMARY
Senior Platform and Cloud Engineer with 9+ years of EXPERIENCE
designing, automating, securing, and operating enterprise cloud platforms across Azure, AWS, and GCP.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory, ADLS Gen2, Azure SQL, Cosmos DB
AWS Platform: EC2, VPC, IAM, S3, RDS, Lambda, CloudFormation

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA | Terraform Associate

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health | Houston, TX |
Healthcare | Azure & Databricks Platform | On-Call Rotation | SOC 2 / NIST / ISO 27001
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology | Kubernetes & DevSecOps | Azure & AWS Built and secured Kubernetes clusters including deployments, scaling, ingress controllers, and network policies – Kubernetes platform availability maintained and production incidents resolved within SLA.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services | Multi-Account AWS | Enterprise & Regulated Clients Built and operated multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise and regulated clients – infrastructure availability and SOC 2-aligned security controls maintained across all managed client environments.
Architected and deployed Azure Databricks environments from scratch including secure workspace architecture, cluster policies, VNet injection, private endpoints, and integration with Azure Data Lake, Key Vault, and Azure Data Factory – enterprise data platform supporting analytics, data engineering, and AI workloads running reliably since deployment.
Built scalable ETL pipelines in Azure Databricks using PySpark processing large datasets from ADLS Gen2 – data processing time reduced by 35% and pipeline reliability improved through Delta Lake ACID architecture.
Implemented DevSecOps pipelines with SAST, DAST, dependency scanning, and container image scanning – security control coverage established across all deployment workflows.`;

const brokenTailored = `LEONIX ASONGWE
Terraform
Kubernetes

PROFESSIONAL SUMMARY
Senior Platform and Cloud Engineer with 9+ years of EXPERIENCE designing enterprise cloud platforms.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory AWS Platform: EC2, VPC, IAM

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health | Houston, TX |
- Healthcare | Azure & Databricks Platform | On-Call Rotation | SOC 2 / NIST / ISO 27001
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology | Kubernetes & DevSecOps | Azure & AWS Built and secured Kubernetes clusters including deployments, scaling, ingress controllers, and network policies – Kubernetes platform availability maintained and production incidents resolved within SLA.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services | Multi-Account AWS | Enterprise & Regulated Clients Built and operated multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise and regulated clients – infrastructure availability and SOC 2-aligned security controls maintained across all managed client environments.
- Achieved quota targets by building scalable ETL pipelines in Azure Databricks using PySpark processing large datasets from ADLS Gen2, accelerating data processing performance by 35% and treating Delta Lake ACID architecture as high-trust collaborator core to solving pipeline reliability problems while maintaining strong recurring revenue pipeline through improved platform adoption.
- Exceeded sales quotas by improving DevOps and DevSecOps pipeline through integrating SAST, DAST, secrets detection, policy-as-code, and approval gates across Azure DevOps and GitHub Actions deployment workflows, achieving 95%+ control coverage across all deployments with findings caught pre-production while operating with autonomy to define and execute strategic territory plan.
Implemented DevSecOps pipelines with SAST, DAST, dependency scanning, and container image scanning – security control coverage established across all deployment workflows.

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA | Terraform Associate`;

describe('Leonix messy resume regression', () => {
  it('splitExperienceJobsNormalized assigns Databricks bullets to Bon Secours', () => {
    const structure = parseResumeStructure(leonixProfile);
    const exp = structure.sections.find((s) => s.key === 'experience').content;
    const jobs = splitExperienceJobsNormalized(exp);
    assert.equal(jobs.length, 3);

    const bon = jobs.find((j) => /Bon Secours/i.test(j.company));
    const bonBullets = splitJobHeaderAndBullets(bon.text).bullets;
    assert.ok(bonBullets.some((b) => /Databricks/i.test(b)), 'Bon Secours should own Databricks bullets');
    assert.ok(!bonBullets.some((b) => /sales quotas/i.test(b)));
  });

  it('assembleBlueprintResume strips fabricated sales bullets and restores layout', () => {
    const fixed = assembleBlueprintResume(leonixProfile, brokenTailored).tailoredResumeText;
    assert.ok(fixed.includes('Senior Platform Engineer | Azure & Databricks'));
    assert.ok(!fixed.includes('Exceeded sales quotas'));
    assert.ok(!fixed.includes('recurring revenue pipeline'));
    assert.ok(fixed.includes('Bon Secours Mercy Health'));
    assert.ok(fixed.includes('Wimora Technology'));
    assert.ok(fixed.includes('PRIMUS Global Services'));

    const structure = parseResumeStructure(leonixProfile);
    const expHeading = structure.sections.find((s) => s.key === 'experience').heading;
    const expStart = fixed.indexOf(expHeading);
    assert.ok(expStart >= 0);
    let expEnd = fixed.length;
    for (const section of structure.sections) {
      if (!section.heading || section.key === 'experience') continue;
      const idx = fixed.indexOf(section.heading, expStart + expHeading.length);
      if (idx > expStart && idx < expEnd) expEnd = idx;
    }
    const exp = fixed.slice(expStart + expHeading.length, expEnd);
    const jobs = splitExperienceJobsNormalized(exp);
    assert.equal(jobs.length, 3);

    const bon = jobs.find((j) => /Bon Secours/i.test(j.company));
    const wimora = jobs.find((j) => /Wimora/i.test(j.company));
    const primus = jobs.find((j) => /PRIMUS/i.test(j.company));
    assert.ok(splitJobHeaderAndBullets(bon.text).bullets.length >= 2);
    assert.ok(splitJobHeaderAndBullets(wimora.text).bullets.length >= 1);
    assert.ok(splitJobHeaderAndBullets(primus.text).bullets.length >= 1);
    assert.ok(!fixed.match(/\nTerraform\nKubernetes/));
  });

  it('removes duplicate certifications and experience blocks appended after polish', () => {
    const duplicated = `${leonixProfile}

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Cloud Platform Engineer Feb 2022 Present
- Built and secured Kubernetes clusters including deployments, scaling, ingress controllers, and network policies – Kubernetes platform availability maintained and production incidents resolved within SLA.
CERTIFICATIONS
CERTIFICATIONS
Azure DevOps Engineer Expert | CKA | Terraform Associate

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present
- Built and operated multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise and regulated clients – infrastructure availability and SOC 2-aligned security controls maintained across all managed client environments.CERTIFICATIONS`;

    const fixed = assembleBlueprintResume(leonixProfile, duplicated).tailoredResumeText;
    const certMatches = fixed.match(/\nCERTIFICATIONS\s*\n/gi) || [];
    const expMatches = fixed.match(/\nPROFESSIONAL EXPERIENCE\s*\n/gi) || [];
    assert.equal(certMatches.length, 1, 'should keep one certifications section');
    assert.equal(expMatches.length, 1, 'should keep one experience section');
    assert.ok(!fixed.includes('CERTIFICATIONSCERTIFICATIONS'));
    assert.ok(!/Cloud Platform Engineer\nCloud Platform Engineer Feb 2022 Present\nCloud Platform Engineer Feb 2022 Present/m.test(fixed));
  });
});
