# ClauseDesk — Contract Obligation & Renewal Assistant

**Live app:** [ClauseDesk on Vercel](https://contract-renewal-assistant.vercel.app/)

Login username: `admin`. Use your configured `APP_ACCESS_PASSWORD` as the password; see the login instructions below.

ClauseDesk helps you review one contract and an optional organizational policy, track obligations and renewal dates, and preserve corrections across contract versions. Every extracted finding links back to its source text.

**This is an information-management tool, not legal advice.**

## Features

- Upload text-based PDF, DOCX or TXT files, or paste contract text.
- Extract parties, effective date, expiry, renewal, termination, notice clauses and obligations.
- Inspect exact source quotes, uncertain interpretations and clarification questions.
- Edit, approve or reject findings before including them in a reviewed summary.
- Calculate dates and reminders with deterministic code.
- Preserve versions and review history; flag older approvals as potentially stale.
- Try a fictional sample contract without an OpenAI key or Blob storage.

Application source is in [`app/`](./app). Use Node.js **22.x** and npm.

## Login: which ID and password should I enter?

| Where you run the app | Login ID / username | Password |
| --- | --- | --- |
| Vercel deployment | `admin` | The exact value you set for `APP_ACCESS_PASSWORD` in Vercel Environment Variables |
| Native Next.js locally (`npm run dev:vercel`) | `admin` | The value of `APP_ACCESS_PASSWORD` in `app/.env.local` |
| Sites development locally (`npm run dev`) | Click **Sign in to your workspace** | No password is required for the loopback-only test identity |
| Private hosted Sites app | Use the platform sign-in flow | Your platform account; the Vercel `admin` credentials do not apply |

**There is no default password.** Do not enter your email, OpenAI key or Turso token as the login password. Vercel/native Next.js displays a browser authentication prompt, rather than a registration page.

Generate your own random password in Terminal:

```sh
openssl rand -hex 24
```

Save the result in your password manager. Set it as `APP_ACCESS_PASSWORD` (minimum 24 characters). For local native Next.js, add it to the ignored `app/.env.local`; for Vercel, add it under **Project → Settings → Environment Variables**, then redeploy. In the Vercel value field, paste the password without surrounding quotation marks.

The Vercel version is a single-owner workspace: everyone using this password accesses the same records. Actual passwords, API keys and database tokens must not be committed to this repository.

## Quick start: local demo without cloud accounts

From the repository root:

```sh
cd app
npm ci
npm run build
npm run db:migrate
npm run dev -- --hostname 127.0.0.1
```

Open the printed URL, normally `http://127.0.0.1:5173`. Click **Sign in to your workspace**, then **Explore sample contract**. Existing sample data may already appear.

This path uses local Cloudflare D1/R2 emulation. It does not require Turso, Vercel Blob or `APP_ACCESS_PASSWORD`. Data is stored under `app/.wrangler/state`; keep that directory to retain your workspace. If port 5173 belongs to another app, use the exact URL printed by this server.

## Vercel / native Next.js setup

### 1. Configure the project

| Vercel setting | Value |
| --- | --- |
| Root Directory | `app` |
| Framework Preset | Next.js |
| Node.js Version | `22.x` |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `.next` |

### 2. Add environment variables

Create a Turso database and get its database URL and auth token. In Vercel, open **Project → Settings → Environment Variables** and add values for the deployment environment you use (Production for the live site).

| Variable | When required | Value to provide |
| --- | --- | --- |
| `APP_ACCESS_PASSWORD` | Always | Your random password, at least 24 characters |
| `TURSO_DATABASE_URL` | Always | Your Turso database URL |
| `TURSO_AUTH_TOKEN` | Always | Your database auth token |
| `BLOB_READ_WRITE_TOKEN` | Real uploads | Token from a **private** Vercel Blob store connected to the project |
| `OPENAI_API_KEY` | Real extraction | Your OpenAI API key |
| `OPENAI_MODEL` | Real extraction | A model available to your API account; the example config uses `gpt-5.4` |

For real uploads, create/connect a **private** Blob store in the project's Storage tab. A connected OIDC store may use `BLOB_STORE_ID` instead of `BLOB_READ_WRITE_TOKEN`.

For sample mode, only the password and migrated Turso database are needed. Sample findings are prewritten and clearly labelled. Sample contract/policy downloads are generated from their saved source text; no Blob store or AI request is needed.

### 3. Initialize the database

From `app/`, create `.env.local` using [`.env.example`](./app/.env.example) as a template. If `.env.local` already exists, edit it without overwriting its current values. Fill in your Turso URL and token, then run:

```sh
npm run db:migrate:vercel
```

Success prints `Database schema is up to date.` Applied migrations are tracked, so rerunning does not recreate the tables.

**Local `.env.local` is not uploaded by Git.** Add the same required settings separately in Vercel. Keep `.env.local` ignored; never commit it or prefix server secrets with `NEXT_PUBLIC_`.

### 4. Redeploy and sign in

In Vercel, redeploy the latest `main` commit after saving the environment variables. Open the app and enter:

- **Username / ID:** `admin`
- **Password:** your configured `APP_ACCESS_PASSWORD` value.

Open the existing sample or choose **Explore sample contract**. Review findings, inspect deadlines and download a reviewed summary.

For local native Next.js using the same cloud database, add the required settings to `app/.env.local` and run:

```sh
npm run dev:vercel
# Production-build check instead:
npm run build:vercel
npm run start:vercel
```

The native local URL is normally `http://127.0.0.1:3000`. This uses the configured Turso database, including any live records in that database; it is separate from the local Sites workspace on port 5173.

## Enable AI in the local Sites workflow

Copy `app/.dev.vars.example` to `app/.dev.vars` if that file does not already exist. Set `OPENAI_API_KEY` and `OPENAI_MODEL`, then restart `npm run dev`. The Sites workflow uses `.dev.vars`; the native Next.js workflow uses `.env.local`.

Sample mode never calls OpenAI. Real extraction sends document text to the configured provider and requires working API access and quota.

## Common setup errors

| Message / symptom | Fix |
| --- | --- |
| `Workspace setup required` | Set `APP_ACCESS_PASSWORD` to at least 24 characters, then redeploy. |
| Browser keeps asking for login | Use `admin` and the password from the environment running this app. There is no default password. |
| `Database is not configured` | Add both Turso variables to the relevant environment. |
| `Database schema is not ready` | Run `npm run db:migrate:vercel` against that database. |
| `Document storage is not configured` | For real uploads, connect private Blob storage and configure its token. Sample mode on the latest code does not need Blob. |
| Settings work locally but fail online | Add the variables in Vercel's Production environment and redeploy; local files are not transferred. |
| Sample data is not visible online | Check that Vercel uses the same Turso database where the sample was added. Local Sites data is separate. |

## Validation

Run these from `app/`:

```sh
npm run typecheck
npm test
npm run build:vercel
npm run test:vercel
```

`test:vercel` starts the built app with temporary test authentication and no cloud credentials. It verifies access protection and missing-configuration handling, not a live provider request.

With the local Sites development server running, `npm run test:local-runtime` checks authenticated database reads without changing records. `npm run test:api` creates demo versions and review decisions; use a separate sample-only local workspace for that test.

## Limits

- Text-based documents only; no OCR, e-signatures, payments or external calendar integration.
- Up to 1.5 MB per document on Vercel; 8 MB on Sites. Up to 50 PDF pages and 80,000 extracted characters across contract and policy.
- Reminders are displayed dates, not email or background notifications.
- Unclear date conventions remain unresolved until reviewed. A matching source quote does not establish that an interpretation is correct.

See the [application guide](./app/README.md) for architecture and the review walkthrough, and the [Vercel guide](./app/VERCEL.md) for deployment details.
