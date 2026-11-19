module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(500).json({ ok: false, error: 'Lead webhook is not configured' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid JSON body' });
      return;
    }
  }

  const { name, business, mobile, email, need, message, smsConsent } = body;
  if (!name || !mobile || !email) {
    res.status(400).json({ ok: false, error: 'Missing required fields' });
    return;
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        business: business || '',
        mobile,
        email,
        need: need || '',
        message: message || '',
        smsConsent: !!smsConsent,
        source: 'clearbounddigital.com',
        submittedAt: new Date().toISOString(),
      }),
    });

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: 'Upstream webhook error' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ ok: false, error: 'Failed to reach webhook' });
  }
};
