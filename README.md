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

Per Ledger §7 — API Surface (Edge Functions):

#### Public/User Endpoints
- `POST /payments/create` — Create a new payment/tip
- `POST /payments/webhook` — Yoco webhook handler

#### Guard Endpoints
- `POST /qr/reassign` — Guard reassigns to a new QR code
- `GET /guards/me` — Get guard profile and earnings summary

#### Referral Endpoints
- `POST /referrals/create` — Create a referral record (referrer signs up guard)
- `GET /referrers/earnings/summary` — Get referrer's accrued earnings summary
- `GET /referrers/referrals` — List referred guards and their status

#### Admin Endpoints
- `POST /admin/qr/assign` — Admin assigns QR code to guard
- `POST /admin/qr/bulk-generate` — Create batch of QR codes (Tier-3)
- `POST /admin/payouts/generate` — Trigger payout batch creation
- `POST /admin/settings/set` — Update app setting value

See `docs/API.md` (if exists) for detailed API documentation.

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

- **§4**: Data Model (all core tables: users, guards, qr_codes, referrals, payouts, etc.)
- **§5**: Fees & Calculations (automatic fee calculation)
- **§6**: Key Workflows (User Tipping, QR Reassignment)
- **§7**: API Surface (12/12 required endpoints implemented)
- **§10**: Referrals (basic CRUD, milestone logic deferred to P1.4)
- **§12**: Logging & Error Taxonomy (VALIDATION_ERROR, PROCESSOR_ERROR, etc.)
- **§13**: POPIA & Security (phone masking, no PII logging)
- **§15**: Environments & Deployment (env-based config)
- **§24.4**: Referrer Activation & Guard Registration (basic endpoints)
- **§25**: Secrets Management (Doppler integration)

**Note**: Full business logic for referrals (milestone triggers, T+30 reversal) and payouts (computation, CashSend) is deferred to P1.4 and P1.5 respectively.

---

*Ledger = Law. No deviations, no assumptions.*