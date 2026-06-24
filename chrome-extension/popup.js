async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiBase', 'accessToken'], resolve);
  });
}

function setStatus(text, ok) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : 'err'}`;
}

let lastScrape = null;

async function loadPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const data = await chrome.tabs.sendMessage(tab.id, { type: 'scrape' });
    if (data) {
      lastScrape = data;
      document.getElementById('title').value = data.title || '';
      document.getElementById('company').value = data.company || '';
      document.getElementById('url').value = data.url || tab.url || '';
      const sourceEl = document.getElementById('sourceHint');
      if (data.source && sourceEl) {
        const label = data.source.charAt(0).toUpperCase() + data.source.slice(1);
        sourceEl.textContent = `Detected: ${label} — review fields, then add to queue.`;
      }
      return;
    }
  } catch {
    /* content script may not run on chrome:// pages */
  }
  lastScrape = null;
  document.getElementById('url').value = tab.url || '';
  document.getElementById('title').value = tab.title || '';
}

document.getElementById('send').addEventListener('click', async () => {
  const btn = document.getElementById('send');
  btn.disabled = true;
  setStatus('Sending…', true);
  const { apiBase, accessToken } = await getSettings();
  if (!apiBase || !accessToken) {
    setStatus('Set API URL and access token in Settings first.', false);
    btn.disabled = false;
    return;
  }
  const body = {
    url: document.getElementById('url').value,
    title: document.getElementById('title').value,
    company: document.getElementById('company').value,
    source: lastScrape?.source,
  };
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/approvals/queue-external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || res.statusText);
    setStatus('Queued! Open Apply Queue in RemoteMatch.', true);
  } catch (e) {
    setStatus(e.message || 'Failed to queue job', false);
  }
  btn.disabled = false;
});

loadPage();
