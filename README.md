# FastHook for n8n

Repository: [alencmanis/fasthook-n8n](https://github.com/alencmanis/fasthook-n8n). The npm package name is `n8n-nodes-fasthook`, following n8n's community-node naming convention.

Use [FastHook](https://www.fasthook.io) requests, delivery traces and replay in [n8n](https://n8n.io/). This package integrates FastHook itself, not the unrelated apps in its catalog.

**Status: local development preview.** Not published to npm or approved for n8n Cloud. The package is marked private until release prerequisites are complete.

## Installation

Use Node.js 24 and npm:

```sh
npm ci
npm run build
npm test
npm run lint
npm run dev -- --custom-user-folder ../.tmp-n8n-fasthook-dev
```

The official n8n CLI starts a local development instance with this package loaded. Keep its user-data folder outside the package to avoid a circular directory junction during build. After npm publication, self-hosted owners can install `n8n-nodes-fasthook` in Settings > Community Nodes. Cloud availability requires n8n verification.

## Credentials

Create a project API key in FastHook Settings > API keys and select it in the **FastHook API** credential. Keys start with `fhp_`; do not use a Dashboard session token.

- `control:read`: reads, credential test and polling.
- `control:execute`: additionally required for Replay, Retry Delivery and Run Now, together with the matching explicit execute grant: `POST:/v1/requests/:id/retry`, `POST:/v1/events/:id/retry`, or `POST:/v1/sources/:id/run` respectively.
- `tunnel:connect`: not needed.

The key belongs to one project. n8n encrypts stored credentials. API requests use HTTPS to api.fasthook.io with a Bearer header; redirects are disabled. The credential test reads one request's metadata.

## Operations

| Resource | Operations                       |
| -------- | -------------------------------- |
| Request  | Get, Get Many, Get Trace, Replay |
| Event    | Get, Get Many, Retry Delivery    |
| Attempt  | Get, Get Many                    |
| Source   | Run Now (polling sources only)   |

Get Many returns one item per result, supports a time range, filters and a limit or Return All. Request payloads are opt-in. Pagination stops with an error after 100 pages, or if FastHook reports an incomplete page, rather than silently truncating results.

Replay reprocesses an existing request unchanged. Retry Delivery queues another delivery attempt. Both can repeat external actions. Queue acceptance is not proof of delivery: inspect the request trace or attempts. Writes are not automatically retried. After a timeout, check FastHook before repeating a write. n8n's own Retry On Fail setting can repeat writes; leave it off unless intended.

IDs come from the FastHook dashboard. Source configuration listing, workflow administration and connection administration require Dashboard sessions and are deliberately not exposed by this project-key node.

## Trigger: New Request

The trigger polls accepted requests, optionally restricted to a Source ID. Otherwise it listens to the key's whole project. Use n8n Poll Times to set the interval.

- The first production poll authenticates and initializes state without emitting history.
- Subsequent polls emit new requests oldest first, including their stored payload in `data`.
- A five-minute overlap catches delayed indexing and filters already-seen IDs.
- Manual tests return the latest real accepted request from the last 24 hours without changing production state. If none exists, send a test webhook to FastHook; no fabricated event is generated.
- Changing the selected credential or source resets state. Editing a credential in place to point to a different project requires a fresh trigger node.
- Failed/partial pages do not advance state. If more than 100 pages accumulate, narrow the source or poll more frequently.
- This is polling, not instant delivery. Requests indexed over five minutes late can be missed. Use the request `id` for downstream idempotency: restarts, failed runs and manual retries can repeat data. Exactly-once processing is not promised.
- Pausing stops polling; resuming retains state and may catch up within FastHook retention and page limits.

## Usage

Import [examples/new-request-trace.json](examples/new-request-trace.json) and select your credential on both nodes. It starts inactive and only reads request/trace data. Add a notification node if desired. Map `{{$json.id}}` for the request ID and inspect `{{$json.data}}` for the payload.

When running with the official CLI's local custom-node loader, import [test/fixtures/new-request-trace.dev.json](test/fixtures/new-request-trace.dev.json) instead. That loader registers node types under `CUSTOM`; the public example uses the installed package namespace `n8n-nodes-fasthook`. Select credentials and an isolated test Source ID before enabling the example. These are two loading modes for the same node code.

## Compatibility

Built against n8n-workflow 2.16.0 with the official @n8n/node-cli 0.55.2. Runtime code has no external dependencies beyond n8n's workflow peer API and no filesystem or environment access. The programmatic implementation coordinates cursor requests and incomplete-page checks with polling state.

Local tests cover routing, item linking, safe errors, pagination and polling. An authenticated run on n8n 2.45.6 verified credential storage, New Request polling, Get Delivery Trace, deduplication and stopping after unpublishing; see [the test record](test/REAL-TEST-2026-10-29.md) for evidence and remaining coverage. See [RELEASE.md](RELEASE.md) for publication prerequisites. MIT licensed.
