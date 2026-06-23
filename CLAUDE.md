# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SimpleShop — a multi-tenant SaaS e-commerce platform for the Venezuelan market. A single business owns multiple physical stores under one entity, with localized payments (Pago Móvil, Zelle), subscription tiers, and centralized inventory with per-store stock.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`). **`pnpm` is mandatory** — never use npm/yarn.

- `apps/main-web` — the product. Next.js 16 (App Router, Turbopack), React 19, the storefront + store admin + onboarding + all API routes. This is where ~all work happens.
- `apps/saas-admin` — a separate Vite + React SPA (currently a near-empty scaffold for the platform-admin console).
- `packages/database`, `packages/shared`, `packages/ui` — workspace packages (`@simpleshop/*`). Lean; most code still lives inside `main-web`.

The two apps use **different toolchains** (Next vs Vite) — commands differ per app; don't assume root scripts cover both.

## Commands

Root (`pnpm --recursive`): `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`.

Per app (run from the app dir, the usual workflow):
- `main-web`: `pnpm dev` (Next dev), `pnpm build`, `pnpm start`, `pnpm lint` (eslint), `pnpm tsc` (type check)
- `saas-admin`: `pnpm dev` (Vite), `pnpm build` (`tsc -b && vite build`), `pnpm lint`, `pnpm preview`

There is **no test runner configured** — `pnpm test` is a no-op. Verify changes via `pnpm tsc` + `pnpm lint` and by running the app.

Local URLs: landing at `localhost:3000`; a tenant at `<tenant>.localhost:3000`.

## Multi-tenancy (the core architectural concept)

Tenancy is resolved by hostname in `apps/main-web/src/middleware.ts`:
- Root domain (`NEXT_PUBLIC_ROOT_DOMAIN`, default `localhost`) or `www.*` → landing page, no rewrite.
- Any subdomain or custom domain → the host is treated as the tenant id and the request is **rewritten to `/sites/[tenant]/...`**. So everything under `src/app/sites/[tenant]/` is the per-tenant surface (storefront + `/admin` store dashboard).
- The middleware also hydrates the Supabase session (`src/lib/supabase/middleware.ts`) and does a cheap edge check redirecting unauthenticated `/admin` requests to `/admin/login`.

**Every store-scoped data query must filter by tenant** — use `store_id` (and/or `business_id`). This is enforced at the DB layer with Supabase Row-Level Security; do not bypass it.

## Data access rules (enforced — see `apps/main-web/.agent/rules/backend.md`)

- **Client Components (`'use client'`) must NOT query Supabase directly.** All reads/writes go through App Router API routes in `src/app/api/...`.
- One API file per feature; no inline axios; routes do not carry an `/api/` prefix in their own paths.
- Supabase clients: `src/lib/supabase/server.ts` (server / RSC / route handlers), `client.ts` (browser), `middleware.ts` (session). Prefer Server Components for data fetching.
- Keep route handlers thin; complex logic lives in service modules under `src/lib/api/` (`business.ts`, `products.ts`, `inventory-client.ts`).
- Generated DB types live in `src/types/supabase.ts` — use them, do not hand-roll row types.

## Auth / RBAC

`src/lib/supabase/rbac.ts` is the authority. Two distinct layers:
- **Business-scoped roles** stored on `profiles.role`, tied to a `business_id`: `'owner' | 'admin' | 'manager' | 'staff'`. Check with `getBusinessRole(businessId)`.
- **Platform superadmin** via Supabase `app_metadata.system_role === 'superadmin'` (`isPlatformAdmin()`) — for the SaaS operator, not tenants.

(Note: GEMINI.md mentions `owner`/`administrative`; the code in `rbac.ts` is the source of truth.)

## Subscriptions

Plan status is **computed on the fly** from historical rows in `business_subscriptions` (tiers like "Emprendedor", "Empresarial") — there is no single mutable "current plan" flag. Plans gate store limits and billing.

## Database

Supabase/Postgres. Migrations in `supabase/migrations/` (timestamped). `supabase_schema.sql` (repo root) is a reference snapshot; `supabase/seed.sql` and `supabase/seed_demo.sql` seed dev/demo data. Seed and mock data must be in Spanish.

## Conventions

- **Language: Spanish 🇻🇪.** All user-facing strings, slugs, error messages, mocks, seeds, *and code comments* are in Spanish. (`.cursorrules`, `.agent/rules/spanish.md`)
- **TypeScript strict, no `any`** — use `unknown` + type guards, discriminated unions, handle null/undefined explicitly. (`.agent/rules/typescript.md`)
- **Styling:** Tailwind utility classes only (Tailwind v4); no custom CSS files or inline styles except for dynamic values; **never put placeholders inside inputs**. Merge classes with `cn()` from `src/lib/utils.ts`. Aesthetic = high-contrast black/white "MegaImport" look, bold uppercase tracked labels.
- Forms: React Hook Form + Zod. Client state: Zustand with persist (`src/stores/` — `adminStore.ts`, `cartStore.ts`).

## Where things live (`apps/main-web/src`)

- `app/api/` — backend routes: `admin`, `auth`, `businesses`, `categories`, `cron`, `inventory`, `orders`, `payment-methods`, `products`, `stores`, `upload`.
- `app/sites/[tenant]/` — tenant storefront + store admin (`admin/`, `checkout/`, `collections/`, `products/`, `locations/`, etc.).
- `features/` — feature modules: `admin`, `home`, `onboarding`, `products`, `stores`.
- `lib/` — `api/` (services), `supabase/`, `hooks/`, `currency.ts`/`currency-shared.ts`, `utils.ts`, `data.ts`, `mock-data.ts`.
- `.agent/skills/` — extensive AI skill docs (multitenancy, supabase auth, nextjs patterns, ecommerce roles, etc.) worth consulting for deeper task-specific guidance.

`docs/` holds design/decision docs (`plans_design.md`, `plans_implementation_plan.md`, `akomo_integration_design.md`, `project_analysis.md`).
