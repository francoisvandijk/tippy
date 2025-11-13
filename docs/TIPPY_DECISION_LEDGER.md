# Tippy Decision Ledger v1.0 (Final)

**Ledger = Law — No deviations, no assumptions, no plaintext secrets.**

---

## Table of Contents

- [§1 — System Overview](#1--system-overview)
- [§2 — Roles & Access](#2--roles--access)
- [§3 — Config (Admin-Editable Defaults)](#3--config-admin-editable-defaults)
- [§4 — Data Model (Primary Fields)](#4--data-model-primary-fields)
- [§5 — Fees & Calculations](#5--fees--calculations)
- [§6 — Key Workflows](#6--key-workflows)
- [§7 — API Surface (Edge Functions)](#7--api-surface-edge-functions)
- [§8 — RLS / Security](#8--rls--security)
- [§9 — Payouts (Weekly)](#9--payouts-weekly)
- [§10 — Referrals (Locked)](#10--referrals-locked)
- [§11 — Copy / Brand Text (User-Facing)](#11--copy--brand-text-user-facing)
- [§12 — Logging & Error Taxonomy](#12--logging--error-taxonomy)
- [§13 — POPIA & Security](#13--popia--security)
- [§14 — Telemetry & KPIs](#14--telemetry--kpis)
- [§15 — Environments & Deployment](#15--environments--deployment)
- [§16 — Tiers (Locked)](#16--tiers-locked)
- [§17 — Alignment & Change Control](#17--alignment--change-control)
- [§18 — Acceptance Checklist (Go/No-Go)](#18--acceptance-checklist-gono-go)
- [§19 — Table / Endpoint Index](#19--table--endpoint-index)
  - [§19.5 — Doppler CI Workflow (Locked)](#195--doppler-ci-workflow-locked)
  - [§19.9 — Phase Close-Out Process (Locked)](#199--phase-close-out-process-locked)
- [§20 — Reserved](#20--reserved)
- [§21 — Reserved](#21--reserved)
- [§22 — Reserved](#22--reserved)
- [§23 — Reserved](#23--reserved)
- [§24 — Referrals, Registration & QR System](#24--referrals-registration--qr-system)
  - [§24.3 — Welcome SMS Policy (Locked)](#243--welcome-sms-policy-locked)
  - [§24.4 — Referrer Activation & Guard Registration via Referrer (Locked)](#244--referrer-activation--guard-registration-via-referrer-locked)
  - [§24.5 — Bulk QR Generation & Print-Ready Cards (Locked)](#245--bulk-qr-generation--print-ready-cards-locked)
- [§25 — Environment, Credentials & Secrets Management (Locked)](#25--environment-credentials--secrets-management-locked)
  - [§25.1 — Doppler CI Tokens (Locked)](#251--doppler-ci-tokens-locked)
- [§26 — Guard Registration Accessibility & Device Independence (Locked)](#26--guard-registration-accessibility--device-independence-locked)
- [§27 — Brand Naming & Architecture (Locked)](#27--brand-naming--architecture-locked)
- [§28 — Official Logo Lock (Locked)](#28--official-logo-lock-locked)
- [§29 — Document & Artifact Storage Policy (Locked)](#29--document--artifact-storage-policy-locked)

---

## §1 — System Overview

### 1.1 Objective

Tippy enables QR-initiated, card-only digital tipping for car guards, with pooled funds and weekly CashSend payouts.

No apps or smartphones required for guards.

### 1.2 Core Domains

- Users
- Guards
- QR Codes
- Payments
- Fees
- Payouts
- Referrers
- Notifications
- Admin Console
- Registrations

### 1.3 Canonical Identifier

MSISDN (cellphone number) is the universal guard/referrer identifier.

### 1.4 Region + Tax

South Africa; VAT-aware.

### 1.5 Payments

Yoco (card only, no Instant EFT or other methods).

### 1.6 Data Authority

Supabase (Postgres + Auth + RLS).

### 1.7 Privacy

POPIA-compliant minimal data handling.

---

## §2 — Roles & Access

### 2.1 System Roles

- Admin
- Marketing
- Guard
- User (tipping user)

### 2.2 Referral-Eligible Roles

Guard, Marketing.

### 2.3 Guard Self-Service

Guards may self-reassign QR codes.

Guard→Guard referrals permitted.

Guard self-referral strictly prohibited.

### 2.4 Row-Level Security (RLS)

Ownership-based reads for Guard & Referrer.

Admin = full read/write.

Referrers only see their own referral objects and earnings.

---

## §3 — Config (Admin-Editable Defaults)

```
PAYMENT_PROVIDER = "Yoco"
YOCO_FEES_MODE = "PercentOnly"
YOCO_FEE_PERCENT = 0.00
YOCO_FIXED_FEE = 0.00

PLATFORM_FEE_PERCENT = 10.00
VAT_ENABLED = true
VAT_RATE_PERCENT = 15.00
VAT_APPLIES_TO = ["PLATFORM_FEE"]

CASH_SEND_FEE_ZAR = 9.00
PAYOUT_WEEKLY_SCHEDULE = "Sunday (covers Sat..Fri)"
PAYOUT_MIN_ELIGIBILITY_ZAR = 500.00
SHOW_NET_ONLY_TO_GUARD = true

QR_REPLACEMENT_FEE_ZAR = 10.00
QR_SELF_REASSIGN_ENABLED = true
QR_ONE_ACTIVE_PER_GUARD = true

TIP_HISTORY_MAX_ROWS = 5
SAVE_CARD_AUTOMATICALLY = true
MASK_CARD_DIGITS_SHOWN = 4

REFERRAL_ENABLED = true
REFERRAL_FEE_PER_GUARD_ZAR = 20.00
REFERRAL_TIP_THRESHOLD_ZAR = 500.00
REFERRAL_PAYOUT_MINIMUM_ZAR = 500.00
REFERRAL_MAX_PER_REFERRER_PER_DAY = 50
REFERRAL_LOCKOUT_DAYS_FOR_DUPLICATE_MSISDN = 90

NEARBY_RADIUS_METERS = 150
NEARBY_DWELL_MINUTES = 10
NOTIFY_USER_TEXT = "You can tip with Tippy. No cash needed."

AUTO_EMAIL_QR_BATCH = true
AUTO_EMAIL_WEEKLY_PAYOUT = true
AUTO_GENERATE_WEEKLY_PAYOUT = true

REFERENCE_PREFIX = "TPY"
```

---

## §4 — Data Model (Primary Fields)

### users

`id` uuid pk, `role`, `email`, `msisdn`, `is_active`, `created_at`.

### guards

`id` uuid fk users.id, `display_name`, `msisdn` unique, `status`, `lifetime_gross_tips`, `created_at`.

### qr_codes

`id` uuid pk, `code` unique, `assigned_guard_id`, `status`, + `batch_id`, + `short_code` (Base32/62, 8–10 chars).

### payments

Full fee breakdown fields for Yoco → platform → VAT → net.

### payout_batches, payout_batch_items

Weekly payout logic; single CashSend fee per beneficiary.

### referrers

`id` uuid pk (users), `role`, `display_name`, `msisdn`, `active`.

### referrals

Links referrer → referred guard (unique by MSISDN, immutable after 7 days).

### referral_milestones

Trigger at R500 lifetime gross.

### referral_earnings_ledger

Event log for EARNED / REVERSAL.

### referral_balances (view)

Accrued totals for payout eligibility.

### qr_batches / qr_designs

Locked production pipeline for bulk QR creation.

### audit_log

All sensitive events logged immutably.

### app_settings

Key/value configuration store.

---

## §5 — Fees & Calculations

### 5.1 Processor Fee

```
processor_fee = amount_gross * YOCO_FEE_PERCENT/100
```

### 5.2 Platform Fee

```
platform_fee = amount_gross * PLATFORM_FEE_PERCENT/100
```

### 5.3 VAT

```
vat_on_platform = platform_fee * VAT_RATE_PERCENT/100
```

### 5.4 Net To Pool

```
net = gross - processor_fee - platform_fee - vat_on_platform
```

### 5.5 CashSend Fee

One fee per beneficiary per weekly batch.

### 5.6 Guard Visibility

Before eligible: show "Accruing" only.

After ≥ R500: show net and cumulative paid.

---

## §6 — Key Workflows

### 6.1 User Tipping (Yoco)

1. Scan QR
2. Device check → PWA fallback if incompatible
3. Pay via card
4. Auto-save card
5. Show "Thank you!" animation
6. Push notification to guard (amount masked)

### 6.2 Guard Earnings Display

- Show net once eligible
- Show cumulative payouts
- 5-item tip history

### 6.3 Nearby Nudge

Push notification if user stays within:
- 150m radius
- 10 minutes

### 6.4 QR Assignment / Reassignment

- 1 active QR per guard
- Guard can self-reassign (QR replacement fee applies)

### 6.5 Referrals (Guard → Guard; Marketing → Guard)

- R20 reward when referred guard crosses R500 gross
- T+30 reversal
- Payout only if accrued ≥ R500
- Duplicate MSISDN lockout: 90 days
- Immutable audit trail

---

## §7 — API Surface (Edge Functions)

### Public/User

- `POST /payments/create`
- `POST /payments/webhook`

### Guard

- `POST /qr/reassign`

### Referral

- `POST /referrals/create`
- `GET /referrers/earnings/summary`
- `GET /referrers/referrals`

### Admin

- `POST /admin/payouts/generate`
- `POST /admin/referral/reversal`
- `POST /admin/qr/assign`
- `POST /admin/settings/set`
- `POST /admin/qr/bulk-generate` (locked Tier-3)
- `POST /admin/qr/export`

---

## §8 — RLS / Security

- Guards: read self
- Referrers: read own referrals and earnings
- Admin: full system access
- MSISDN masked except for owner/admin
- No OTP for MSISDN change (admin-verifiable)

---

## §9 — Payouts (Weekly)

### Cycle

Sat 00:00 → Fri 23:59

Process Sunday.

### Eligibility

- Guard: net ≥ R500
- Referrer: accrued ≥ R500

### Line Items

- GUARD
- REFERRAL
- QR_REPLACEMENT

### Notifications

"Payout sent" (masked for guards).

### Auto-Email

CSV emailed to Admin; Tier-3 automation supported.

---

## §10 — Referrals (Locked)

This section integrates the full referral governance domain, including:

### 10.1 Overview

- Guard→Guard referrals enabled
- Unified login between Guard/Referrer roles
- MSISDN as anchor key

### 10.2 Milestone Logic

- R500 milestone triggers R20 reward
- Automatic ledger entry
- T+30 reversal logic for chargebacks

### 10.3 Eligibility & Payout

- Accrued referral balance ≥ R500
- Included in weekly payout batch

### 10.4 Audit & POPIA

- `referral_earnings_ledger` is immutable
- PII masked except for admin
- All actions logged

### 10.5 Anti-Abuse

- Daily/device/IP registration caps
- Duplicate MSISDN lockout (90 days)
- Heuristic anomaly detection
- Flag queue for admin

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §11 — Copy / Brand Text (User-Facing)

### 11.1 Proximity Push

"You can tip with Tippy. No cash needed."

### 11.2 Tip Success Animation

"Thank you for tipping with Tippy!"

### 11.3 Sharing

"Share Tippy via WhatsApp"

All copy is brand-locked and used across app, PWA, and notification surfaces.

---

## §12 — Logging & Error Taxonomy

### 12.1 Log Format

Structured JSON:

```json
{
  "request_id": "...",
  "actor": "...",
  "entity": "...",
  "latency_ms": 123,
  "result": "..."
}
```

### 12.2 Errors

- `VALIDATION_ERROR`
- `AUTHZ_DENIED`
- `RATE_LIMIT`
- `PROCESSOR_ERROR`
- `WEBHOOK_REPLAY`
- `BATCH_SEND_FAIL`

All errors must be:
- Machine-readable
- Human-debuggable
- Logged with `actor_user_id` where applicable

---

## §13 — POPIA & Security

### 13.1 Data Minimisation

Only name + MSISDN collected for guards/referrers.

### 13.2 Encryption

- At rest (Postgres, Vault)
- In transit (TLS)

### 13.3 Masking

MSISDN masked (xxxxxx1234) except for owner or admin.

### 13.4 Retention

- Payments: 5 years
- Logs: 2 years (configurable)

### 13.5 Access Reviews

Quarterly access audits.

---

## §14 — Telemetry & KPIs

Weekly dashboards include:

- `gross_tips_per_week`
- `net_pool_per_week`
- `active_guards`
- `payouts_sent_per_week`
- `avg_days_to_payout`
- `referrals_created_per_day`
- `milestones_per_week`
- `avg_days_to_milestone`
- `fraud_flags_per_100_referrals`
- `referral_payout_zar_per_week`

Commercial KPIs must reflect same definitions in app and analytics.

---

## §15 — Environments & Deployment

### 15.1 Environments

- dev
- staging
- prod

### 15.2 Secrets

Stored in:
- GitHub Actions Secrets
- Supabase Vault (optional)
- 1Password Shared Vault ("Tippy-Engineering")

### 15.3 Config Sync

- `.env.example` mirrors §3 CONFIG.
- `.gitignore` blocks `.env.local`.

### 15.4 CI/CD

Pre-deploy checks enforce:
- No plaintext secrets
- RLS active
- Migrations valid
- Tests pass

---

## §16 — Tiers (Locked)

### Tier 1

- Payments
- QR assign/reassign (+R10 fee)
- Weekly payouts
- Guard net-only visibility
- Logging
- Basic admin
- WhatsApp share

### Tier 2

- Auto-save card
- PWA fallback flows
- Tip success animation
- Guard push
- Nearby nudge
- Explainer video
- Branded first-launch animation

### Tier 3

- Auto-email QR batch
- Auto-email weekly payout
- Auto-generate weekly payouts
- Guard self console (view-only)
- Bulk QR generation and export (Guard + Referrer)

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §17 — Alignment & Change Control

### 17.1 Alignment

All code, schemas, UI flows, and documentation MUST match Ledger v1.0.

### 17.2 Conflict Resolution

Ledger overrides all other drafts.

### 17.3 Changes

Must be issued as versioned deltas (e.g., v1.1-Δ1), reviewed by Admin → approved → merged.

---

## §18 — Acceptance Checklist (Go/No-Go)

All criteria must pass before a release:

### Fees

- Processor / platform / VAT validated
- CashSend fee applied once per beneficiary

### Guard Visibility

- Accruing before eligibility
- Net-only after eligibility

### QR

- Self-reassign functional
- Old card becomes Replaced
- Replacement fee accrues

### Payouts

- Weekly batch correctly aggregates
- Referral earnings included
- Thresholds respected

### Referrals

- R500 milestone, R20 reward
- T+30 reversal logic
- No self-referrals
- Duplicate MSISDN lockout

### Admin

- Settings editable
- Logs / audits consistent

### POPIA

- Masking active
- No secret leakage

### Brand

- Tippy branding applied consistently

### Legal

- Entity details correct in exports

---

## §19 — Table / Endpoint Index

### Tables

- `users`
- `guards`
- `qr_codes`
- `payments`
- `payout_batches`
- `payout_batch_items`
- `admins`
- `referrers`
- `referrals`
- `referral_milestones`
- `referral_earnings_ledger`
- `referral_balances` (view)
- `qr_batches`
- `qr_designs`
- `audit_log`
- `app_settings`

### Endpoints

- `/payments/create`
- `/payments/webhook`
- `/qr/reassign`
- `/referrals/create`
- `/referrers/earnings/summary`
- `/referrers/referrals`
- `/admin/payouts/generate`
- `/admin/referral_reversal`
- `/admin/qr/assign`
- `/admin/settings/set`
- `/admin/qr/bulk-generate`
- `/admin/qr/export`

### §19.5 — Doppler CI Workflow (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### 19.5.1 Triggers

- `workflow_dispatch`
- Scoped push
- Scoped pull_request

#### 19.5.2 Requirements

- Doppler CI must pass before merges to main
- Flattened environment injection
- No secrets echoed or logged
- Strict masking on all values

#### 19.5.3 Dispatch Methods

- Manual: `gh workflow run`
- Doppler-authenticated
- AI-agent dispatch (Phase 2 automation)

#### 19.5.4 Governance

A successful run of Doppler CI on main is required for phase close-out (v1.0).

**This section is LOCKED. No modifications without Ledger amendment process.**

### §19.9 — Phase Close-Out Process (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### Scope

Defines the mandatory governance, CI, compliance, and repository steps required to close out any development phase (Phase 1 → Phase N). This section is authoritative and must be executed exactly as written before any new phase may begin.

#### 19.9.1 CI & Doppler Verification Requirements

Before a phase can close:

- `doppler-ci.yml` must run successfully on the active phase branch.
- CI must run and pass on main after merge.
- Doppler must be fully integrated:
  - `doppler run` functional
  - CI uses `DOPPLER_TOKEN_CI`
  - Audit log updates on success
  - No plaintext secrets committed to repo or PR.
- Missing secrets do not block close-out, unless defined by the phase.

#### 19.9.2 Branch Protection Requirements

Before a phase closes:

- main must enforce:
  - Require status checks to pass
  - Required check: Doppler CI
  - Require PR review
  - Prevent direct pushes
  - Enforce signed commits (optional)
- Phase may not end until this is active.
- This requirement cannot be bypassed by any agent.

#### 19.9.3 Ledger Verification Requirements

- The Ledger file in the repo must match the authoritative Ledger in memory exactly.
- All sections must be present and numbered (§1 → §27).
- All locked sections must match content byte-for-byte.
- Differences must block phase closure.

#### 19.9.4 Governance Document Requirements

Before closing a phase, the following must exist and be current:

- PR template
- Phase Gate Checklist
- §19 Review Checklist
- Ledger Verification Checklist
- Governance Log (`docs/GOVERNANCE_LOG.md`)
- CI Audit Log (`ops/doppler/AUDIT_LOG.txt`)

All must match Ledger requirements and pass agent verification.

#### 19.9.5 Phase PR Requirements

Every phase must end with:

- A final Phase Pull Request, titled: "Phase N — Ready for §19 Review (Final)"
- Attached checklists:
  - §19 Review
  - Phase Gate
  - Ledger Verification
- CI green on the phase branch.
- Manual sign-off from:
  - Engineering Lead
  - DevOps Lead
  - Compliance Officer
- Merge strategy: Squash & Merge (mandatory).

#### 19.9.6 Tags & Versioning Requirements

After merge to main:

- Agent must create a GitHub Release Tag: `v1.0-phaseN`
- Release notes must include:
  - Summary of resolved scope
  - PR links
  - Ledger sections completed
  - Audit confirmation
  - CI run ID
- Tag must be immutable once created.

#### 19.9.7 Post-Merge Requirements

- CI must automatically rerun on main.
- Audit log must automatically append CI success entry.
- Governance Log must add:
  - Phase name
  - Date
  - Confirmation of CI pass
  - Confirmation of Ledger sync
  - Confirmation of branch protection
- PR branch must be deleted.
- All docs generated during the phase must be saved into GitHub.

#### 19.9.8 Phase Summary Requirements

After merge:

- Generate a Phase Summary PDF (`Phase N Summary`).
- PDF must include:
  - Scope delivered
  - Ledger sections completed
  - CI/Audit screenshots
  - Architectural & schema changes
  - Next-phase prerequisites
- Save PDF under: `docs/phase-n/PHASE_N_SUMMARY.pdf`

#### 19.9.9 Phase Close-Out Declaration (Mandatory)

A phase officially closes only when:

- CI is green on main
- Branch protection is active
- Ledger matches authoritative memory
- Governance documents validated
- PR completed and tagged
- Governance Log updated
- Phase Summary saved

No agent may begin the next phase without a Phase Close-Out Declaration.

#### Status

Locked.

#### Purpose

Establishes a repeatable, immutable governance protocol for every development phase.

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §20 — Reserved

No content defined in v1.0.

Reserved for future governance modules.

---

## §21 — Reserved

No content defined in v1.0.

Reserved for future compliance, risk, or audit frameworks.

---

## §22 — Reserved

No content defined in v1.0.

Reserved for future integrations or operational domains.

---

## §23 — Reserved

No content defined in v1.0.

---

## §24 — Referrals, Registration & QR System (Parent Section)

This section encapsulates all cross-cutting flows related to:

- Guard registration
- Referrer activation
- Welcome SMS
- Bulk QR generation
- Admin QR workflows
- Print-ready production
- Assignment, reassignment, replacement
- POPIA compliance
- Notifications

### Subsections

- §24.1 Core Domain Overview
- §24.2 Shared QR + Referral Rules (implicit)
- §24.3 Welcome SMS Policy (Locked)
- §24.4 Referrer Activation & Guard Registration via Referrer (Locked)
- §24.5 Bulk QR Generation & Print-Ready Cards (Locked)

### §24.3 — Welcome SMS Policy (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### Scope

Applies to all guard registrations — manual, assisted, or via referrer.

#### Core Policy

- Auto-SMS sent immediately after registration success.
- No OTP required.
- Single SMS only; no multi-step process.

#### Implementation

**Trigger**: `POST /guards/register` → success event.

**Message example** (≤160 chars):

"Hi [Name/there], welcome to Tippy! You've been registered to receive digital tips via your QR card. Payouts are weekly. Need help? WhatsApp 060-123-4567."

#### Variables

- `SEND_GUARD_WELCOME_SMS=true`
- `WELCOME_SMS_TEMPLATE_ID=tippy_guard_welcome_v1`
- `WELCOME_SMS_LANGUAGE_AUTO=true`
- Retry logic: 3 attempts

#### Logging

All SMS events logged to `sms_events` (masked phone numbers).

#### Compliance

POPIA-compliant; MSISDN never logged in plaintext.

**This section is LOCKED. No modifications without Ledger amendment process.**

### §24.4 — Referrer Activation & Guard Registration via Referrer (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### 24.4.1 Bulk Referrer QR Code Generation

Admin can generate referrer QR cards in batches:

- Unique `ref_code` and `ref_qr_url`
- Auto-email print-ready cards (A4 / CR80)
- PDF, SVG, PNG, CSV
- Vendor delivery supported (Tier-3)

#### 24.4.2 Activation Flow

First scan → "Activate Referrer" page:

- Captures name, email, MSISDN
- Records POPIA/T&C consent
- Status: `PENDING_ADMIN`
- Admin approves → `ACTIVE`
- Referrer gains ability to register guards.

#### 24.4.3 Permissions

Referrers may:

- Register guards by scanning unassigned guard QR codes
- View own referred list
- Track referral performance

They may NOT:

- View or edit other guards
- Access admin features

#### 24.4.4 Guard Registration by Referrer

Via scanning unassigned guard QR → Form:

- Required: MSISDN
- Optional: name, language
- No OTP
- Welcome SMS automatically triggered

#### 24.4.5 Anti-Abuse Controls

| Control | Default |
|---------|---------|
| `GUARD_REGS_PER_REFERRER_PER_DAY` | 15 |
| `GUARD_REGS_PER_DEVICE_PER_DAY` | 20 |
| `GUARD_REGS_PER_IP_PER_HOUR` | 30 |
| `GUARD_REASSIGN_COOLDOWN_HOURS` | 24 |
| `REQUIRE_GUARD_OTP` | false |

#### 24.4.6 Data & Audit

All registration + QR assignment events logged in:

- `guard_registration_events`
- `audit_log`
- `abuse_flags`

Immutable trail under §25.

**This section is LOCKED. No modifications without Ledger amendment process.**

### §24.5 — Bulk QR Generation & Print-Ready Cards (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### 24.5.1 Capabilities (Admin)

Bulk-generate guard/referrer QR codes

Outputs include:

- A4 10-up PDF
- Single CR80 PDF
- SVG
- PNG (300 DPI)
- CSV metadata
- Auto-email ZIP to vendor

#### 24.5.2 Print Specifications

- **Size**: CR80 (85.60 × 53.98 mm)
- **Bleed**: 3 mm each side
- **Safe area**: 3 mm inside
- **CMYK**; 300 DPI minimum

**QR**:

- URL format: `https://www.tippypay.co.za/t/<short_code>`
- ECC level H
- Quiet zone ≥ 4 modules
- Min print size: 25 mm
- No PII printed

#### 24.5.3 Data Objects (Extended)

- `qr_batches`
- `qr_designs`
- `qr_codes` extended with `batch_id` + `short_code`
- `audit_log` records events

#### 24.5.4 Admin Console Flow

1. Create Batch
2. Choose Design
3. Generate
4. Preview / Export
5. Download or auto-email vendor

#### 24.5.5 Compliance

- Public short URL only
- No MSISDN/name printed
- Lost cards: mark Lost/Replaced; URL invalidated

#### 24.5.6 Acceptance Tests

- Random card scanner test
- Print proof QA
- URL resolution hygiene
- R10 fee accrues on replacements

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §25 — Environment, Credentials & Secrets Management (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

All runtime secrets are stored in Doppler and injected at runtime via environment variables. **No plaintext secrets are committed to this repository.**

### 25.1 Principles

- Least privilege
- No plaintext secrets in code or logs
- MFA required for production access
- 90-day rotation cadence
- Immutable audit trail
- Two-person rule for production secrets

### 25.2 Secrets Managers

- **GitHub Actions Secrets**: CI/CD tokens
- **Supabase Vault**: Optional database secrets
- **1Password Shared Vault**: "Tippy-Engineering" (admin access)

### 25.3 Environment Variables (Names Only)

#### Domain

- `TIPPY_DOMAIN`
- `TIPPY_API_URL`

#### Supabase

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Yoco

- `YOCO_PUBLIC_KEY`
- `YOCO_SECRET_KEY`
- `YOCO_WEBHOOK_SECRET`

#### SMS (SendGrid/Twilio)

- `SENDGRID_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

#### Xneelo

- `XNEELO_API_KEY`

#### CashSend

- `CASH_SEND_API_KEY`
- `CASH_SEND_API_SECRET`

#### Operational Config

- `ENVIRONMENT` (dev/staging/prod)
- `LOG_LEVEL`
- `SENTRY_DSN`

### 25.4 Storage & Access

- Production secrets: Admin-only access
- No shared accounts
- Two-person rule for production secret rotation
- Development/staging: Developer access with MFA

### 25.5 Rotation & Lifecycle

- Standard rotation: 90 days
- Critical rotation: 30 days (if compromised)
- Webhook secret rotation: Coordinate with provider
- Rotation MUST be documented in audit logs

### 25.6 CI/CD Usage

- All secrets masked in logs
- Secret scanning in pre-commit hooks
- Environment-scoped secrets (dev/staging only for CI)
- Production secrets never in CI

### 25.7 Local Development Procedure

- Use `.env.local` (gitignored)
- Request non-production access via Compliance Officer
- MFA required for Doppler access
- Never commit `.env.local`

### 25.8 Onboarding / Offboarding

- Access registry maintained
- Revoke access within 24 hours of offboarding
- Audit log of all access grants/revocations

### 25.9 Incident Response

- Immediate revocation if compromised
- Rotate affected secrets
- Report to Compliance Officer within 1 hour
- Post-mortem within 7 days

### 25.10 Compliance Tests

- Pre-commit hooks check for plaintext secrets
- CI secret scanning (truffleHog, git-secrets)
- Quarterly access reviews
- Annual penetration testing

### §25.1 — Doppler CI Tokens (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

#### Overview

Doppler CI tokens are service tokens used exclusively for GitHub Actions CI/CD pipelines. These tokens provide read-only access to Doppler secrets for development and staging environments.

#### Token Requirements

1. **Token Name**: `ci-token`
2. **Role**: `read_only`
3. **Environments**: `development`, `staging` (production excluded)
4. **Project**: `tippy`
5. **Storage**: GitHub Actions repository secret `DOPPLER_TOKEN_CI`

#### Token Creation

Tokens MUST be created using the Doppler CLI with least-privilege principles:

```bash
doppler service-tokens create \
  --name "ci-token" \
  --role read_only \
  --environments development,staging \
  --project tippy
```

#### Token Storage

- **Location**: GitHub → Settings → Secrets and variables → Actions
- **Secret Name**: `DOPPLER_TOKEN_CI`
- **Scope**: Repository-level secret
- **Access**: GitHub Actions workflows only

#### Security Requirements

1. **Rotation Policy**: 
   - Standard rotation: 90 days
   - Critical rotation: 30 days (if compromised)
   - Rotation MUST be documented in audit logs

2. **Access Control**:
   - Read-only access only
   - No production environment access
   - No write or delete permissions

3. **Audit Requirements**:
   - All token usage logged in Doppler audit logs
   - GitHub Actions logs MUST mask token values
   - Token creation/rotation requires Compliance Officer approval

4. **Revocation**:
   - Immediate revocation if compromised
   - Use `ops/doppler/emergency_revoke.sh` for emergency revocation
   - Revocation MUST be communicated to DevOps team within 1 hour

#### Token Usage

The token is used exclusively in the Doppler CI workflow:

```yaml
env:
  DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_CI }}
```

#### Compliance

- **POPIA Compliance**: All secret access logged, no PII in logs
- **Least Privilege**: Read-only, dev/staging only
- **Audit Trail**: All access logged in Doppler and GitHub Actions
- **No Plaintext**: Token never printed or logged in plaintext

#### Operator Responsibilities

1. Create token using approved scripts (`ops/doppler/create-service-tokens.ps1`)
2. Store token in GitHub Actions secrets immediately
3. Verify token works via workflow dispatch
4. Document token creation in audit log
5. Rotate token per rotation policy
6. Revoke immediately if compromised

#### Prohibited Actions

- ❌ Storing token in code or documentation
- ❌ Using token for production access
- ❌ Sharing token via unencrypted channels
- ❌ Extending token lifetime beyond policy
- ❌ Using token for manual operations

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §26 — Guard Registration Accessibility & Device Independence (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

### 26.1 Core Requirement

Only MSISDN required for guard registration.

### 26.2 Device Independence

Guards do not need smartphones.

Registration methods:

- Assisted by referrer/guard/admin
- Self-registration via scan or web
- SMS onboarding without app

### 26.3 Registration Flows

**Flow A — Assisted**: Referrer/admin registers guard via QR scan + MSISDN entry.

**Flow B — Self-Registration**: Guard scans own QR or accesses web form, enters MSISDN only.

Both trigger Welcome SMS.

### 26.4 Data Handling

- No email or ID required.
- MSISDN uniqueness + lockout apply.

### 26.5 Admin & Referral Integration

Referrer credited on assisted registration.

### 26.6 POPIA

- Minimal dataset.
- Encrypted at rest.
- SMS via SendGrid/Twilio under §25.

### 26.7 Acceptance Tests

Covers MSISDN-only registration, QR assignment, payout, SMS, etc.

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §27 — Brand Naming & Architecture (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

### 27.1 Master Brand

"Tippy"

### 27.2 Sub-Brand

"Tippy Pay" for functional clarity in payments.

### 27.3 Rules

- Master brand always dominant
- No separate logos for "Tippy Pay"
- All future extensions derive from "Tippy"

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §28 — Official Logo Lock (Locked)

**Status**: Locked — Final  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

### 28.1 Icon Specification

- Blue rounded square (#2367F0)
- Orange hand (#FF6A30)
- White "Tippy" wordmark

### 28.2 Variants

- Primary
- Landscape
- Icon-only

### 28.3 Restrictions

- No recoloring.
- No rotation.
- Minimum clear space defined.

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## §29 — Document & Artifact Storage Policy (Locked)

**Status**: Locked — Final  
**Effective Date**: 2025-11-13  
**Governance Authority**: Tippy Decision Ledger v1.0 (Final)

### Overview

All Tippy project documents, specifications, governance artifacts, and AI-generated outputs that are relevant to design, implementation, operations, or compliance MUST be stored in the canonical GitHub repository (francoisvandijk/tippy) under version control.

### Requirements

1. **Mandatory Storage**: All long-lived documents (e.g., specs, flows, prompts, diagrams, governance notes) MUST be stored in the GitHub repository.

2. **No External-Only Documents**: Long-lived documents MAY NOT exist solely outside GitHub (e.g., only in local files, chat logs, or cloud drives) without a committed copy in the repo.

3. **Organized Storage**: Documents MUST be stored in appropriate folders, such as:
   - `docs/` for documentation
   - `ops/` for operational scripts and runbooks
   - `ops/doppler/` for Doppler-specific artifacts
   - Other clearly named directories as needed

4. **Meaningful Filenames**: All documents MUST use meaningful filenames that clearly indicate their purpose and content.

5. **AI Agent Responsibility**: AI agents working on the Tippy project MUST ensure that any new documents or scripts they generate and intend to rely on are:
   - Saved to disk
   - Added to the repository
   - Committed to the appropriate branch

6. **Phase Close-Out Verification**: Phase close-out for any phase (Phase 1, 2, 3, etc.) MUST include verification that all key artifacts for that phase (flows, specs, CI definitions, prompts, governance notes) are present in the repository and referenced in the Ledger or accompanying governance docs.

7. **Governance Validity**: No material governance decision, CI configuration, or architectural document is considered valid unless it is recorded in the GitHub repository.

### Compliance

- **Version Control**: All documents MUST be under Git version control
- **Repository Sync**: Local-only documents MUST be committed and pushed to GitHub
- **Documentation Reference**: All key documents MUST be referenced in the Ledger or project README

**This section is LOCKED. No modifications without Ledger amendment process.**

---

## Appendix

**The Tip Company (Pty) Ltd**  
Reg: 2016/534254/07 • VAT: 4850288798 • Income Tax: 9840459169  
Bank: FNB • Account: 62675621166 • Branch: 250655 (Rosebank)  
Brand Domain: https://www.tippypay.co.za

**Reference Prefix**: TPY- (e.g., TPY-PAYOUT-YYYYMMDD-<id>)

**Purpose**: This Ledger is the single source of truth for architecture, workflows, governance, compliance, and implementation of the Tippy ecosystem.

*Ledger maintained by Tippy Governance & DevOps Agent*  
*Last Updated: 2025-11-13*  
*Version: v1.0 (Final)*
