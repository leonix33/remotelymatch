import { defineStore } from 'pinia';
import http from '../api/http';
import { readProfileCache, writeProfileCache, clearProfileCache } from '../utils/profileDraft';
import { isUnreadableResumeText, sanitizeResumeProfile, sleep } from '../utils/resumeText';
import { prepareResumeTextForParsing } from '../utils/resumeRepair';

function currentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.id || user?._id || null;
  } catch {
    return null;
  }
}

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: null,
    loaded: false,
    fetching: false,
  }),
  getters: {
    complete: (s) => Boolean(s.profile?.complete),
    completionPct: (s) => {
      const p = s.profile;
      if (!p) return 0;
      const checks = [
        Boolean(p.applicantName?.trim() || p.displayName?.trim()),
        Boolean(p.targetTitles?.length),
        Boolean(p.mustHaveSkills?.length),
        Boolean((p.resumeText || '').trim().length >= 50),
        Boolean(p.headline?.trim()),
        Boolean(p.niceToHaveSkills?.length || p.targetCompanies?.length),
        Boolean(p.linkedin?.trim() || p.github?.trim() || p.portfolio?.trim()),
        Boolean(p.onboardingComplete),
      ];
      return Math.round((checks.filter(Boolean).length / checks.length) * 100);
    },
    resumeScore: (s) => s.profile?.resumeScore ?? 0,
    extractedSkills: (s) => s.profile?.extractedSkills || [],
  },
  actions: {
    hydrateFromCache() {
      const userId = currentUserId();
      const cached = readProfileCache(userId);
      if (cached) {
        this.profile = sanitizeResumeProfile(cached);
        this.loaded = true;
      }
      return this.profile;
    },
    async fetch() {
      const userId = currentUserId();
      if (!this.loaded) this.hydrateFromCache();
      this.fetching = true;
      try {
        const { data } = await http.get('/profile/me');
        this.profile = sanitizeResumeProfile(data);
        this.loaded = true;
        writeProfileCache(userId, this.profile);
        return this.profile;
      } finally {
        this.fetching = false;
      }
    },
    async save(payload, { retries = 2 } = {}) {
      const userId = currentUserId();
      const clean = { ...payload };
      if (clean.resumeText && isUnreadableResumeText(clean.resumeText)) {
        throw new Error('Resume text is not readable. Upload PDF or .docx instead of raw file data.');
      }
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const { data } = await http.patch('/profile/me', clean);
          this.profile = sanitizeResumeProfile({ ...this.profile, ...data });
          this.loaded = true;
          writeProfileCache(userId, this.profile);
          return this.profile;
        } catch (error) {
          lastError = error;
          const status = error?.response?.status;
          if (attempt < retries && (status === 502 || status === 503 || status === 504 || !status)) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    },
    async saveResumeText(resumeText, { resumeFileName = '', extra = {} } = {}) {
      if (isUnreadableResumeText(resumeText)) {
        throw new Error('Could not read this file. Try PDF or paste your resume text.');
      }
      const normalized = prepareResumeTextForParsing(resumeText);
      return this.save(
        {
          resumeText: normalized,
          resumeFileName,
          ...extra,
        },
        { retries: 3 }
      );
    },
    async clearResume() {
      const userId = currentUserId();
      const data = await this.save({ resumeText: '', resumeFileName: '', extractedSkills: [] });
      clearProfileCache(userId);
      writeProfileCache(userId, data);
      return data;
    },
    async parseResume({ fileBase64, filename, applyToProfile = false, mergeSkills = true, resumeText }) {
      const userId = currentUserId();
      const payload = {
        filename,
        applyToProfile,
        mergeSkills,
      };
      if (resumeText) {
        payload.resumeText = resumeText;
      } else {
        payload.fileBase64 = fileBase64;
      }
      const { data } = await http.post('/profile/resume/parse', payload);
      if (data.profile) {
        this.profile = data.profile;
        this.loaded = true;
        writeProfileCache(userId, this.profile);
      }
      return data;
    },
    reset() {
      this.profile = null;
      this.loaded = false;
      this.fetching = false;
    },
    async toggleSavedJob(job) {
      const saved = [...(this.profile?.savedJobs || [])];
      const idx = saved.findIndex((s) => s.jobId === job.jobId);
      if (idx >= 0) {
        saved.splice(idx, 1);
      } else {
        saved.unshift({
          jobId: job.jobId,
          title: job.title,
          company: job.company,
          url: job.url,
          matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
          savedAt: new Date().toISOString(),
        });
      }
      return this.save({ savedJobs: saved });
    },
    isJobSaved(jobId) {
      return Boolean(this.profile?.savedJobs?.some((s) => s.jobId === jobId));
    },
  },
});
