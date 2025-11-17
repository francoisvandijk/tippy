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

All configuration via environment variables (Doppler):

- `SUPABASE_URL` / `DB_URL` — Database connection URL
- `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY` — Database API key
- `YOCO_PUBLIC_KEY` — Yoco public API key
- `YOCO_SECRET_KEY` — Yoco secret API key
- `YOCO_WEBHOOK_SECRET` — Yoco webhook signature secret
- `YOCO_FEE_PERCENT` — Yoco fee percentage (default: 0.00)
- `PLATFORM_FEE_PERCENT` — Platform fee percentage (default: 10.00)
- `VAT_RATE_PERCENT` — VAT rate percentage (default: 15.00)

### Database Migration

Run the migration:

```bash
npm run migrate:up
```

Or manually execute `infra/db/migrations/0004_payments.sql` against your Supabase Postgres database.

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