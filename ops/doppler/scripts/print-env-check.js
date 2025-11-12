// Environment variable verification script
// Used for runtime consumption testing
// Ledger Reference: Tippy Decision Ledger v1.0 (Final), § 25

const requiredVars = [
    'TIPPY_DB_URL',
    'TIPPY_DB_PASSWORD',
    'TIPPY_YOCO_API_KEY',
    'TIPPY_SENDGRID_API_KEY',
    'TIPPY_TWILIO_API_KEY',
    'SENTRY_DSN'
];

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
console.log(`✓ All ${requiredVars.length} required environment variables present and configured`);
process.exit(0);

