const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const required = [
  'TIPPY_DB_URL',
  'TIPPY_DB_PASSWORD',
  'TIPPY_SENDGRID_API_KEY',
  'TIPPY_TWILIO_API_KEY'
];

// Add Yoco keys based on environment
if (isProduction) {
  required.push('YOCO_LIVE_PUBLIC_KEY', 'YOCO_LIVE_SECRET_KEY');
} else {
  required.push('YOCO_TEST_PUBLIC_KEY', 'YOCO_TEST_SECRET_KEY');
}

const missing = required.filter(k => !process.env[k]);

if (missing.length) { console.error('Missing required env keys:', missing.join(', ')); process.exit(1); }

const yocoKeyType = isProduction ? 'live' : 'test';
console.log(`Env check: PASS (values not printed, Yoco: ${yocoKeyType} mode)`);
