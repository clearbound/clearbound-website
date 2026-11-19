// Minimal Supabase REST (PostgREST) client using plain fetch, so this project
// doesn't need a package.json / node_modules just to talk to Supabase.

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function insertLead(row) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }
  const [inserted] = await res.json();
  return inserted;
}

async function updateLead(id, patch) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase update failed (${res.status}): ${text}`);
  }
}

// Count leads from this ip_hash created in the last `windowMs` milliseconds.
async function countRecentLeadsByIpHash(ipHash, windowMs) {
  const { url, key } = env();
  const since = new Date(Date.now() - windowMs).toISOString();
  const res = await fetch(
    `${url}/rest/v1/leads?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}`,
    {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase count query failed (${res.status}): ${text}`);
  }
  const contentRange = res.headers.get('content-range') || '';
  const total = contentRange.split('/')[1];
  return total && total !== '*' ? parseInt(total, 10) : 0;
}

module.exports = { insertLead, updateLead, countRecentLeadsByIpHash };
