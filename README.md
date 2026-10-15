# HydroTrack

HydroTrack is a project-scoped construction water-management app for recording water supply and consumption, reviewing water balance, monitoring anomalies, and producing audit-ready reports.

## Run locally

### Requirements

- Node.js 20 or later
- npm

### Setup

1. Install dependencies: `npm ci`
2. Copy `.env.example` to `.env` and set a unique `AUTH_SECRET`.
   - PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
3. Create/update the SQLite database and generate the Prisma client: `npm run db:migrate`
4. Load demo users, projects, activities, and sample telemetry: `npm run db:seed`
5. Start the app: `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000).

The seed operation is intended for local/demo environments. Do not use its shared credentials in production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma connection string. The example uses SQLite at `prisma/dev.db`. |
| `AUTH_SECRET` | Yes | Secret used by Auth.js to sign and encrypt session data. Use a unique, high-entropy value outside local development. |

Generate a secret with `npx auth secret` or an operating-system cryptographic random generator. Never commit `.env`.

## Demo accounts

All seeded demo accounts use the shared password `Password@123`. These are for local demos only.

| Role | Email | Project scope |
| --- | --- | --- |
| Project manager | `pm.vikram@watermgmt.io` | All projects; administrative access |
| Site engineer | `engineer.rahul@watermgmt.io` | Apex Heights |
| Site engineer | `engineer.priya@watermgmt.io` | Green Valley |
| Auditor | `auditor.ananya@watermgmt.io` | All projects; read-only |

## Architecture

- **Next.js App Router** provides server-rendered routes and route-level loading/error states.
- **Server Actions** validate and persist mutations, enforce project access and RBAC, recalculate volumes, write audit records, and revalidate affected pages.
- **Prisma** is the data-access layer. SQLite is the default local provider; schema and deployment instructions for PostgreSQL are below.
- **`waterCalculations.js`** is the calculation engine. `src/lib/water-service.ts` is the typed validation and application boundary around it.
- **Auth.js credentials provider** authenticates seeded users and carries the role into server-side authorization.
- **Vitest** covers service, validation, RBAC, reporting, and anomaly behavior. Node's built-in test runner covers the engine. Playwright covers browser smoke flows.

### Folder map

```text
src/
  app/                  App Router pages, loading/error boundaries, API routes
    actions/            Authenticated Server Actions
    api/                Preview and report export endpoints
    projects/[id]/      Project-scoped supply, consumption, analytics, and settings
  components/           Shared navigation, data views, charts, and UI primitives
  lib/                  Auth/RBAC, Prisma, water service, anomaly, and report logic
prisma/
  schema.prisma         Database models and indexes
  migrations/           Versioned schema changes
  seed.ts               Local demo dataset
waterCalculations.js    Authoritative pure calculation engine
e2e/                    Playwright smoke tests
```

## Roles and permissions

| Capability | Project manager | Site engineer | Auditor |
| --- | --- | --- | --- |
| View accessible project data, dashboards, analytics, and alerts | All projects | Assigned projects | All projects |
| Create projects, manage users, members, activities, thresholds | Yes | No | No |
| Create supply and consumption records | Yes | Yes, assigned projects | No |
| Edit/delete records | Any record | Own records within 48 hours | No |
| View audit history | Yes | No | Yes |
| Generate reports | All report types | Daily and activity reports for assigned projects | All report types |
| Import supply CSV | Yes | No | No |

RBAC is enforced in server-side actions and route handlers; hiding a button is not the authorization boundary.

## Calculation engine

All persisted volumes are stored in cubic metres and recomputed server-side. The UI's live previews are informative only; they do not replace server validation.

- **Supply:** `computeSupplyVolume` normalizes entered cubic metres or litres.
- **Flow meter:** normalized flow rate multiplied by normalized elapsed time.
- **Pipe:** cross-sectional area × velocity × runtime; pipe diameter is entered in inches and converted by the engine. If velocity is omitted, the project's configured assumed velocity is applied and the record stores the assumption flag and warning.
- **Direct entry:** litres are converted to cubic metres.

Inputs, intermediate engine outputs, assumption flags, and audit history are retained for traceability. An unaccounted balance is not automatically interpreted as wastage.

## Development and test commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:engine
npm run test:e2e
npm run build
```

For browser tests, seed the local database and install Chromium once with `npx playwright install chromium`. `npm run test:e2e` starts a Next.js dev server on port 3100 and tests the demo accounts and project flows.

Database helpers:

```bash
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Deployment: Vercel and PostgreSQL

1. Provision a PostgreSQL database and set `DATABASE_URL` in Vercel's environment settings. Use the provider's pooled URL for app traffic if required by the provider, and a direct URL for migrations when pooling is incompatible.
2. In `prisma/schema.prisma`, change the datasource `provider` from `"sqlite"` to `"postgresql"` and keep `url = env("DATABASE_URL")`.
3. Generate a PostgreSQL migration from the current schema against an empty PostgreSQL migration baseline; do not apply SQLite SQL migrations to PostgreSQL. Review and commit the generated migration, and preserve existing migration history when migrating real data.
4. Update the deployment build pipeline to run `prisma generate` and apply committed migrations with `prisma migrate deploy` before serving traffic.
5. Set a unique production `AUTH_SECRET`. Do not seed demo users or use `Password@123` in production.
6. Deploy to Vercel and confirm the migration status, authentication, report exports, and project-scoped authorization against the production database.

Use a tested backup/restore and data-migration plan when moving an existing SQLite installation; changing the provider alone does not transfer its records.
