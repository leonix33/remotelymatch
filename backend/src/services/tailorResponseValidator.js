const { splitExperienceContentIntoJobs } = require('./resumeExperiencePreserveService');
const { splitJobHeaderAndBullets } = require('./resumeExperiencePerfectionService');
const { TARGET_BULLETS_PER_JOB } = require('../config/tailorDefaults');

function normalizeCompanyKey(company) {
  return String(company || '')
    .split(/\s*\|\s*/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExperienceText(response, structure) {
  if (response?.experience?.trim()) return response.experience.trim();
  const expHeading = structure.sections.find((s) => s.key === 'experience')?.heading;
  const fromSections = (response?.sections || []).find(
    (s) => s.heading === expHeading || /experience/i.test(s.heading || '')
  );
  return fromSections?.content?.trim() || '';
}

function getSummaryText(response, structure) {
  if (response?.summary?.trim()) return response.summary.trim();
  const summaryHeading = structure.sections.find((s) => s.key === 'summary')?.heading;
  const fromSections = (response?.sections || []).find(
    (s) => s.heading === summaryHeading || /summary|profile/i.test(s.heading || '')
  );
  return fromSections?.content?.trim() || '';
}

/**
 * Validate structured tailor output before reassembling the resume.
 */
function validateTailorResponse(response, { structure, experienceBlueprint = [] } = {}) {
  const errors = [];
  const warnings = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object'], warnings };
  }

  const summary = getSummaryText(response, structure);
  const experience = getExperienceText(response, structure);

  if (!summary || summary.length < 40) {
    errors.push('Summary is missing or too short');
  }

  if (!experience || experience.length < 80) {
    errors.push('Experience section is missing or too short');
  }

  if (experience) {
    const tailoredJobs = splitExperienceContentIntoJobs(experience);
    if (experienceBlueprint.length && tailoredJobs.length !== experienceBlueprint.length) {
      errors.push(
        `Experience job count mismatch: expected ${experienceBlueprint.length}, got ${tailoredJobs.length}`
      );
    }

    for (let i = 0; i < experienceBlueprint.length; i += 1) {
      const expected = experienceBlueprint[i];
      const tailored = tailoredJobs[i];
      if (!tailored) {
        errors.push(`Missing job ${i + 1}: ${expected.company || expected.title || 'employer'}`);
        continue;
      }

      const companyKey = normalizeCompanyKey(expected.company);
      const tailoredKey = normalizeCompanyKey(tailored.company);
      if (companyKey && tailoredKey && companyKey !== tailoredKey) {
        warnings.push(`Job ${i + 1} company may have changed: ${expected.company} → ${tailored.company}`);
      }

      const bullets = splitJobHeaderAndBullets(tailored.text).bullets;
      const minBullets = Math.min(
        expected.bulletCount || TARGET_BULLETS_PER_JOB,
        expected.originalBulletCount || bullets.length
      );
      if (bullets.length < Math.max(2, minBullets - 2)) {
        errors.push(
          `Job ${i + 1} (${expected.company || expected.title}) has ${bullets.length} bullets; expected ~${expected.bulletCount || TARGET_BULLETS_PER_JOB}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function formatValidationErrors(validation) {
  if (!validation?.errors?.length) return '';
  return validation.errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

module.exports = {
  validateTailorResponse,
  formatValidationErrors,
  getExperienceText,
  getSummaryText,
};
