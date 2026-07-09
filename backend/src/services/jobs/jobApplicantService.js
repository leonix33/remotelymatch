/**
 * Applicant count parsing, oversaturation gates, and scoring helpers.
 */

function parseApplicantCount(input) {
  if (input == null || input === '') return null;

  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) {
    return {
      applicantCount: Math.round(input),
      applicantCountLabel: `${Math.round(input)} applicants`,
      applicantCountCapped: false,
    };
  }

  const text = String(input).trim();
  if (!text) return null;

  const over = text.match(/over\s+(\d[\d,]*)\s+applicants?/i);
  if (over) {
    const n = Number(over[1].replace(/,/g, ''));
    return {
      applicantCount: n,
      applicantCountLabel: `Over ${n} applicants`,
      applicantCountCapped: true,
    };
  }

  const among = text.match(/among the first\s+(\d[\d,]*)\s+applicants?/i);
  if (among) {
    const n = Number(among[1].replace(/,/g, ''));
    return {
      applicantCount: n,
      applicantCountLabel: `First ${n} applicants`,
      applicantCountCapped: false,
    };
  }

  const plain = text.match(/(\d[\d,]*)\s+applicants?/i);
  if (plain) {
    const n = Number(plain[1].replace(/,/g, ''));
    return {
      applicantCount: n,
      applicantCountLabel: `${n} applicants`,
      applicantCountCapped: false,
    };
  }

  return null;
}

function attachApplicantFields(job = {}, rawCount) {
  const parsed = parseApplicantCount(rawCount ?? job.applicantCount ?? job.applicantCountLabel);
  if (!parsed) return { ...job };

  return {
    ...job,
    applicantCount: parsed.applicantCount,
    applicantCountLabel: parsed.applicantCountLabel,
    applicantCountCapped: parsed.applicantCountCapped,
  };
}

function isOversaturated(job = {}, maxApplicants = 75) {
  const count = job.applicantCount;
  if (count == null || !Number.isFinite(count)) return false;
  if (job.applicantCountCapped && count >= maxApplicants) return true;
  return count > maxApplicants;
}

function applicantCountPoints(job = {}, maxApplicants = 75) {
  const count = job.applicantCount;
  if (count == null || !Number.isFinite(count)) {
    return { points: 0, label: null, oversaturated: false };
  }

  if (isOversaturated(job, maxApplicants)) {
    return {
      points: -18,
      label: job.applicantCountLabel || `${count}+ applicants — oversaturated`,
      oversaturated: true,
    };
  }

  if (count > 50) {
    return { points: -6, label: job.applicantCountLabel || `${count} applicants — competitive`, oversaturated: false };
  }

  if (count <= 25) {
    return { points: 8, label: job.applicantCountLabel || `${count} applicants — winnable`, oversaturated: false };
  }

  return { points: 0, label: job.applicantCountLabel || `${count} applicants`, oversaturated: false };
}

module.exports = {
  parseApplicantCount,
  attachApplicantFields,
  isOversaturated,
  applicantCountPoints,
};
