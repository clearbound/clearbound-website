const { insertLead, updateLead, countRecentLeadsByIpHash } = require('./_lib/supabase');
const { sendLeadAlertEmail, sendLeadAutoReply, sendPushoverNotification } = require('./_lib/notify');
const {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  getClientIp,
  hashIp,
  isHoneypotFilled,
  isTooFast,
} = require('./_lib/spam');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 200, email: 320, phone: 40, company: 200, message: 5000, sourcePage: 500 };

function fakeSuccess(res) {
  // Spam path: respond exactly like a real success so bots get no signal.
  res.status(200).json({ ok: true });
}

function validate(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const company = String(body.company || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !phone || !email) return { error: 'Please fill in your name, phone and email.' };
  if (!EMAIL_RE.test(email)) return { error: 'That email address doesn’t look right.' };
  if (name.length > LIMITS.name) return { error: 'Name is too long.' };
  if (email.length > LIMITS.email) return { error: 'Email is too long.' };
  if (phone.length > LIMITS.phone) return { error: 'Phone number is too long.' };
  if (company.length > LIMITS.company) return { error: 'Business name is too long.' };
  if (message.length > LIMITS.message) return { error: 'Message is too long.' };

  return { value: { name, email, phone, company, message } };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid request.' });
      return;
    }
  }

  // Real UX validation errors are shown to the visitor — this isn't spam detection.
  const { value, error } = validate(body);
  if (error) {
    res.status(400).json({ ok: false, error });
    return;
  }

  // Spam protection: honeypot + submit-speed checks need no I/O, so run them first.
  if (isHoneypotFilled(body) || isTooFast(body)) {
    fakeSuccess(res);
    return;
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  let need = '';
  if (typeof body.need === 'string' && body.need.trim() && body.need.trim() !== 'Not sure yet') {
    need = body.need.trim();
  }
  const message = need ? `Need: ${need}\n\n${value.message}`.trim() : value.message;

  let utm = null;
  if (body.utm && typeof body.utm === 'object' && !Array.isArray(body.utm)) {
    const entries = Object.entries(body.utm).filter(
      ([k, v]) => /^utm_/.test(k) && typeof v === 'string' && v.trim()
    );
    if (entries.length) utm = Object.fromEntries(entries);
  }

  const row = {
    name: value.name,
    email: value.email,
    phone: value.phone,
    company: value.company || null,
    message: message || null,
    source_page: typeof body.sourcePage === 'string' ? body.sourcePage.slice(0, LIMITS.sourcePage) : null,
    utm,
    ip_hash: ipHash,
    user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
    status: 'new',
    notified_email: false,
    notified_push: false,
    autoreply_sent: false,
  };

  // Rate limit: requires a DB round trip, so it's the last spam check.
  try {
    const recentCount = await countRecentLeadsByIpHash(ipHash, RATE_LIMIT_WINDOW_MS);
    if (recentCount >= RATE_LIMIT_MAX) {
      fakeSuccess(res);
      return;
    }
  } catch (err) {
    console.error('[lead] rate-limit check failed, proceeding anyway:', err);
  }

  let lead;
  try {
    lead = await insertLead(row);
  } catch (err) {
    console.error('[lead] Supabase insert failed:', err);
    res.status(500).json({
      ok: false,
      error: 'Something went wrong saving that. Please call (602) 999-6990 and we will help directly.',
    });
    return;
  }

  // Lead is saved — everything from here on is best-effort. Failures are logged
  // and recorded on the row, but never surfaced to the visitor.
  const [alertResult, pushResult, autoReplyResult] = await Promise.allSettled([
    sendLeadAlertEmail(lead),
    sendPushoverNotification(lead),
    sendLeadAutoReply(lead),
  ]);

  if (alertResult.status === 'rejected') console.error('[lead] alert email failed:', alertResult.reason);
  if (pushResult.status === 'rejected') console.error('[lead] pushover notification failed:', pushResult.reason);
  if (autoReplyResult.status === 'rejected') console.error('[lead] auto-reply failed:', autoReplyResult.reason);

  const pushSkipped = pushResult.status === 'fulfilled' && pushResult.value && pushResult.value.skipped;

  try {
    await updateLead(lead.id, {
      notified_email: alertResult.status === 'fulfilled',
      notified_push: pushResult.status === 'fulfilled' && !pushSkipped,
      autoreply_sent: autoReplyResult.status === 'fulfilled',
    });
  } catch (err) {
    console.error('[lead] failed to update notification status:', err);
  }

  res.status(200).json({ ok: true });
};
