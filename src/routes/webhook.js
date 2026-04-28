const express = require('express');
const pool = require('../db/pool');
const { sendToCAP, hashPhone } = require('../services/capi');
const router = express.Router();
const leadsSeen = new Map();

router.post('/:token', async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const { token } = req.params;
    const ir = await pool.query(
      'SELECT i.*, u.id AS user_id FROM instances i JOIN users u ON u.id = i.user_id WHERE i.webhook_token = $1 AND i.active = true AND u.active = true',
      [token]
    );
    const instance = ir.rows[0];
    if (!instance || !instance.pixel_id || !instance.access_token) return;
    const body = req.body;
    const data = body && body.data;
    if (!data) return;
    const key = data.key || {};
    const msg = data.message || {};
    const phone = (key.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
    const text = (msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '').toLowerCase().trim();
    const isFromMe = key.fromMe === true;
    const pushName = data.pushName || '';
    const ts = data.messageTimestamp || Math.floor(Date.now() / 1000);
    if (!phone) return;
    if (isFromMe) {
      const kr = await pool.query('SELECT event_name, keyword FROM keywords WHERE instance_id = $1', [instance.id]);
      let ev = null;
      for (const row of kr.rows) { if (text.includes(row.keyword)) { ev = row.event_name; break; } }
      if (!ev) return;
      await saveAndSend(instance, ev, phone, pushName, text, ts, 'secretary');
    } else {
      const ck = instance.id + '_' + phone;
      if (leadsSeen.has(ck)) return;
      const ex = await pool.query("SELECT id FROM events WHERE instance_id = $1 AND phone = $2 AND event_name = 'Lead' LIMIT 1", [instance.id, phone]);
      if (ex.rows.length > 0) { leadsSeen.set(ck, true); return; }
      leadsSeen.set(ck, true);
      await saveAndSend(instance, 'Lead', phone, pushName, text, ts, 'lead');
    }
  } catch (err) { console.error('Webhook error:', err); }
});

async function saveAndSend(instance, ev, phone, pushName, text, ts, trig) {
  let ok = false, msg = null;
  try {
    msg = await sendToCAP(instance, { event_name: ev, phone, push_name: pushName, message_text: text, timestamp: ts });
    ok = (msg && msg.events_received || 0) > 0;
  } catch (e) { msg = { error: e.message }; }
  await pool.query(
    'INSERT INTO events (instance_id, user_id, event_name, phone, phone_hash, push_name, triggered_by, message_text, capi_success, capi_response) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [instance.id, instance.user_id, ev, phone, hashPhone(phone), pushName, trig, text.substring(0, 500), ok, JSON.stringify(msg)]
  );
}

module.exports = router;
