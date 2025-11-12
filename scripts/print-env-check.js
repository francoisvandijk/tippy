const required = [
  'TIPPY_DB_URL',
  'TIPPY_DB_PASSWORD',
  'TIPPY_YOCO_API_KEY',
  'TIPPY_SENDGRID_API_KEY',
  'TIPPY_TWILIO_API_KEY'
];

const missing = required.filter(k => !process.env[k]);

if (missing.length) { console.error('Missing required env keys:', missing.join(', ')); process.exit(1); }

console.log('Env check: PASS (values not printed)');
