# ClauseDesk — Contract Obligation & Renewal Assistant

**Live app:** [ClauseDesk on Vercel](https://contract-renewal-assistant.vercel.app/)

A private, single-contract workspace for cited extraction, human review, deterministic deadlines, version history, and reviewed summaries. This is an information-management tool, **not legal advice**.

## Deploy on Vercel

See [VERCEL.md](./VERCEL.md) for the native Next.js build, required storage/password environment variables, database migrations, and Vercel settings. The original Sites local workflow below is unchanged. Vercel uses a separate workspace/database.

## Login credentials

For Vercel and native Next.js, the username is **`admin`** and the password is the value you configured in **`APP_ACCESS_PASSWORD`** (at least 24 characters). There is no default password. Set it in Vercel Environment Variables and redeploy, or in ignored `.env.local` for native local development. Never put an actual password in this README. See the [root README](../README.md#login-which-id-and-password-should-i-enter) for password generation and setup.

The local Sites workflow below uses **Sign in to your workspace** with a local test identity; it does not use the Vercel password. The private hosted Site uses platform sign-in.

## Run locally

Requires Node.js 22.x (at least 22.13) and npm. From this directory:

```sh
npm ci
npm run build
npm run db:migrate
npm run dev -- --hostname 127.0.0.1
```

Open the exact URL printed by the server (normally `http://127.0.0.1:5173`). Click **Sign in to your workspace** to use the local test identity. Local sign-in is only enabled on loopback during development; it is absent from production builds.

Choose **Explore sample contract**. No API key is required for this clearly labelled sample. It contains prewritten findings, not generated AI output. Review decisions, documents, corrections, and revisions are genuinely persisted. Local data is under `.wrangler/state`; preserve that directory if you want to keep your local workspace.

### Enable real AI extraction

Copy `.dev.vars.example` to `.dev.vars`. Enter your own key locally:

```dotenv
OPENAI_API_KEY="your-key-here"
OPENAI_MODEL="gpt-4.1-mini"
```

Restart the development server. Never paste a key into chat, a contract, frontend source, or Git. `.dev.vars` is ignored. A ChatGPT URL or chat link is not an API credential. The model is configurable; your account must have access and API billing/quota.

On the private hosted Site, configure `OPENAI_API_KEY` as a **server secret** through Sites environment-variable settings (the OpenAI Developers plugin can assist with authorized provisioning). Configure `OPENAI_MODEL` separately if desired. No key is bundled in the project. Until configured, sample workflows work and real AI extraction reports an explicit setup requirement.

The integration uses the [OpenAI Responses API with structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), `store: false`, strict JSON schema, local validation, a timeout, and explicit failures. The real provider call has **not been live-tested without a user API key**. Schema, source verification, date logic, persistence, and failure paths are tested independently.

## What works

- PDF text-layer extraction with page citations; DOCX and pasted text with paragraph citations. TXT also supported.
- One contract plus an optional organizational policy per version.
- AI extraction of parties, effective date, expiry, renewal, termination/notice clauses, obligations, responsible parties, ambiguity/conflicts, and clarification questions.
- Exact quote + document + section/page + version for every item. Quote matching normalizes whitespace only. An invalid quote prevents approval.
- Explicit/uncertain evidence is separate from pending/approved/rejected review status. Approval never silently converts uncertainty into fact.
- Item editing including descriptions, responsible parties, certainty, source quote, date rule, reminder lead time, clarification, and reviewer notes.
- Immutable original extraction alongside current corrections; audit events retain before/after snapshots.
- Deterministic UTC calendar-date calculations, relative anchor dependencies, and next monthly occurrence (days 1–28). Business days or unknown conventions remain unresolved. The app never guesses holiday calendars.
- Changing a date rule/status conservatively marks other approved relative-date items stale. Dependent reminders remain provisional until anchors are approved.
- New document versions retain old originals and corrections, mark all prior approvals potentially stale, and create new pending findings. Historical versions are read-only.
- Upcoming/past dates, reminder dates, unresolved rules, review progress, search and filters.
- Reviewed summary UI and downloadable Markdown containing approved/non-stale facts, citations, uncertainty and separate pending questions. Rejected facts are excluded.
- Sites platform sign-in or Vercel single-owner password access, owner-scoped queries, cross-origin write rejection and optimistic write protection. Sites uses D1/R2; Vercel uses Turso/private Blob. Sample documents are downloadable from saved source text without Blob.
- Optional browser WebMCP read/navigation tools. They never approve or modify findings.

## Demo walkthrough

1. Load the sample contract.
2. Open **Review queue**. Select **Initial contract term ends** and approve it.
3. Select **Send notice of non-renewal**, inspect both source clauses, and approve.
4. In **Deadlines**, expiry `2026-12-31` minus 60 calendar days gives `2026-11-01`; a 7-day reminder gives `2026-10-25`.
5. Edit a finding and save for review. Inspect its original extraction and the activity history.
6. Reject another finding. It will not appear as an approved summary fact.
7. Open **Version history → Try revised sample**. The report date changes from 15 to 22 October. Previous approvals become potentially stale; all new findings start pending.
8. Inspect the historical version to see its preserved corrections and original document.
9. Download the reviewed summary.

The sample belongs to the same single-contract workspace. Use real uploads as versions of the same contract; creating a portfolio of unrelated contracts is outside this brief. Sample history remains clearly labelled if you later upload a real contract.

## Limits and explicit exclusions

- 8 MB per file on Sites or 1.5 MB per file on Vercel; 50 pages per PDF, 80,000 extracted characters across both documents, up to 100 findings per extraction.
- Text only: scanned PDFs, images, OCR, electronic signatures, payments, external calendars, email delivery and legal recommendations are not implemented.
- Reminders are dates shown on the dashboard, **not background notifications**.
- Fixed and calendar-day relative rules are supported. Event-relative rules need a known event date; unspecified conventions remain unresolved. Monthly days 29–31 need clarification. Other recurring schedules remain textual until clarified/entered as dated items.
- Quote validation establishes that the words occur in the source, not that the interpretation is correct or the extraction is complete. Human review remains necessary.
- PDF reading order can differ for complicated columns or tables; DOCX paragraph IDs are used because pagination is layout-dependent. Original downloads remain available for checking.
- Optional policy must be provided with each version; omission means that version has no policy. It is never silently inherited.
- Latest 250 audit events are displayed; all remain stored. Historical versions and originals are preserved.
- Document parsing occurs in the browser. Parsed text and original files go to your private workspace; text is sent to OpenAI for extraction when configured. No contract content or API keys are logged by application code.
- Hosted identity headers are trusted only behind the Sites dispatcher. Do not expose the built Worker directly on the public internet without an equivalent authenticated proxy.

## Checks

```sh
npm run typecheck
npm test
npm run test:api
npm run build
```

`test:api` requires the development server on loopback and uses the local test identity. It creates sample versions and review decisions, and refuses to run when real contract versions exist. Use a separate fresh checkout/local state for a clean demo. It checks missing identity, persisted versions, approval/edit/rejection, fabricated quotes, optimistic concurrency, dependent staleness, historical immutability, cross-origin requests, original download, summary filtering, and missing-key recovery. It never calls OpenAI.

The unit suite checks leap days, invalid dates, date offsets, business-day refusal, circular anchors, approved dependencies, source integrity, monthly rollover, schema constraints, summary exclusions and paragraph provenance.

## Architecture

- React + TypeScript; Vinext/Vite on Cloudflare Workers or native Next.js on Vercel.
- Sites: D1 records and R2 originals. Vercel: Turso/libSQL records and private Blob originals. Sample documents are generated from versioned database text.
- `app/page.tsx`: workspace dashboard and views.
- `components/upload-dialog.tsx`: files/pasted text and upload workflow.
- `components/review-detail.tsx`: source inspection and reviewed corrections.
- `lib/contracts/parse.ts`: PDF.js + Mammoth text extraction.
- `lib/contracts/ai.ts`: server-only extraction prompt and provider request.
- `lib/contracts/dates.ts`: deterministic scheduling; no AI dependency.
- `lib/contracts/validation.ts`: input schemas and source verification.
- `lib/contracts/summary.ts`: reviewed facts and uncertainty export.
- `app/api/*`: authenticated persistence, review and download APIs.
- `db/schema.ts`, `drizzle/`: schema and versioned migrations.
- `tests/`: domain checks and local API smoke workflow.

The PDF worker is generated by `npm ci`/`npm install` from the locked `pdfjs-dist` version. Do not mismatch worker and library versions. D1 schema changes use `npm run db:generate`; inspect generated SQL, then `npm run build && npm run db:migrate` locally. Hosted publishing applies the tracked migrations independently.
