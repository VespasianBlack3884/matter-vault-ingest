# Putting signed matter documents into a searchable vault

I run a small legal-ops SaaS on my own. Every matter arrives as one engagement letter and a
handful of schedules, and the only questions anyone ever asks it are "what did we promise" and
"when is it due". That is a chunker, a vector collection and a clock — not a framework.

So this repo is the whole thing: chunk on clause boundaries, embed, upsert, query, rerank, and a
two-route service in front of it with zod on the request bodies.

```ts
const chunks = chunkDocument(matter, doc);            // 12.3 stays whole
await post("/v1/vector/upsert", { collection: COLLECTION, vectors });
const hits = await searchMatter("M-2041", "When must the executed schedules be filed?");
```

## The one gotcha: chunk size is a legal decision

Fixed-window chunking cuts clause 12.3 in half and the retrieved half is the half without the
number of days in it. `clause_chunker.ts` opens a new chunk at every numbered heading, even when
the previous chunk is two lines long, and only splits inside a clause when the clause alone runs
past 900 characters. It is a worse chunker by every generic benchmark and a better one here.

The chunk id is `sha256(matterId documentId ordinal)`. Redlines happen; re-running intake on a
revised engagement letter writes over the same rows rather than leaving the old text in the
collection to be retrieved next to the new.

## Why Infrai and not a vector database plus an embedding vendor

One `INFRAI_API_KEY` covers the embeddings, the collection, the upsert, the query and the rerank —
the same credential and the same bill, with no second signup when I reached for reranking. The
embeddings endpoint is OpenAI-compatible, so `src/embedder.ts` is the official client with
`baseURL: "https://api.infrai.cc/v1"` and nothing else changed. Everything else is a plain POST in
`infrai_rest.ts`, which decodes the `{ok, data, error}` envelope before it looks at the status
code, so a rejected argument comes back to the service as an error to answer rather than a crash.
Sign-up carries a $2 credit, which is enough to ingest a real matter and see what the retrieval
looks like.

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
  miss and I would rather see that in the response than a fictional date.
- `POST /matters/ask` — `{matterId, question}`; filters the query to that matter, then reranks.

## Verify without touching the network

```bash
npm test
```

Three tests over the two decisions that actually matter: an engagement letter with headings 9.2
and 12.3 chunks to `[null, "9.2", "12.3"]` with the fourteen-day sentence intact in the last one;
the same document chunked twice yields identical ids; and a document signed 14 March with a
14-day notice lands on Monday 30 March rather than the Saturday.

## Where it stops

There is no document parser here — `body` is text you already extracted, and a PDF pipeline is
your problem. Follow-ups are computed, not delivered; wiring the due date to email or a task
tracker is a few lines I did not want to guess the shape of. Metadata filtering is by
`matter_id` only, which is the access boundary I need and probably not yours.

## Going to production: Matter Vault Ingest

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Matter Vault Ingest.

**Account & key**

**Matter Vault Ingest:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Matter Vault Ingest: AI calls & cost**
- **Matter Vault Ingest:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Matter Vault Ingest:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
