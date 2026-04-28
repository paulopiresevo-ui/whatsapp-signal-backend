const axios = require('axios');
const crypto = require('crypto');

function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone.replace(/\D/g, '')).digest('hex');
}

async function sendToCAP(instance, data) {
  const payload = { data: [{ event_name: data.event_name, event_time: data.timestamp || Math.floor(Date.now()/1000), action_source: 'other', user_data: { ph: [hashPhone(data.phone)] }, custom_data: { lead_name: data.push_name || '', channel: 'whatsapp' } }] };
  const r = await axios.post(`https://graph.facebook.com/v19.0/${instance.pixel_id}/events`, payload, { params: { access_token: instance.access_token }, timeout: 8000 });
  return r.data;
}

module.exports = { sendToCAP, hashPhone };
