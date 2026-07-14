const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitExperienceContentIntoJobs,
  preserveExperienceFromOriginal,
  stripMisplacedEducationBlob,
} = require('../services/resumeExperiencePreserveService');
const { parseResumeStructure } = require('../services/resumeStructureService');
const { finalizeTailoredResume } = require('../services/resumeTailorService');

const leonixResume = `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Senior platform engineer with Azure and Databricks experience.

EDUCATION
designing, automating, securing, and operating enterprise cloud platforms across Azure, AWS, and GCP. Extensive certification portfolio across Azure (5 certs), AWS (4 certs), and Databricks (3 certs).
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA | Terraform Associate

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
Houston, TX
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
- Managed Kubernetes clusters on AKS with Terraform automation.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
- Led on-premises to cloud migration programs with SOC 2 aligned controls.`;

describe('resumeExperiencePreserveService', () => {
  it('splits flat and multi-line job headers into separate roles', () => {
    const structure = parseResumeStructure(leonixResume);
    const exp = structure.sections.find((s) => s.key === 'experience');
    const jobs = splitExperienceContentIntoJobs(exp.content);

    assert.equal(jobs.length, 3);
    assert.match(jobs[0].company, /Bon Secours/i);
    assert.match(jobs[1].company, /Wimora/i);
    assert.match(jobs[2].company, /PRIMUS/i);
  });

  it('injects missing employers from the original resume', () => {
    const tailoredOnlyBonSecours = `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
DevOps Engineer with Azure and Kubernetes experience.

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark.

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA`;

    const restored = preserveExperienceFromOriginal(leonixResume, tailoredOnlyBonSecours);
    assert.ok(restored.includes('Bon Secours Mercy Health'));
    assert.ok(restored.includes('Wimora Technology'));
    assert.ok(restored.includes('PRIMUS Global Services'));
    assert.ok(restored.includes('DevSecOps pipelines'));
    assert.ok(restored.includes('multi-account AWS environments'));
  });

  it('parseResumeStructure strips certification summary blobs from education', () => {
    const structure = parseResumeStructure(leonixResume);
    const edu = structure.sections.find((s) => s.key === 'education')?.content || '';
    assert.ok(!edu.includes('certification portfolio across Azure'));
    assert.ok(edu.includes('Western Governors University'));
    assert.ok(edu.includes('University of Yaounde'));
  });

  it('strips misplaced certification summary blob from education', () => {
    const structure = parseResumeStructure(leonixResume);
    const blobOnly = `LEONIX ASONGWE

EDUCATION
designing, automating, securing, and operating enterprise cloud platforms across Azure, AWS, and GCP. Extensive certification portfolio across Azure (5 certs), AWS (4 certs), and Databricks (3 certs).
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
CKA`;

    const cleaned = stripMisplacedEducationBlob(blobOnly, structure);
    assert.ok(!cleaned.includes('certification portfolio across Azure'));
    assert.ok(cleaned.includes('Western Governors University'));
    assert.ok(cleaned.includes('University of Yaounde'));
  });

  it('restores missing accomplishment bullets within a kept job', () => {
    const tailoredThinBonSecours = `LEONIX ASONGWE

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
- Managed Kubernetes clusters on AKS with Terraform automation.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
- Led on-premises to cloud migration programs with SOC 2 aligned controls.`;

    const restored = preserveExperienceFromOriginal(leonixResume, tailoredThinBonSecours);
    assert.ok(restored.includes('Built scalable ETL pipelines using PySpark and Delta Lake'));
    assert.ok(restored.includes('Wimora Technology'));
    assert.ok(restored.includes('PRIMUS Global Services'));
  });

  it('keeps original job order even when AI reorders employers', () => {
    const reordered = `LEONIX ASONGWE

PROFESSIONAL EXPERIENCE
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.`;

    const restored = preserveExperienceFromOriginal(leonixResume, reordered);
    const bonIdx = restored.indexOf('Bon Secours Mercy Health');
    const wimoraIdx = restored.indexOf('Wimora Technology');
    const primusIdx = restored.indexOf('PRIMUS Global Services');
    assert.ok(bonIdx >= 0 && wimoraIdx > bonIdx && primusIdx > wimoraIdx);
  });

  it('repairKitAgainstProfile restores all employers and cleans education for Leonix-style resumes', () => {
    const { repairKitAgainstProfile } = require('../services/resumeTailorService');
    const brokenKit = {
      tailored: true,
      pageCount: 4,
      supplementPagesTarget: 4,
      tailoredResumeText: `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Azure DevOps Engineer with over 9 years of experience.

TECHNICAL SKILLS
Azure Platform: AKS, Azure Data Factory, ADLS Gen2…

EDUCATION
🎓
designing, automating, securing, and operating enterprise cloud platforms across Azure, AWS, and GCP. Deep expertise in Azure platform engineering.
Master of Science Information Technology | Western Governors University | Expected Dec 2026 (In Progress)

CERTIFICATIONS
Azure DevOps Engineer Expert | Azure Data Engineer Associate |

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.`,
    };

    const repaired = repairKitAgainstProfile(leonixResume, brokenKit);
    assert.ok(repaired.tailoredResumeText.includes('Wimora Technology'));
    assert.ok(repaired.tailoredResumeText.includes('PRIMUS Global Services'));
    assert.ok(!repaired.tailoredResumeText.includes('enterprise cloud platforms across Azure, AWS, and GCP'));
    assert.ok(repaired.tailoredResumeText.includes('Western Governors University'));
    assert.ok(repaired.tailoredResumeText.includes('University of Yaounde'));
    assert.ok(repaired.tailoredResumeText.includes('CKA'));
  });

  it('finalizeTailoredResume restores all jobs when AI returns only the latest role', () => {
    const structure = parseResumeStructure(leonixResume);
    const kit = {
      sections: [
        {
          heading: 'PROFESSIONAL SUMMARY',
          content: 'DevOps Engineer with 9+ years securing Azure and AWS platforms.',
        },
        {
          heading: 'PROFESSIONAL EXPERIENCE',
          content: `Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.`,
        },
        {
          heading: 'EDUCATION',
          content: structure.sections.find((s) => s.key === 'education').content,
        },
        {
          heading: 'CERTIFICATIONS',
          content: structure.sections.find((s) => s.key === 'certifications').content,
        },
      ],
    };

    const final = finalizeTailoredResume(leonixResume, structure, kit);
    assert.ok(final.includes('Wimora Technology'));
    assert.ok(final.includes('PRIMUS Global Services'));
    assert.ok(final.includes('Bon Secours Mercy Health'));
  });
});
