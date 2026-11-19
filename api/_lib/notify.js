// Email (Resend) and push (Pushover) notifications, via plain fetch.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function sendResendEmail({ from, to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function sendLeadAlertEmail(lead) {
  const to = process.env.LEAD_ALERT_EMAIL;
  if (!to) throw new Error('LEAD_ALERT_EMAIL is not configured');

  const from = `Clearbound Leads <${to}>`;
  const rows = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Company', lead.company || '—'],
    ['Source page', lead.source_page || '—'],
    ['UTM', lead.utm ? JSON.stringify(lead.utm) : '—'],
  ];

  const html = `
    <h2>New lead: ${escapeHtml(lead.name)}</h2>
    <table cellpadding="4" cellspacing="0">
      ${rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('')}
    </table>
    <p><strong>Message</strong></p>
    <p>${escapeHtml(lead.message || '—').replace(/\n/g, '<br>')}</p>
  `;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nMessage:\n${lead.message || '—'}`;

  return sendResendEmail({
    from,
    to,
    subject: `New lead: ${lead.name}`,
    html,
    text,
    replyTo: lead.email,
  });
}

async function sendLeadAutoReply(lead) {
  const from = process.env.LEAD_ALERT_EMAIL;
  if (!from) throw new Error('LEAD_ALERT_EMAIL is not configured');
  const bookingUrl = process.env.BOOKING_URL;

  const bookingLineHtml = bookingUrl
    ? `<p>Want to skip the back and forth? <a href="${escapeHtml(bookingUrl)}">Book a time here</a>.</p>`
    : '';
  const bookingLineText = bookingUrl
    ? `\nWant to skip the back and forth? Book a time here: ${bookingUrl}\n`
    : '';

  const firstName = (lead.name || '').trim().split(/\s+/)[0] || 'there';

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks for reaching out to Clearbound Digital. I got your message and I'll personally reach out within 1 business day.</p>
    ${bookingLineHtml}
    <p>Talk soon,<br>John</p>
  `;
  const text = `Hi ${firstName},\n\nThanks for reaching out to Clearbound Digital. I got your message and I'll personally reach out within 1 business day.\n${bookingLineText}\nTalk soon,\nJohn`;

  return sendResendEmail({
    from: `Clearbound Digital <${from}>`,
    to: lead.email,
    subject: "Got your message — I'll be in touch soon",
    html,
    text,
  });
}

async function sendPushoverNotification(lead) {
  const user = process.env.PUSHOVER_USER_KEY;
  const token = process.env.PUSHOVER_APP_TOKEN;
  if (!user || !token) return { skipped: true };

  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      user,
      title: 'New Clearbound lead',
      message: `New Clearbound lead: ${lead.name}`,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pushover send failed (${res.status}): ${body}`);
  }
  return res.json();
}

module.exports = { sendLeadAlertEmail, sendLeadAutoReply, sendPushoverNotification };
