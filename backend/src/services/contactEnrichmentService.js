const env = require('../config/env');
const profileService = require('./profileService');
const { decryptApiKey } = require('./openaiKeyCrypto');
const recruiterContactService = require('./recruiterContactService');

async function resolveHunterKey(userId) {
  if (env.hunterApiKey) return env.hunterApiKey;
  if (!userId) return '';
  try {
    const profile = await profileService.getRaw(userId);
    if (profile?.hunterApiKeyEncrypted) return decryptApiKey(profile.hunterApiKeyEncrypted) || '';
  } catch {
    /* ignore */
  }
  return '';
}

async function resolveApolloKey(userId) {
  if (env.apolloApiKey) return env.apolloApiKey;
  if (!userId) return '';
  try {
    const profile = await profileService.getRaw(userId);
    if (profile?.apolloApiKeyEncrypted) return decryptApiKey(profile.apolloApiKeyEncrypted) || '';
  } catch {
    /* ignore */
  }
  return '';
}

async function hunterDomainSearch(domain, apiKey) {
  if (!domain || !apiKey) return null;
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=8`;
  const res = await fetch(url);
  if (!res.ok) return { error: await res.text(), emails: [] };
  const data = await res.json();
  const row = data.data || {};
  const emails = (row.emails || []).map((e) => ({
    email: e.value,
    name: [e.first_name, e.last_name].filter(Boolean).join(' '),
    role: e.position || 'contact',
    confidence: e.confidence >= 80 ? 'high' : e.confidence >= 50 ? 'medium' : 'low',
    source: 'hunter.io',
    verified: Boolean(e.verification?.status === 'valid' || e.confidence >= 90),
  }));
  return {
    emails,
    organization: row.organization || '',
    companyPhone: row.phone || null,
    provider: 'hunter',
  };
}

async function apolloPeopleSearch(company, domain, apiKey) {
  if (!apiKey || (!company && !domain)) return null;
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: company || undefined,
      q_organization_domains: domain ? [domain] : undefined,
      person_titles: ['recruiter', 'talent acquisition', 'technical recruiter', 'hiring manager', 'people operations'],
      page: 1,
      per_page: 8,
    }),
  });
  if (!res.ok) return { error: await res.text(), people: [] };
  const data = await res.json();
  const people = (data.people || []).map((p) => ({
    name: [p.first_name, p.last_name].filter(Boolean).join(' '),
    email: p.email || '',
    role: p.title || 'recruiter / hiring',
    phone: p.phone_numbers?.[0]?.sanitized_number || p.organization?.primary_phone?.sanitized_number || '',
    linkedIn: p.linkedin_url || '',
    confidence: p.email_status === 'verified' ? 'high' : 'medium',
    source: 'apollo.io',
    verified: p.email_status === 'verified',
  }));
  const org = data.people?.[0]?.organization;
  return {
    people,
    companyPhone: org?.primary_phone?.sanitized_number || org?.phone || null,
    provider: 'apollo',
  };
}

async function enrichContacts({ userId, job = {}, jobDescription = '', baseContacts = null } = {}) {
  const base = baseContacts || recruiterContactService.discoverContacts({ job, jobDescription });
  const domain = base.companyDomain || recruiterContactService.domainFromUrl(job.url || job.applyUrl || job.jobUrl);
  const hunterKey = await resolveHunterKey(userId);
  const apolloKey = await resolveApolloKey(userId);

  const enriched = {
    ...base,
    hunterConfigured: Boolean(hunterKey),
    apolloConfigured: Boolean(apolloKey),
    verifiedContacts: [],
    companyPhone: null,
    enrichmentProviders: [],
  };

  if (hunterKey && domain) {
    try {
      const hunter = await hunterDomainSearch(domain, hunterKey);
      if (hunter?.emails?.length) {
        enriched.verifiedContacts.push(...hunter.emails);
        enriched.enrichmentProviders.push('hunter');
      }
      if (hunter?.companyPhone) enriched.companyPhone = hunter.companyPhone;
    } catch (err) {
      enriched.hunterError = err.message;
    }
  }

  if (apolloKey) {
    try {
      const apollo = await apolloPeopleSearch(job.company, domain, apolloKey);
      if (apollo?.people?.length) {
        for (const person of apollo.people) {
          enriched.verifiedContacts.push({
            email: person.email,
            name: person.name,
            role: person.role,
            phone: person.phone,
            linkedIn: person.linkedIn,
            confidence: person.confidence,
            source: 'apollo.io',
            verified: person.verified,
          });
        }
        enriched.enrichmentProviders.push('apollo');
      }
      if (!enriched.companyPhone && apollo?.companyPhone) enriched.companyPhone = apollo.companyPhone;
    } catch (err) {
      enriched.apolloError = err.message;
    }
  }

  const seen = new Set();
  enriched.verifiedContacts = enriched.verifiedContacts.filter((c) => {
    const key = (c.email || c.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return enriched;
}

async function getEnrichmentStatus(userId) {
  return {
    hunterConfigured: Boolean(await resolveHunterKey(userId)),
    apolloConfigured: Boolean(await resolveApolloKey(userId)),
  };
}

async function testEnrichmentProviders(userId, { domain = 'stripe.com', company = 'Stripe' } = {}) {
  const hunterKey = await resolveHunterKey(userId);
  const apolloKey = await resolveApolloKey(userId);
  const result = {
    hunterConfigured: Boolean(hunterKey),
    apolloConfigured: Boolean(apolloKey),
    sampleDomain: domain,
    sampleCompany: company,
    hunter: { tested: false, ok: false, emailCount: 0, message: 'Not configured' },
    apollo: { tested: false, ok: false, peopleCount: 0, message: 'Not configured' },
  };

  if (hunterKey) {
    result.hunter.tested = true;
    try {
      const hunter = await hunterDomainSearch(domain, hunterKey);
      if (hunter?.error) {
        result.hunter.message = 'Hunter API rejected the request — check your API key on Render';
      } else {
        result.hunter.ok = true;
        result.hunter.emailCount = hunter.emails?.length || 0;
        result.hunter.message =
          result.hunter.emailCount > 0
            ? `Found ${result.hunter.emailCount} emails at ${domain}`
            : `Connected — no public emails at ${domain} (normal for some companies)`;
      }
    } catch (err) {
      result.hunter.message = err.message || 'Hunter request failed';
    }
  }

  if (apolloKey) {
    result.apollo.tested = true;
    try {
      const apollo = await apolloPeopleSearch(company, domain, apolloKey);
      if (apollo?.error) {
        result.apollo.message = 'Apollo API rejected the request — check your API key on Render';
      } else {
        result.apollo.ok = true;
        result.apollo.peopleCount = apollo.people?.length || 0;
        result.apollo.message =
          result.apollo.peopleCount > 0
            ? `Found ${result.apollo.peopleCount} recruiters at ${company}`
            : `Connected — no recruiter matches for sample search (API is working)`;
      }
    } catch (err) {
      result.apollo.message = err.message || 'Apollo request failed';
    }
  }

  return result;
}

module.exports = {
  enrichContacts,
  getEnrichmentStatus,
  testEnrichmentProviders,
  hunterDomainSearch,
  apolloPeopleSearch,
};
