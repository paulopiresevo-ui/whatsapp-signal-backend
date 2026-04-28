const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (err) { res.status(500).json({ error: 'Erro interno' }); }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, plan = 'pro' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users (name, email, password, plan) VALUES ($1, $2, $3, $4) RETURNING id, name, email, plan', [name, email.toLowerCase(), hash, plan]);
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, plan, created_at FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]);
});

module.exports = router;
