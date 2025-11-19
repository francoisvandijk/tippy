// Environment variable verification script
// Used for runtime consumption testing
// Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Base required variables
const requiredVars = [
    'TIPPY_DB_URL',
    'TIPPY_DB_PASSWORD',
    'TIPPY_SENDGRID_API_KEY',
    'TIPPY_TWILIO_API_KEY',
    'SENTRY_DSN'
];

// Add Yoco keys based on environment
if (isProduction) {
    requiredVars.push('YOCO_LIVE_PUBLIC_KEY', 'YOCO_LIVE_SECRET_KEY');
} else {
    requiredVars.push('YOCO_TEST_PUBLIC_KEY', 'YOCO_TEST_SECRET_KEY');
}

const missing = [];
const present = [];

for (const v of requiredVars) {
    if (process.env[v]) {
        present.push(v);
    } else {
        missing.push(v);
    }
}

if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

// Verify values are not placeholders
const placeholderPattern = /^PLACEHOLDER_/i;
const hasPlaceholders = requiredVars.some(v => {
    const value = process.env[v];
    return value && placeholderPattern.test(value);
});

if (hasPlaceholders) {
    console.error('ERROR: Some environment variables contain placeholder values');
    process.exit(1);
}

// Success: all required vars present and not placeholders
const yocoKeyType = isProduction ? 'live' : 'test';
console.log(`✓ All ${requiredVars.length} required environment variables present and configured (Yoco: ${yocoKeyType} mode)`);
process.exit(0);

