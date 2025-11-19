// Environment variable type definitions
// Ledger Reference: §25 (Environment, Credentials & Secrets Management)

declare namespace NodeJS {
  interface ProcessEnv {
    // Yoco API Keys (Phase 2 - Test/Live separation)
    YOCO_TEST_PUBLIC_KEY: string;
    YOCO_TEST_SECRET_KEY: string;
    YOCO_LIVE_PUBLIC_KEY: string;
    YOCO_LIVE_SECRET_KEY: string;
    YOCO_WEBHOOK_SECRET?: string;
    YOCO_API_URL?: string;
    
    // Database
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_KEY?: string;
    SUPABASE_DB_URL?: string;
    DB_URL?: string;
    TIPPY_DB_URL?: string;
    TIPPY_DB_PASSWORD?: string;
    
    // Authentication
    SUPABASE_JWT_SECRET?: string;
    SUPABASE_JWT_ISSUER?: string;
    SUPABASE_JWT_AUDIENCE?: string;
    GITHUB_OAUTH_CLIENT_SECRET?: string;
    
    // SMS Providers
    SMS_PROVIDER?: string;
    SENDGRID_API_KEY?: string;
    SENDGRID_FROM_PHONE?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_PHONE_NUMBER?: string;
    TIPPY_SENDGRID_API_KEY?: string;
    TIPPY_TWILIO_API_KEY?: string;
    
    // Application Settings
    NODE_ENV?: 'development' | 'test' | 'production';
    PORT?: string;
    YOCO_FEE_PERCENT?: string;
    PLATFORM_FEE_PERCENT?: string;
    VAT_RATE_PERCENT?: string;
    QR_REPLACEMENT_FEE_ZAR?: string;
    CASH_SEND_FEE_ZAR?: string;
    PAYOUT_MIN_ELIGIBILITY_ZAR?: string;
    GUARD_REGS_PER_REFERRER_PER_DAY?: string;
    GUARD_REGS_PER_DEVICE_PER_DAY?: string;
    GUARD_REGS_PER_IP_PER_HOUR?: string;
    SEND_GUARD_WELCOME_SMS?: string;
    PAYOUT_WEEKLY_SCHEDULE?: string;
    SUPPORT_PHONE_NUMBER?: string;
    WELCOME_SMS_SENDER_ID?: string;
    WELCOME_SMS_TEMPLATE_ID?: string;
    WELCOME_SMS_RETRY_COUNT?: string;
    
    // Monitoring
    SENTRY_DSN?: string;
  }
}

