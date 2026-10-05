# Transit — Agentic Data Migration Planner & Reconciliation Workbench

A complete local application for planning, validating and executing **one bounded migration into a mock target**. It runs independently of ClauseDesk, with no production database access or live cloud connectors.

## Run

Requires **Node.js 22.13+ (22.x or 24.x)**. There are no third-party runtime dependencies and no frontend build step.

```sh
cd migration-workbench
npm start
```

Open **http://127.0.0.1:4310**. No ID/password is required: this is a single-user development workbench, bound exclusively to loopback. It is not a public hosted app and should not be exposed through a tunnel. Existing ClauseDesk Vercel settings do not apply.

`npm run dev` restarts the server on source changes. Browser changes need a refresh. Use `PORT=4311 npm start` if the default port is occupied.

## Guided demo

1. Click **Load sample dataset**. This imports 12 fictional customers and saves a clearly labelled deterministic sample proposal. No AI call is made.
2. Inspect source/target schemas and the mapping table. Edit fields or the supported transformation chain if needed; **Save as new version** preserves the previous plan.
3. Click **Run dry run**. The default sample yields **12 source / 10 transformed / 8 accepted / 4 quarantined**. Accepted balance total is **700**.
4. Inspect the invalid age, malformed email, ambiguous date and duplicate customer ID in **Quarantined**. Each error retains original value, transformed value, source/target field, stage, rule and source row number.
5. Click **Review & approve**. Enter your reviewer name, record clarification responses/accepted risks, and confirm that you reviewed the evidence. This does **not** execute anything.
6. Click **Execute approved migration**. Eight rows are inserted into the persisted mock target atomically.
7. In **Mock target**, inspect reconciliation: `12 = 8 accepted + 4 quarantined`, target count `8`, and accepted-source numeric totals equal target totals. Row content checksums are compared too.
8. Click **Retry safely**. The existing run is reused and no duplicate rows are inserted. A retry event is appended.
9. Click **Rollback**, review the confirmation, and confirm. Only rows owned by that run are removed. Plans, approvals, validation evidence and history remain. Reconciliation now expects zero rows for that run.
10. Use **Export evidence** to download the source snapshot, all plan versions, dry runs, quarantine records, approvals, runs, target rows and audit history as JSON. Treat the export as containing your full input data.

To migrate after a rollback, save a **new plan version**, run a new dry run and approve it. A rolled-back run cannot be retried to reinsert rows.

## Import format and bounds

Use the JSON upload or pasted JSON input. See [`examples/customers.json`](./examples/customers.json) for a complete working input.

```json
{
  "source": {
    "name": "Source customers",
    "fields": [{ "name": "id", "type": "string", "required": true }]
  },
  "target": {
    "name": "Customer staging",
    "primaryKey": "id",
    "fields": [{ "name": "id", "type": "string", "required": true }]
  },
  "records": [{ "id": "C-001" }, { "id": "C-002" }]
}
```

- **One source and one target per database file; 1–1,000 records; 1–40 fields per schema.**
- Maximum input/request size: **2 MB**. Records are flat JSON objects; values are string, number, boolean or null. Text values are limited to 2,000 characters.
- Field names: unique ASCII identifiers starting with a letter, maximum 64 characters. Prototype-related names are rejected.
- Types: `string`, `integer`, `number`, `boolean`, `date`, `email`. Every field declares `required` explicitly. Supported constraints: numeric `min`/`max`, scalar `enum`.
- The target primary key must be a required string or integer. Accepted rows must have unique keys both within the sample and against existing target rows. A rejected row does not reserve a key.
- Records may have missing/invalid values; they are retained for quarantine. Undeclared fields and nested values are rejected during import.
- The input snapshot is immutable after import. Corrections to a mapping create new plans, not hidden source changes. To work with another dataset, start with a different data file as shown below.

## Supported transformations

Each target field maps to one source field or an explicit JSON scalar constant. Rules run left to right and are validated against this allowlist:

| Rule                      | Behavior                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `copy`                    | Keep the value                                                                     |
| `trim`                    | Trim text whitespace                                                               |
| `lowercase` / `uppercase` | Change text casing                                                                 |
| `to_integer`              | Parse a whole safe integer; never truncate decimals                                |
| `to_number`               | Parse a finite decimal number; no mixed text, exponent strings or currency symbols |
| `to_boolean`              | Accept true/false, yes/no, 1/0                                                     |
| `iso_date`                | Validate exact YYYY-MM-DD, including real calendar dates                           |

Null stays null through every transformation; required target fields reject it. Numeric field values are bounded to ±1,000,000,000. Totals use JavaScript numbers rounded to six decimal places; use integer minor units for exact financial samples. Business-specific conversions, currency conversion, date guessing, SQL, arbitrary scripts and custom code are deliberately unsupported.

**Count semantics:** source = input rows; transformed = rows with no transformation errors (some may still fail schema/uniqueness validation); accepted = rows passing every check; rejected/quarantined = all others. `source = accepted + rejected` always holds. Expected totals are computed from **accepted transformed source rows**, not from raw numeric strings.

## Optional real AI planner

The full sample workflow works offline. To enable real AI, create an ignored `.env` file in this folder using `.env.example` as a template:

```dotenv
PORT=4310
OPENAI_API_KEY=your_own_api_key
OPENAI_MODEL=gpt-5.4
```

Restart the app, then click **Propose with AI**. Model access and API quota are required. No existing ClauseDesk secrets are copied or committed.

The server runs an OpenAI Responses tool-calling loop with **only five provided tools**:

1. `inspect_schemas`: supplied source/target metadata.
2. `inspect_samples`: first 20 records and total sample count.
3. `inspect_transformations`: fixed allowlist and plan structure.
4. `validate_plan`: deterministic validation/dry run across **all** supplied records; returns counts, totals and up to 10 error examples.
5. `submit_plan`: accepts only the exact successfully validated plan after all inspection tools have been used.

The model cannot run shell/SQL, browse, call connectors, access arbitrary files, approve, execute or roll back. Unknown tools and invalid plans are rejected. Source values are treated as untrusted data. The server stores an inspection trace with each AI plan. Agent work has a 90-second timeout, 8 request rounds and 24-tool-call ceiling. `store: false` is sent to the provider.

Schemas, inspected records and validation error examples are sent to OpenAI only when you choose the AI action. The AI's proposal remains a draft. The deterministic sample planner is explicitly labelled and never presented as an AI result. The provider integration is tested with a mocked tool-calling conversation; a live provider request is not part of the default test suite.

Reference: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Approval, retry and rollback guarantees

- Each saved plan is immutable and fingerprinted together with the dataset. Editing an approved/rejected plan creates a new unapproved version.
- Only the latest draft may be approved. Approval references its exact plan hash and a persisted dry-run snapshot of the current target revision.
- If the target changes after approval, execution is blocked; save a new version and review a fresh dry run.
- Execution recalculates and compares dry-run evidence before inserting. All inserted rows and the audit event commit in **one SQLite transaction**.
- A second execution for the same completed plan or a retry of its run reuses the run, inserts zero rows, and appends a retry event. Across different plans, existing target primary keys are quarantined instead of duplicated.
- Optimistic workspace revision checks reject stale concurrent requests with HTTP 409.
- Rollback verifies the run-owned row checksum and removes only those rows. Repeated rollback is harmless and recorded. An old run's rollback cannot remove newer run-owned rows.
- Reconciliation compares source/accepted/quarantined counts, expected/actual run-owned target counts, numeric totals and content hashes. History is retained through rollback.

## Persistence and architecture

The app uses Node's built-in HTTP server and `node:sqlite`, with a plain JavaScript/CSS UI. No package installation, database account or cloud setup is needed.

The default file is `.data/workbench.sqlite` (Git-ignored). A serialized bounded workspace is updated under `BEGIN IMMEDIATE`; SQLite/WAL provides atomic commits and rollback on exceptions. The store keeps the dataset, all plans, dry-run row evidence, mock target, execution records and append-only application events. It is not an independently signed/tamper-proof audit log; a local file owner can alter it.

For a separate clean assignment without deleting history:

```sh
DATA_FILE=.data/another-assignment.sqlite PORT=4311 npm start
```

Keep backups of the database and export evidence before moving files. Stop the server before copying SQLite files, or use SQLite's backup tooling; WAL files can hold recent commits while running.

| File                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| `server.mjs`               | Loopback HTTP routes, bounded JSON requests, same-origin/CSRF guards       |
| `lib/engine.mjs`           | Schema/plan validation, transformations, deterministic dry run, totals     |
| `lib/store.mjs`            | Versioning, approval, atomic execution, retry, reconciliation and rollback |
| `lib/agent.mjs`            | Bounded tool-calling planner and allowlisted inspection tools              |
| `public/`                  | Responsive mapping/review/quarantine/target/history UI                     |
| `examples/customers.json`  | Fictional source, target and sample records                                |
| `tests/workbench.test.mjs` | Domain, persistence, AI-tool and HTTP integration tests                    |

## Tests

```sh
npm test
```

Tests cover malformed inputs, dates, strict numeric conversion, constraints, field evidence, counts/totals, required approval, invalidated approvals, optimistic concurrency, atomic failure, persistence across restart, duplicate retries, cross-plan duplicates, ownership-safe rollback, reconciliation, tool restrictions and HTTP access guards. They use temporary/in-memory databases and a mock AI provider; they do not mutate your workbench or spend API credits.

## Deliberate boundaries

This is a local single-user mock migration workbench, not a production migration service. No production database connections, multi-user authentication, arbitrary transformation code, distributed migration, scheduling or live cloud connectors are included. It is **not Vercel/serverless compatible** as configured: persistent local SQLite requires a persistent process/filesystem. The source/target schemas and limited transformation vocabulary are part of the assignment contract.
