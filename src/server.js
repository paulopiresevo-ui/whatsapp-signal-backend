require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use('/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Muitas tentativas, aguarde 15 minutos' } }));

app.use('/auth',      require('./routes/auth'));
app.use('/instances', require('./routes/instances'));
app.use('/keywords',  require('./routes/keywords'));
app.use('/events',    require('./routes/events'));
app.use('/webhook',   require('./routes/webhook'));

app.get('/health', (req, res) => { res.json({ status: 'ok', ts: new Date().toISOString() }); });
app.use((req, res) => { res.status(404).json({ error: 'Rota nao encontrada' }); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Erro interno' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('WA Signal rodando na porta ' + PORT));
