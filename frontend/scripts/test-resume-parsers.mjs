import { parseResumeForDisplay } from '../src/utils/resumeDocument.js';

const sample = `LEONIX ASONGWE
Senior Platform Engineer
leonix23@gmail.com

PROFESSIONAL SUMMARY
Azure DevOps Engineer with over 9 years of experience in cloud engineering.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory, ADLS Gen2

EDUCATION
designing, automating, securing, and operating enterprise cloud platforms across Azure, AWS, and GCP. Extensive certification portfolio across Azure (5 certs), AWS (4 certs), and Databricks (3 certs).
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress) Bachelor of Science
Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure (5)
Azure DevOps Engineer Expert | Azure Data Engineer Associate | Azure AI Engineer Associate |
Azure Administrator Associate | Azure Generative AI Fundamentals
AWS (4)
Solutions Architect Associate | Developer Associate | SysOps Administrator Associate | Cloud Practitioner
Security & Infra
CKA | Terraform Associate | Security+ | Network+

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
Houston, TX
Healthcare | Azure & Databricks Platform
Architected and deployed Azure Databricks environments from scratch, including secure workspace architecture.
Built scalable ETL pipelines in Databricks using PySpark, processing large datasets from ADLS Gen2.
DevOps Engineer
Jan 2019 – Jan 2022
Acme Health Systems
Dallas, TX
Built CI/CD pipelines on Azure DevOps and managed Kubernetes clusters.
Led migration of on-premises workloads to Azure with Terraform and ARM templates.
Cloud Engineer
Jun 2016 – Dec 2018
Tech Solutions Inc
Austin, TX
Managed AWS infrastructure and implemented monitoring with CloudWatch and Grafana.`;

const doc = parseResumeForDisplay(sample);
const experience = doc.sections.find((s) => s.key === 'experience');
const education = doc.sections.find((s) => s.key === 'education');
const certs = doc.sections.find((s) => s.key === 'certifications');

const jobBlocks = experience?.lines?.filter((r) => r.type === 'job-block') || [];
const eduBlocks = education?.lines?.filter((r) => r.type === 'education-block') || [];
const certGroups = certs?.lines?.filter((r) => r.type === 'cert-group') || [];

const bullets = experience?.lines?.filter((r) => r.type === 'bullet') || [];
console.log('jobs parsed:', jobBlocks.length, jobBlocks.map((j) => j.title));
console.log('experience bullets:', bullets.length);
console.log('education blocks:', eduBlocks.length, eduBlocks.map((e) => e.degree?.slice(0, 40)));
console.log('cert groups:', certGroups.length, certGroups.map((c) => `${c.label} (${c.items.length})`));

if (jobBlocks.length < 3) {
  console.error('FAIL: expected 3 jobs, got', jobBlocks.length);
  process.exit(1);
}
if (bullets.length < 5) {
  console.error('FAIL: expected 5+ experience bullets from structured resume, got', bullets.length);
  process.exit(1);
}
if (eduBlocks.length < 2) {
  console.error('FAIL: expected 2 education blocks, got', eduBlocks.length);
  process.exit(1);
}
if (certGroups.length < 2) {
  console.error('FAIL: expected 2+ cert groups, got', certGroups.length);
  process.exit(1);
}

console.log('OK');
