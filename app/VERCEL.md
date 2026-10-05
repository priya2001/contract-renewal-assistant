# Deploy ClauseDesk on Vercel

The original `npm run build` creates a **Cloudflare Worker**, not a native Next.js deployment. Vercel cannot run `cloudflare:workers`, D1/R2 bindings, or Sites' authenticated-user headers. The Vercel build now uses native Next.js, a Turso/libSQL database adapter, private Vercel Blob storage, and password protection for this single-owner workspace. The existing Sites build and data remain separate.

## 1. Project settings

In Vercel → Project → Settings → Build and Deployment:

| Setting          | Value                         |
| ---------------- | ----------------------------- |
| Root Directory   | `app`                         |
| Framework Preset | Next.js                       |
| Node.js Version  | 22.x                          |
| Install Command  | `npm ci`                      |
| Build Command    | `npm run build:vercel`        |
| Output Directory | `.next` (default for Next.js) |

`app/vercel.json` supplies the framework and commands. Remove conflicting dashboard overrides, especially `dist` as Output Directory. `npm run build` also detects the Vercel environment and selects the native build automatically.

The `@esbuild-kit/*` deprecation messages come from existing development tooling. They do not cause the deployment failure. The Node version is now pinned to a supported major instead of `>=22.13.0`.

## 2. Runtime configuration (required for a usable app)

A successful build does not provision a database or copy local secrets to Vercel. Add the following in **Settings → Environment Variables** for the environments you will use, then redeploy:

| Variable                | Purpose                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_ACCESS_PASSWORD`   | A random secret of **at least 24 characters** for private access. Login username is `admin`. Generate a hexadecimal password with `openssl rand -hex 24`; save it in your password manager and Vercel. |
| `TURSO_DATABASE_URL`    | URL of a persistent Turso/libSQL database.                                                                                                                                                             |
| `TURSO_AUTH_TOKEN`      | The corresponding database token.                                                                                                                                                                      |
| `BLOB_READ_WRITE_TOKEN` | Token for a **private** Vercel Blob store connected to this project. An OIDC-enabled connected store can use `BLOB_STORE_ID` instead.                                                                  |
| `OPENAI_API_KEY`        | Your OpenAI API key. Optional for sample mode; required for real extraction.                                                                                                                           |
| `OPENAI_MODEL`          | Your chosen accessible model, e.g. `gpt-5.4`.                                                                                                                                                          |

Never prefix secrets with `NEXT_PUBLIC_`. Do not commit `.env.local` or `.dev.vars`. The local `.dev.vars` file is not uploaded by Git and is not used by native Next.js.

Create/connect a private Blob store from the project's Storage tab. Do **not** select public storage for contracts. Reads go through authenticated application routes; the app never exposes public original-document URLs.

Turso and Vercel resources are not automatically created by this patch. Configure them in your own accounts; review their applicable plans before provisioning. The earlier Sites workspace is independent and its existing records are not migrated.

## 3. Initialize the database once

From this repository's `app` directory, copy `.env.example` to `.env.local` and fill in your Turso URL and token locally. Alternatively, pull your configured Vercel environment into the ignored `.env.local` file using the Vercel CLI.

```sh
cd app
cp .env.example .env.local
# Edit .env.local locally; do not paste secrets into chat or source.
npm run db:migrate:vercel
```

This command applies the tracked `drizzle/*.sql` migrations in order. Each migration and its tracking record execute in one transaction; rerunning skips applied migrations. Do not edit already-applied migrations. Run again after adding a new schema migration.

## 4. Redeploy and use

Redeploy the latest `main` commit. Open the URL and enter:

- Username: `admin`
- Password: the `APP_ACCESS_PASSWORD` value you configured.

Choose **Explore sample contract** first. Review, edit, reject, download a summary, and upload a sample revision. Real extraction is available after adding the OpenAI key.

Sample mode only needs the workspace password and migrated Turso database. Its fictional documents are downloaded from the version's saved text, so neither Blob storage nor an OpenAI key is needed for the demo. Real uploads still require private Blob storage.

This is a **single-owner** workspace, not a multi-user team login. Anyone with the workspace password shares that workspace. Without a valid password, APIs cannot read or write records; client-supplied Sites identity headers are ignored. Missing password configuration returns a clear 503 setup message rather than exposing the app. HTTPS is supplied by Vercel. Browser HTTP authentication may remain cached until the browser session is closed.

## Local native Next.js check

With the same `.env.local` configuration:

```sh
npm run dev:vercel
# Or check the production build:
npm run build:vercel
npm run start:vercel
```

Use the printed loopback URL (usually port 3000). This is distinct from the existing Sites local workflow on port 5173 using `.dev.vars`.

## Limits and checks

- The Vercel path accepts **1.5 MB per document** and rejects combined uploads above 4 MB, leaving room under Vercel's request-body cap. The existing Sites path retains its 8 MB per-file limit. Pasted text remains available for larger text-only inputs. PDF page count and extracted-text limits are unchanged.
- The extraction endpoint sets `maxDuration = 120`; provider requests still time out at 90 seconds. Deployment execution limits must support this duration.
- Original files persist in private Blob storage; extracted records, versions and corrections persist in Turso. No serverless local filesystem is used for contract persistence.
- The native Next.js build can succeed without secrets. Runtime configuration is intentionally validated when the app is used.
- Run `npm test` for date/source tests, adapter transaction/rollback/concurrency checks, and fail-closed authentication tests.

Official references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [libSQL transactional batches](https://tursodatabase.github.io/libsql-client-ts/interfaces/Client.html).
