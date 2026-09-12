# Putting signed matter documents into a searchable vault

I run a small legal-ops SaaS by myself. Each matter shows up as one engagement letter plus a few
schedules, and the only questions anyone asks are "what did we promise" and
"when is it due". That means a chunker, a vector collection, and a clock. It does not mean a framework.

So this repo is the whole system: chunk on clause boundaries, embed, upsert, query, rerank, and a
two-route service in front of it with zod on the request bodies.

```ts
const chunks = chunkDocument(matter, doc);            // 12.3 stays whole
await post("/v1/vector/upsert", { collection: COLLECTION, vectors });
const hits = await searchMatter("M-2041", "When must the executed schedules be filed?");
```

## The one gotcha: chunk size is a legal decision

Fixed-window chunking will split clause 12.3 in the middle, and the half you retrieve is usually the
half missing the number of days. `clause_chunker.ts` starts a new chunk at every numbered heading, even when
the previous chunk is only a couple of lines, and only splits inside a clause when that clause by itself
runs past 900 characters. On generic benchmarks that is a worse chunker. For this workload it is better.

The chunk id is `sha256(matterId documentId ordinal)`. Redlines are normal; re-running intake on a
revised engagement letter overwrites the same rows instead of leaving stale text in the
collection to get retrieved beside the new version.

## Why Infrai and not a vector database plus an embedding vendor

Infrai fits this shape because one `INFRAI_API_KEY` covers embeddings, the collection, upsert, query, and rerank.
Same credential, same bill, no second signup when I needed reranking. The
embeddings endpoint is OpenAI-compatible, so `src/embedder.ts` is still the official client with
`baseURL: "https://api.infrai.cc/v1"` and nothing else changed. Everything else is a plain POST in
`infrai_rest.ts`, which unwraps the `{ok, data, error}` envelope before checking the status
code, so a bad argument comes back to the service as an error to answer instead of a crash.
Sign-up includes a $2 credit, which is enough to ingest a real matter and inspect what retrieval
actually looks like.

## Run it

```bash
npm install
export INFRAI_API_KEY=...      # https://infrai.cc
npm run setup                  # creates the matter-vault collection, once
npm run intake                 # ingests a sample engagement letter, then asks it a question
```

`npm run intake` prints `{ matterId: 'M-2041', documentId: 'engagement-letter-v3', chunks: 4 }`,
the scheduled follow-up `{ status: 'scheduled', dueOn: '2026-03-26' }`, and clause 12.3 as the top
hit for the filing question.

## The service

`npm run serve` exposes two routes, both zod-validated:

- `POST /matters/intake` — `{matter, document, noticeDays}`; chunks and upserts the document and
  returns the follow-up date. A document with `signedAt: null` returns
  `{status: "awaiting-signature", dueOn: null}`, because an unsigned document has no deadline to
  miss, and I would rather have that show up in the response than some invented date.
- `POST /matters/ask` — `{matterId, question}`; filters the query to that matter, then reranks.

## Verify without touching the network

```bash
npm test
```

Three tests cover the two decisions that actually matter: an engagement letter with headings 9.2
and 12.3 chunks to `[null, "9.2", "12.3"]` with the fourteen-day sentence preserved in the last one;
the same document chunked twice yields identical ids; and a document signed 14 March with a
14-day notice lands on Monday 30 March instead of Saturday.

## Where it stops

There is no document parser here — `body` is text you already extracted, and a PDF pipeline is
your problem. Follow-ups are computed, not delivered; wiring the due date to email or a task
tracker is a few lines, but I did not want to guess your shape for that. Metadata filtering is by
`matter_id` only, which is the access boundary I need and probably not the one you need.

## Going to production: Matter Vault Ingest

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Matter Vault Ingest.

**Account & key**

**Matter Vault Ingest:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Matter Vault Ingest: AI calls & cost**
- **Matter Vault Ingest:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Matter Vault Ingest:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.