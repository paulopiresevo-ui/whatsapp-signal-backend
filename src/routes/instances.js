const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.name, i.evolution_url, i.instance_name, i.webhook_token,
              i.pixel_id, i.active, i.created_at,
              COUNT(e.id) FILTER (WHERE e.event_name = 'Lead') AS leads,
              COUNT(e.id) FILTER (WHERE e.event_name = 'Schedule') AS schedules,
              COUNT(e.id) FILTER (WHERE e.event_name = 'Purchase') AS purchases
       FROM instances i
       LEFT JOIN events e ON e.instance_id = i.id
         AND e.created_at > NOW() - INTERVAL '30 days'
       WHERE i.user_id = $1
       GROUP BY i.id
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar instancias' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, evolution_url, evolution_key, instance_name, pixel_id, access_token } = req.body;
    if (!name || !evolution_url || !evolution_key || !instance_name)
      return res.status(400).json({ error: 'Campos obrigatorios ausentes' });

    const webhookToken = uuidv4().replace(/-/g, '');
    const cleanUrl = evolution_url.replace(/\/+$/, '');
    const { rows } = await pool.query(
      `INSERT INTO instances (user_id, name, evolution_url, evolution_key, instance_name, webhook_token, pixel_id, access_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, evolution_url, instance_name, webhook_token, pixel_id, active, created_at`,
      [req.user.id, name, cleanUrl, evolution_key, instance_name, webhookToken, pixel_id, access_token]
    );

    const instance = rows[0];
    const webhookUrl = process.env.WEBHOOK_BASE_URL + '/webhook/' + webhookToken;
    await seedDefaultKeywords(instance.id);

    // Auto-register webhook on Evolution API
    try {
      await axios.post(cleanUrl + '/webhook/set/' + instance_name, {
        webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT'] }
      }, { headers: { apikey: evolution_key }, timeout: 8000 });
      console.log('Webhook registered:', webhookUrl);
    } catch (e) { console.warn('Webhook auto-register failed (manual setup needed):', e.message); }

    res.status(201).json({ ...instance, webhook_url: webhookUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar instancia' });
  }
});

// GET /instances/:id/qrcode — proxy to Evolution API (avoids CORS)
router.get('/:id/qrcode', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT evolution_url, evolution_key, instance_name FROM instances WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Instancia nao encontrada' });

    const { evolution_url, evolution_key, instance_name } = rows[0];
    const baseUrl = evolution_url.replace(/\/+$/, '');

    const response = await axios.get(
      baseUrl + '/instance/connect/' + instance_name,
      { headers: { apikey: evolution_key }, timeout: 15000 }
    );

    const data = response.data;
    if (data.base64) return res.json({ qr: data.base64, status: 'qr' });
    if (data.code) {
      const qr = data.code.startsWith('data:') ? data.code : 'data:image/png;base64,' + data.code;
      return res.json({ qr, status: 'qr' });
    }
    res.json({ status: 'connected', data });
  } catch (err) {
    console.error('QR error:', err.message);
    const msg = err.response && err.response.data && err.response.data.message;
    res.status(502).json({ error: msg || err.message });
  }
});

// GET /instances/:id/connection-status
router.get('/:id/connection-status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT evolution_url, evolution_key, instance_name FROM instances WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Instancia nao encontrada' });

    const { evolution_url, evolution_key, instance_name } = rows[0];
    const baseUrl = evolution_url.replace(/\/+$/, '');

    const response = await axios.get(
      baseUrl + '/instance/connectionState/' + instance_name,
      { headers: { apikey: evolution_key }, timeout: 8000 }
    );
    const state = response.data && (response.data.state || (response.data.instance && response.data.instance.state));
    res.json({ state: state || 'unknown', raw: response.data });
  } catch (err) { res.status(502).json({ error: err.message, state: 'error' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, pixel_id, access_token, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE instances SET name=COALESCE($1,name), pixel_id=COALESCE($2,pixel_id),
        access_token=COALESCE($3,access_token), active=COALESCE($4,active)
       WHERE id=$5 AND user_id=$6 RETURNING id, name, pixel_id, active`,
      [name, pixel_id, access_token, active, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Nao encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM instances WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao remover' }); }
});

router.get('/:id/webhook-url', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT webhook_token FROM instances WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Nao encontrada' });
  res.json({ webhook_url: process.env.WEBHOOK_BASE_URL + '/webhook/' + rows[0].webhook_token });
});

async function seedDefaultKeywords(instanceId) {
  const defaults = [
    { event: 'Schedule', keywords: ['agendado','agendei','consulta confirmada','horario confirmado','ficou agendado','marcado para'] },
    { event: 'ViewContent', keywords: ['o valor e','o investimento e','valor de r$','investimento de r$','o preco e','custa r$'] },
    { event: 'CustomEvent_Comparecimento', keywords: ['te esperamos','ate amanha','confirme sua presenca','nao esqueca da consulta'] },
    { event: 'Purchase', keywords: ['pagamento confirmado','pagamento recebido','procedimento realizado','obrigado pela confianca'] },
  ];
  for (const { event, keywords } of defaults) {
    for (const keyword of keywords) {
      await pool.query(
        'INSERT INTO keywords (instance_id,event_name,keyword) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [instanceId, event, keyword]
      );
    }
  }
}

module.exports = router;
