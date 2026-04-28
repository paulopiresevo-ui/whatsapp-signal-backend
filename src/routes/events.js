const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { instance_id, event_name, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE e.user_id = $1';
    const params = [req.user.id];
    let i = 2;
    if (instance_id) { where += ' AND e.instance_id = $' + i++; params.push(instance_id); }
    if (event_name) { where += ' AND e.event_name = $' + i++; params.push(event_name); }
    params.push(parseInt(limit), parseInt(offset));
    const sql = 'SELECT e.id, e.event_name, e.phone, e.push_name, e.triggered_by, e.message_text, e.capi_success, e.created_at, inst.name AS instance_name FROM events e JOIN instances inst ON inst.id = e.instance_id ' + where + ' ORDER BY e.created_at DESC LIMIT $' + i++ + ' OFFSET $' + i;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

router.get('/stats', async (req, res) => {
  try {
    const { instance_id, period = '24h' } = req.query;
    const intervals = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
    const interval = intervals[period] || '24 hours';
    let where = 'WHERE e.user_id = $1 AND e.created_at > NOW() - $2::INTERVAL';
    const params = [req.user.id, interval];
    if (instance_id) { where += ' AND e.instance_id = $3'; params.push(instance_id); }
    const sql = "SELECT COUNT(*) FILTER (WHERE event_name = 'Lead') AS leads, COUNT(*) FILTER (WHERE event_name = 'Schedule') AS schedules, COUNT(*) FILTER (WHERE event_name = 'Purchase') AS purchases, COUNT(*) FILTER (WHERE event_name = 'ViewContent') AS view_content, COUNT(*) FILTER (WHERE event_name = 'CustomEvent_Comparecimento') AS attendance, COUNT(*) AS total, COUNT(*) FILTER (WHERE capi_success = true) AS capi_success_count FROM events e " + where;
    const { rows } = await pool.query(sql, params);
    const dayWhere = instance_id ? 'AND instance_id = $2' : '';
    const dayParams = instance_id ? [req.user.id, instance_id] : [req.user.id];
    const daySql = "SELECT DATE(created_at) AS day, event_name, COUNT(*) AS count FROM events e WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' " + dayWhere + " GROUP BY day, event_name ORDER BY day";
    const { rows: byDay } = await pool.query(daySql, dayParams);
    res.json({ summary: rows[0], by_day: byDay });
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar stats' }); }
});

module.exports = router;
