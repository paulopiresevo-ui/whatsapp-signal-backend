require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  plan        VARCHAR(50) DEFAULT 'pro',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  evolution_url VARCHAR(255) NOT NULL,
  evolution_key VARCHAR(255) NOT NULL,
  instance_name VARCHAR(100) NOT NULL,
  webhook_token VARCHAR(100) UNIQUE NOT NULL,
  pixel_id      VARCHAR(50),
  access_token  TEXT,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keywords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID REFERENCES instances(id) ON DELETE CASCADE,
  event_name    VARCHAR(100) NOT NULL,
  keyword       VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instance_id, event_name, keyword)
);

CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   UUID REFERENCES instances(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  event_name    VARCHAR(100) NOT NULL,
  phone_hash    VARCHAR(64),
  phone         VARCHAR(20),
  push_name     VARCHAR(100),
  triggered_by  VARCHAR(20) DEFAULT 'secretary',
  message_text  TEXT,
  capi_success  BOOLEAN DEFAULT false,
  capi_response JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_instance ON events(instance_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON events(phone, instance_id) WHERE event_name = 'Lead';
`;

async function migrate() {
  console.log('Running migrations...');
  await pool.query(SQL);
  console.log('Tables OK');
  await pool.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
