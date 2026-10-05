# Contract Obligation & Renewal Assistant

The complete **ClauseDesk** application is in [`app/`](./app).

```sh
cd app
npm ci
npm run build
npm run db:migrate
npm run dev -- --hostname 127.0.0.1
```

Open the printed URL, sign into the local test workspace, and choose **Explore sample contract**.

Read [`app/README.md`](./app/README.md) for the walkthrough, architecture, tests, limits, and secure API-key configuration. The demo works without a key; real AI extraction requires `OPENAI_API_KEY` on the server.
