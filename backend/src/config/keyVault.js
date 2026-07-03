const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const KEY_NAMES = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'RESEND_API_KEY',
  'GMAIL_SMTP_USER',
  'GMAIL_SMTP_PASS',
  'HUNTER_API_KEY',
  'APOLLO_API_KEY',
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
];

function normalizeSecretName(name = '') {
  return String(name).trim().replace(/_/g, '-').toLowerCase();
}

function applySecret(envName, value, loaded) {
  if (String(process.env[envName] || '').trim()) return loaded;
  const trimmed = String(value || '').trim();
  if (!trimmed) return loaded;
  process.env[envName] = trimmed;
  return loaded + 1;
}

async function fetchAzureSecret(client, secretName) {
  try {
    const item = await client.getSecret(secretName);
    return String(item?.value || '').trim();
  } catch {
    return '';
  }
}

async function loadAzureKeyVaultSecrets() {
  const vaultUrl = String(process.env.AZURE_KEY_VAULT_URL || '').trim();
  if (!vaultUrl) return { loaded: 0, provider: null };

  const { DefaultAzureCredential } = require('@azure/identity');
  const { SecretClient } = require('@azure/keyvault-secrets');

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);

  let loaded = 0;
  for (const envName of KEY_NAMES) {
    const explicit = String(process.env[`AZURE_KV_${envName}_NAME`] || '').trim();
    const secretName = explicit || normalizeSecretName(envName);
    const value = await fetchAzureSecret(client, secretName);
    loaded = applySecret(envName, value, loaded);
  }

  return { loaded, provider: 'azure-key-vault' };
}

async function vaultKvRead({ addr, token, mount, secretPath }) {
  const url = `${addr}/v1/${mount}/data/${secretPath}`;
  const res = await fetch(url, {
    headers: { 'X-Vault-Token': token },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.data?.data || null;
}

async function loadHashicorpVaultSecrets() {
  const addr = String(process.env.VAULT_ADDR || '').trim().replace(/\/$/, '');
  const token = String(process.env.VAULT_TOKEN || '').trim();
  const mount = String(process.env.VAULT_MOUNT || 'secret').trim();
  const basePath = String(process.env.VAULT_SECRET_PATH || 'remotelymatch').trim();

  if (!addr || !token) {
    throw new Error('VAULT_ADDR and VAULT_TOKEN are required when SECRETS_PROVIDER=hashicorp-vault');
  }

  let loaded = 0;
  const bulk = await vaultKvRead({ addr, token, mount, secretPath: basePath });
  if (bulk && typeof bulk === 'object') {
    for (const envName of KEY_NAMES) {
      const value = bulk[envName] ?? bulk[normalizeSecretName(envName)];
      loaded = applySecret(envName, value, loaded);
    }
    return { loaded, provider: 'hashicorp-vault' };
  }

  for (const envName of KEY_NAMES) {
    const explicit = String(process.env[`VAULT_${envName}_PATH`] || '').trim();
    const secretPath = explicit || `${basePath}/${normalizeSecretName(envName)}`;
    const data = await vaultKvRead({ addr, token, mount, secretPath });
    const value = data?.value ?? data?.[envName] ?? data?.[normalizeSecretName(envName)];
    loaded = applySecret(envName, value, loaded);
  }

  return { loaded, provider: 'hashicorp-vault' };
}

async function loadKeyVaultSecrets() {
  const provider = String(process.env.SECRETS_PROVIDER || '').trim().toLowerCase();
  if (!provider || provider === 'env') return { loaded: 0, provider: 'env' };
  if (provider === 'hashicorp-vault' || provider === 'vault') return loadHashicorpVaultSecrets();
  if (provider === 'azure-key-vault') return loadAzureKeyVaultSecrets();

  throw new Error(
    `Unsupported SECRETS_PROVIDER "${provider}". Use "env", "hashicorp-vault", or "azure-key-vault".`
  );
}

module.exports = { loadKeyVaultSecrets, KEY_NAMES, normalizeSecretName };
