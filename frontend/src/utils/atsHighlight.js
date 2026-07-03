function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STATUS_RANK = { green: 3, yellow: 2, red: 1 };

export function buildHighlightedHtml(text, breakdown = [], { side = 'resume' } = {}) {
  const raw = String(text || '');
  if (!raw) return '';
  if (!breakdown?.length) return escapeHtml(raw);

  const terms = breakdown
    .filter((row) => {
      if (side === 'resume') return row.status === 'green' || row.status === 'yellow';
      return true;
    })
    .map((row) => ({ term: String(row.term || '').trim(), status: row.status || 'red' }))
    .filter((row) => row.term.length >= 3)
    .sort((a, b) => b.term.length - a.term.length);

  const lower = raw.toLowerCase();
  const matches = [];
  for (const { term, status } of terms) {
    const needle = term.toLowerCase();
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf(needle, pos);
      if (idx < 0) break;
      matches.push({ start: idx, end: idx + term.length, status });
      pos = idx + term.length;
    }
  }

  if (!matches.length) return escapeHtml(raw);

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (!last || match.start >= last.end) {
      merged.push({ ...match });
      continue;
    }
    if ((STATUS_RANK[match.status] || 0) > (STATUS_RANK[last.status] || 0)) {
      last.status = match.status;
    }
    if (match.end > last.end) last.end = match.end;
  }

  let html = '';
  let cursor = 0;
  for (const match of merged) {
    if (match.start > cursor) html += escapeHtml(raw.slice(cursor, match.start));
    html += `<mark class="jd-highlight jd-highlight--${match.status}">${escapeHtml(raw.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  }
  if (cursor < raw.length) html += escapeHtml(raw.slice(cursor));
  return html;
}
