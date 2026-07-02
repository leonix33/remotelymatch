const env = require('../config/env');
const profileService = require('./profileService');
const { decryptApiKey } = require('./openaiKeyCrypto');
const recruiterContactService = require('./recruiterContactService');
const { rankContacts, resolveEnrichmentDomain } = require('./contactRankingService');

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

function apolloErrorMessage(raw, status) {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed.error || parsed.error_message || parsed.message;
    if (msg) return msg;
  } catch {
    /* plain text */
  }
  return raw || `HTTP ${status}`;
}

async function apolloBulkEnrichPeople(ids, apiKey) {
  if (!ids.length) return {};
  const res = await fetch(
    'https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Accept: 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ details: ids.map((id) => ({ id })) }),
    }
  );
  if (!res.ok) return {};
  const data = await res.json();
  const byId = {};
  for (const person of data.matches || []) {
    if (person?.id) byId[person.id] = person;
  }
  return byId;
}

async function apolloPeopleSearch(company, domain, apiKey) {
  if (!apiKey || (!company && !domain)) return null;
  const cleanDomain = domain ? String(domain).replace(/^www\./i, '').trim() : '';
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Accept: 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: company || undefined,
      q_organization_domains_list: cleanDomain ? [cleanDomain] : undefined,
      person_titles: ['recruiter', 'talent acquisition', 'technical recruiter', 'hiring manager', 'people operations'],
      include_similar_titles: true,
      page: 1,
      per_page: 8,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: apolloErrorMessage(text, res.status), people: [] };
  }
  const data = await res.json();
  const candidates = (data.people || []).slice(0, 8);
  const idsToEnrich = candidates.filter((p) => p.id && p.has_email !== false).map((p) => p.id).slice(0, 10);
  let enrichedById = {};
  try {
    enrichedById = await apolloBulkEnrichPeople(idsToEnrich, apiKey);
  } catch {
    /* search-only fallback */
  }

  const people = candidates.map((p) => {
    const full = enrichedById[p.id] || p;
    const lastName = full.last_name || p.last_name_obfuscated || '';
    return {
      name: full.name || [full.first_name || p.first_name, lastName].filter(Boolean).join(' '),
      email: full.email || '',
      role: full.title || p.title || 'recruiter / hiring',
      phone:
        full.phone_numbers?.[0]?.sanitized_number ||
        full.organization?.primary_phone?.sanitized_number ||
        p.organization?.primary_phone?.sanitized_number ||
        '',
      linkedIn: full.linkedin_url || '',
      confidence: full.email_status === 'verified' ? 'high' : full.email ? 'medium' : 'low',
      source: 'apollo.io',
      verified: full.email_status === 'verified',
    };
  });
  const firstOrg = (enrichedById[candidates[0]?.id] || candidates[0])?.organization;
  return {
    people: people.filter((p) => p.email || p.name),
    companyPhone: firstOrg?.primary_phone?.sanitized_number || firstOrg?.phone || null,
    provider: 'apollo',
  };
}

async function enrichContacts({ userId, job = {}, jobDescription = '', baseContacts = null } = {}) {
  const base = baseContacts || recruiterContactService.discoverContacts({ job, jobDescription });
  const domain =
    resolveEnrichmentDomain(job) ||
    base.companyDomain ||
    recruiterContactService.domainFromUrl(job.url || job.applyUrl || job.jobUrl);
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

  enriched.companyDomain = domain || enriched.companyDomain || null;
  enriched.verifiedContacts = rankContacts(enriched.verifiedContacts);
  enriched.recommendedContacts = enriched.verifiedContacts.filter((c) => c.recommended && c.email);
  enriched.otherContacts = enriched.verifiedContacts.filter((c) => c.email && !c.recommended);

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
        const hint = String(apollo.error).includes('api_key')
          ? 'Apollo API rejected the request — check your API key on Render'
          : `Apollo API error: ${apollo.error}`;
        result.apollo.message = hint;
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
