# Sauti — Creator Infrastructure Platform Plan

> **Vision:** Turn Sauti from an operator-owned media backend into a platform where
> **creators run their own infrastructure** — host their content, control their
> backend, and get paid. Think "monetized channel," except we hand each creator a
> full webpage + the backend powering it.

**Decisions locked in for this plan:**
- **Payment rail:** Paystack (Africa-first: cards, mobile money, bank transfer + payouts).
- **Monetization (phase 1):** Keep the existing **ads** model. Paystack is used to **pay creators their ad-revenue share**. Subscriptions / pay-per-view / tips are later phases on the same Paystack integration.
- **Approach:** Plan first, then build foundation → studio → channel page → payouts.

---

## 1. Where we are today

Sauti is a Node/Express **single-tenant** media BaaS. It works, but everything is
owned by the operator ("Sauti"), not by individual creators.

| Layer | Exists | File(s) |
|---|---|---|
| Ingest (Mux uploads/import, African encoding) | ✅ | `src/services/production/ingest.service.js` |
| Streaming (ISP-aware optimized URLs) | ✅ | `src/services/production/streaming.service.js` |
| Ads (VAST cue points, ad analytics) | ✅ | `src/services/production/ad.service.js` |
| Realtime (WebSocket viewer counts) | ✅ | `src/services/production/websocket.service.js` |
| Scheduler (cron maintenance) | ✅ | `src/services/production/scheduler.service.js` |
| Admin (operator stats/sessions) | ✅ | `src/services/production/admin.service.js`, `src/api-gateway/routes/production-admin.routes.js` |
| Storage (S3) | ✅ | `src/services/storage/*` |
| DB (Supabase/Postgres) | ✅ | `database.sql`, `setup-supabase-database.sql` |
| Admin dashboard (React/Vite) | ✅ | `dashboard/` |
| HTTP API surface | ✅ | `src/production-index.js` |

### The four gaps blocking the vision
1. **No tenancy.** Assets have no owner. No `creators` table; content is global.
2. **No creator auth.** `passport`, `jsonwebtoken`, `bcryptjs` are installed but unused. Only "auth" is a single shared `x-admin-key`.
3. **No creator payouts.** Ads generate revenue *to the operator*; there's no mechanism to attribute earnings to a creator or pay them.
4. **No creator-facing surface.** The dashboard is an internal operator tool. There's no public channel page (where fans watch) and no creator studio (where creators control their backend).

---

## 2. Target architecture

```
                          ┌─────────────────────────────┐
                          │        Sauti Platform        │
                          └─────────────────────────────┘
   CREATOR                                              FAN
   ───────                                              ───
   Sign up / login                                      Visit sauti.../@creator
        │                                                    │
        ▼                                                    ▼
  ┌───────────────┐    owns    ┌──────────┐   watches  ┌──────────────┐
  │ Creator Studio│──────────► │ Channel  │ ◄──────────│ Public Channel│
  │ (control panel)│  content  │ + Assets │            │  Webpage      │
  └───────────────┘            └──────────┘            └──────────────┘
        │                           │                        │
        │ configures ads            │ Mux playback           │ ad impressions
        ▼                           ▼                        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  Sauti API (multi-tenant, creator-scoped via JWT + RLS)         │
  │  ingest · streaming · ads · analytics · earnings · payouts      │
  └───────────────────────────────────────────────────────────────┘
        │                           │                        │
        ▼                           ▼                        ▼
   Supabase (RLS by creator_id)   Mux                   Paystack (payouts)
```

**Tenancy model:** every content row carries a `creator_id`. Supabase **Row Level
Security** enforces that a creator can only see/modify their own rows; the public
channel page reads through a constrained public view. The operator admin keeps the
service-role bypass it has today.

**Identity:** use **Supabase Auth** (we already run Supabase) for creator
sign-up/login. It issues JWTs that the API verifies and maps to `creator_id`. This
avoids hand-rolling passport/bcrypt flows and gives us email/OAuth for free. The
unused passport/jwt/bcrypt deps can be removed later.

---

## 3. Data model changes

New tables (additive — existing tables get a nullable `creator_id` then backfill):

```sql
-- A creator = one tenant. Mirrors a Supabase auth.users row.
creators (
  id              uuid pk references auth.users(id),
  handle          text unique not null,      -- @afrobeats -> public URL slug
  display_name    text not null,
  bio             text,
  avatar_url      text,
  banner_url      text,
  country         text,                       -- payout + ad targeting
  status          text default 'active',      -- active | suspended | pending
  created_at      timestamptz default now()
)

-- Where ad earnings accrue and payout config lives.
creator_payout_accounts (
  creator_id        uuid pk references creators(id),
  paystack_subaccount_code text,             -- Paystack subaccount for splits/payouts
  bank_code         text,
  account_number    text,                     -- last4 stored, full at Paystack
  account_name      text,
  mobile_money_provider text,                 -- mtn | airtel | etc.
  payout_currency   text default 'NGN',
  verified          boolean default false,
  created_at        timestamptz default now()
)

-- Running ledger of ad revenue attributed to a creator.
earnings_ledger (
  id              uuid pk,
  creator_id      uuid references creators(id),
  asset_id        text,
  source          text,                       -- 'ads' (phase 1); 'subscription'|'ppv'|'tip' later
  gross_amount    numeric,                     -- in minor units
  platform_fee    numeric,
  net_amount      numeric,
  currency        text,
  period          date,                        -- billing period bucket
  status          text default 'accrued',      -- accrued | paid
  created_at      timestamptz default now()
)

-- Payout runs to Paystack.
payouts (
  id              uuid pk,
  creator_id      uuid references creators(id),
  amount          numeric,
  currency        text,
  paystack_transfer_code text,
  status          text default 'pending',      -- pending | success | failed | reversed
  failure_reason  text,
  created_at      timestamptz default now(),
  paid_at         timestamptz
)
```

Alter existing tables:
```sql
alter table assets            add column creator_id uuid references creators(id);
alter table uploads           add column creator_id uuid references creators(id);
alter table ad_cue_points     add column creator_id uuid references creators(id);
alter table streaming_sessions add column creator_id uuid references creators(id);
alter table analytics_events  add column creator_id uuid references creators(id);
```

Plus a lightweight **channel** concept (one channel per creator to start; the
`creators` row *is* the channel) and a `channel_settings` JSONB for theme/branding
of the public page.

**RLS:** replace the current `using (true)` policies with
`using (creator_id = auth.uid())` for creator-scoped access, keep service-role
bypass for the operator, and add a public read policy for published assets only.

---

## 4. Monetization & money flow (ads → Paystack payouts)

Phase 1 keeps ads as the revenue engine. The new part is **attribution + payout**:

1. **Attribution.** When an ad impression/completion is recorded (extend
   `analytics_events` + ad analytics), attribute estimated revenue to the asset's
   `creator_id` and write an `earnings_ledger` row (gross, platform fee, net).
2. **Balance.** A creator's balance = sum of `net_amount` where `status='accrued'`.
   Shown in the Studio.
3. **Payout.** Creator adds a Paystack-supported destination (bank or mobile money)
   → we create a Paystack **transfer recipient** → on payout run we call Paystack
   **Transfers**, write a `payouts` row, flip ledger rows to `paid` on the
   `transfer.success` webhook.
4. **Webhooks.** A `/v1/paystack/webhook` endpoint (signature-verified) handles
   `transfer.success` / `transfer.failed` / `transfer.reversed`.

**Future phases reuse this rail:** Paystack **subaccounts + split payments** for
subscriptions / pay-per-view / tips, so fan money lands split between platform and
creator automatically. No re-architecture needed — `earnings_ledger.source` already
anticipates these.

> Open item for later: platform fee %, payout minimum threshold, payout cadence
> (manual request vs. scheduled), and currency handling per country.

---

## 5. Creator-facing surfaces

### A. Creator Studio (control-your-backend panel)
Extends the existing `dashboard/` React app (or a new authed area) with creator login:
- **Content**: upload (reuse `/v1/ingest`), list/manage own assets, publish/unpublish.
- **Monetization**: place ad cue points per video (reuse `/v1/ads`), see ad analytics.
- **Earnings**: balance, ledger, request payout, manage Paystack payout destination.
- **Channel**: edit handle, branding (avatar/banner/theme), preview public page.
- **Analytics**: views, watch time, country/ISP breakdown (reuse `analytics_events`).

### B. Public Channel Webpage (the "full webpage" we give them)
A server-rendered or static public page at `sauti.../@handle`:
- Creator branding (banner, avatar, bio).
- Grid of published videos → Mux player with African-optimized playback + ad insertion.
- Mobile-first, ultra-low-bandwidth (consistent with existing 150kbps optimization).
- This is the page a creator shares with their audience; ads on it generate their earnings.

---

## 6. API additions (multi-tenant)

All creator routes sit behind JWT auth middleware that resolves `creator_id`.

```
POST   /v1/auth/*                 (Supabase Auth handles sign-up/login client-side; API verifies JWT)
GET    /v1/me                     -> creator profile
PATCH  /v1/me                     -> update profile/branding

POST   /v1/ingest/upload          (existing — now scoped to creator_id)
GET    /v1/assets                 -> list MY assets
PATCH  /v1/assets/:id             -> publish/unpublish, edit metadata

POST   /v1/ads/cuepoints/:assetId (existing — now ownership-checked)

GET    /v1/earnings               -> balance + ledger
POST   /v1/payouts                -> request payout
GET    /v1/payouts                -> payout history
POST   /v1/payout-account         -> set/verify Paystack destination
POST   /v1/paystack/webhook       -> Paystack transfer events (no auth, signature-verified)

GET    /public/channels/:handle           -> public channel data
GET    /public/channels/:handle/assets    -> published assets only
```

Existing operator admin (`/v1/admin/*`) stays, gains a creators list + payout oversight.

---

## 7. Phased roadmap

Each phase is independently shippable and leaves the system working.

### Phase 0 — Foundation (tenancy + auth)  ⟵ *build this first*
- Migration: `creators`, payout/earnings/payout tables, add `creator_id` columns.
- Supabase Auth wiring + JWT verification middleware (`req.creator`).
- Ownership enforcement on ingest/assets/ads routes + RLS policy rewrite.
- Backfill strategy for existing global assets (assign to a default/operator creator).
- **Outcome:** content is owned; creators can authenticate and only touch their own data.

### Phase 1 — Creator Studio (control the backend)
- Auth UI (login/signup) in the dashboard app.
- "My content" upload + manage + publish/unpublish.
- Ad cue point management per video.
- Channel branding editor.
- **Outcome:** a creator can self-serve their whole backend.

### Phase 2 — Public Channel Webpage (the full webpage)
- `sauti.../@handle` public page with branding + video grid + Mux player + ads.
- Public read API + RLS for published assets.
- **Outcome:** creators have a shareable monetized webpage.

### Phase 3 — Earnings & Paystack payouts
- Ad-revenue attribution → `earnings_ledger`.
- Paystack transfer recipients + Transfers + webhook.
- Studio earnings/payout UI.
- **Outcome:** creators see and withdraw their ad earnings.

### Phase 4 — Direct monetization (later)
- Paystack subaccounts + split payments for subscriptions / PPV / tips.
- Fan accounts / entitlements / gated playback.
- **Outcome:** revenue beyond ads, same payout rail.

---

## 8. Risks & decisions to confirm before/while building
- **Auth choice:** Supabase Auth (recommended) vs. the installed passport/JWT stack. Plan assumes Supabase Auth.
- **Studio location:** extend existing `dashboard/` vs. a separate creator app. Plan assumes extend.
- **Public page rendering:** static/Vite SPA vs. SSR (better SEO/sharing). Plan leans SSR-light.
- **Backfill:** what happens to existing global assets (e.g. `test-asset-123`). Plan: assign to an operator-owned default creator.
- **Money policy:** platform fee %, payout threshold, cadence, multi-currency — to define before Phase 3.
- **Ad revenue source:** today ads point at sample/placeholder VAST. Real earnings need a real ad network/contracts — Phase 3 attribution can run on estimated CPMs until then.

---

## 9. Immediate next step
On approval, start **Phase 0**: write the SQL migration for tenancy + the JWT auth
middleware, then thread `creator_id` ownership through the ingest/assets/ads routes.
No phase-1+ UI work begins until the foundation is in and verified.
