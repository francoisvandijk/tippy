# Tippy

QR-initiated digital tipping platform for car guards in South Africa.

**Ledger Reference**: Tippy Decision Ledger v1.0 (Final)

## Phase 2 — Payments & Yoco Integration

This implementation provides the core payment processing functionality as defined in the Tippy Decision Ledger §§5–19.

### Features

- **Payment Processing**: Yoco integration for card payments (§6.1)
- **Fee Calculation**: Automatic calculation of processor, platform, and VAT fees (§5)
- **Webhook Handling**: Yoco webhook processing for payment status updates (§7)
- **Database Schema**: Payments table with full fee breakdown (§4)

### API Endpoints

- `POST /payments/create` — Create a new payment/tip
- `POST /payments/webhook` — Yoco webhook handler

### Environment Variables

All configuration via environment variables (Doppler per §25):

See `.env.example` for a complete list of all required environment variables. This file lists all variable names with obvious placeholders—no real secrets are included.

**Note**: Real values are managed via Doppler per Ledger §25. For local development, copy `.env.example` to `.env.local` (gitignored) and fill in your values.

Key variables include:
- `SUPABASE_URL` / `DB_URL` — Database connection URL
- `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` — Database API key
- `YOCO_TEST_PUBLIC_KEY` — Yoco test public API key (dev/test environments)
- `YOCO_TEST_SECRET_KEY` — Yoco test secret API key (dev/test environments)
- `YOCO_LIVE_PUBLIC_KEY` — Yoco live public API key (production)
- `YOCO_LIVE_SECRET_KEY` — Yoco live secret API key (production)
- `YOCO_WEBHOOK_SECRET` — Yoco webhook signature secret
- `YOCO_FEE_PERCENT` — Yoco fee percentage (default: 0.00)
- `PLATFORM_FEE_PERCENT` — Platform fee percentage (default: 10.00)
- `VAT_RATE_PERCENT` — VAT rate percentage (default: 15.00)

### Database Migration

The migration runner (P1.2) processes all 19 migration files sequentially and tracks applied migrations in the `schema_migrations` table.

#### Running Migrations

```bash
# Build first (required)
npm run build

# Check migration status
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Rollback last migration (basic - requires manual SQL reversal)
npm run migrate:down

# Rollback to specific version
npm run migrate:down 0019
```

#### Migration Runner Features

- **Idempotent**: Tracks applied migrations in `schema_migrations` table
- **Sequential**: Processes migrations in numerical order (0004, 0019, 0020, etc.)
- **Safe**: Skips already-applied migrations
- **Ledger-Compliant**: No plaintext secrets, uses environment variables per §25

#### Manual Migration (Alternative)

If you prefer to run migrations manually, execute SQL files from `infra/db/migrations/` in order:

1. `0004_payments.sql`
2. `0019_rls_policies.sql`
3. `0020_users.sql`
4. ... (all 19 files in numerical order)

**Note**: The migration runner is recommended as it ensures proper sequencing and tracking.

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Security & Compliance

- No plaintext secrets in code
- POPIA-compliant (no full card data logged)
- All sensitive data via environment variables
- Webhook signature verification

### Ledger Compliance

This implementation satisfies:

- **§4**: Data Model (payments table)
- **§5**: Fees & Calculations (automatic fee calculation)
- **§6**: Key Workflows (User Tipping workflow)
- **§7**: API Surface (payment endpoints)
- **§13**: POPIA & Security (no PII logging)
- **§15**: Environments & Deployment (env-based config)
- **§25**: Secrets Management (Doppler integration)

---

*Ledger = Law. No deviations, no assumptions.*