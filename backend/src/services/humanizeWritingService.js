const BANNED_PHRASES = [
  [/\bI am excited to\b/gi, "I'm applying for"],
  [/\bI'm excited to\b/gi, "I'm applying for"],
  [/\bI am passionate about\b/gi, 'I work on'],
  [/\bI'm passionate about\b/gi, 'I work on'],
  [/\bthrilled to\b/gi, ''],
  [/\bleverage\b/gi, 'use'],
  [/\butilize\b/gi, 'use'],
  [/\bcutting-edge\b/gi, ''],
  [/\brobust\b/gi, ''],
  [/\bsynergy\b/gi, ''],
  [/\bdelve\b/gi, ''],
  [/\bproven track record\b/gi, 'experience'],
  [/\bdynamic team player\b/gi, ''],
  [/\bresults-driven\b/gi, ''],
  [/\bin today's fast-paced\b/gi, ''],
  [/\bat the forefront of\b/gi, ''],
  [/\bseamlessly\b/gi, ''],
  [/\bholistic\b/gi, ''],
  [/\bas an AI\b/gi, ''],
  [/\bAI-generated\b/gi, ''],
  [/\bAI tailored\b/gi, ''],
  [/\btailored by AI\b/gi, ''],
  [/\bChatGPT\b/gi, ''],
  [/\bword-for-word\b/gi, ''],
  [/\bJD phrase\b/gi, ''],
  [/\bATS keyword\b/gi, ''],
];

const HUMAN_WRITING_PROMPT = `Write like the candidate drafted their own resume and cover letter — not a bot, template, or career coach.

VOICE:
- Direct, professional, plain English. Short and long sentences mixed naturally.
- Contractions are fine (I'm, we've, it's) where they sound human.
- Concrete verbs: built, shipped, owned, debugged, migrated, led, maintained, certified.
- Only facts from the candidate's resume — never invent employers, dates, certs, or metrics.

STRICTLY FORBIDDEN in resume/cover letter text:
- Emojis or special Unicode symbols
- Meta labels: "addendum", "supplement", "JD mapping", "ATS glossary", "keyword alignment", "high-match", "AI", "generated"
- Section titles like "Role alignment addendum" or "JD phrase → evidence"
- Marketing fluff: excited, passionate, thrilled, leverage, utilize, cutting-edge, robust, synergy, delve, seamlessly, holistic, results-driven
- Percentage match scores or "target ~90% fit" language

CREDENTIALS RULE:
- Every certification, license, credential, and education line from the original resume MUST appear in the tailored resume verbatim or with only minor formatting cleanup — never drop them.`;

const RECRUITER_META_LINE =
  /^(ADDENDUM|SUPPLEMENT|ATS |JD |TARGET:|SECTION —|KEYWORDS TO MIRROR|TECHNICAL SUPPLEMENT|COVER LETTER & ATS|ROLE ALIGNMENT|HIGH MATCH|PAGE \d+ —)/i;

function stripEmojis(text = '') {
  return String(text).replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
    ''
  );
}

function stripRecruiterMetaLabels(text = '') {
  return String(text)
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^=+.*=+$/.test(t)) return false;
      if (/^---.*---$/.test(t)) return false;
      if (RECRUITER_META_LINE.test(t)) return false;
      if (/^APPLICATION KIT/i.test(t)) return false;
      return true;
    })
    .join('\n');
}

function humanizeResumeBody(text = '') {
  return String(text)
    .split('\n')
    .map((line) => {
      let out = stripEmojis(line);
      for (const [pattern, replacement] of BANNED_PHRASES) {
        out = out.replace(pattern, replacement);
      }
      return out.replace(/  +/g, ' ').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanizeText(text = '') {
  let out = stripEmojis(String(text));
  for (const [pattern, replacement] of BANNED_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  out = stripRecruiterMetaLabels(out);
  return out.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function humanizeKit(kit) {
  if (!kit) return kit;
  const next = { ...kit };

  if (next.coverLetterParagraph) {
    next.coverLetterParagraph = humanizeText(next.coverLetterParagraph);
  }
  if (next.resumeAddendum) {
    next.resumeAddendum = humanizeResumeBody(next.resumeAddendum);
  }
  if (next.tailoredResumeText) {
    next.tailoredResumeText = humanizeResumeBody(stripRecruiterMetaLabels(next.tailoredResumeText));
  }
  if (Array.isArray(next.supplementPages)) {
    next.supplementPages = next.supplementPages.map((page) => ({
      ...page,
      title: humanizeText(page.title).replace(/addendum|supplement|jd /gi, '').trim() || 'Resume',
      content: humanizeResumeBody(stripRecruiterMetaLabels(page.content)),
    }));
  }
  if (next.fullSupplementText) {
    next.fullSupplementText = humanizeResumeBody(stripRecruiterMetaLabels(next.fullSupplementText));
  }
  if (next.formatted) {
    next.formatted = humanizeText(next.formatted);
  }

  if (next.tailoredResumeText) {
    next.fullSupplementText = next.tailoredResumeText;
    if (!next.supplementPages?.length) {
      next.supplementPages = [{ page: 1, title: 'Resume', content: next.tailoredResumeText }];
    }
    next.resumeAddendum = next.tailoredResumeText;
    next.pageCount = next.supplementPages.length;
  }

  return next;
}

module.exports = {
  HUMAN_WRITING_PROMPT,
  humanizeText,
  humanizeKit,
  stripEmojis,
  stripRecruiterMetaLabels,
};
