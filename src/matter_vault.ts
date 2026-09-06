import { post } from "./infrai_rest.ts";
import { embed, EMBED_DIMENSION } from "./embedder.ts";
import { chunkDocument, type Chunk, type Matter, type MatterDocument } from "./clause_chunker.ts";

export const COLLECTION = process.env.MATTER_COLLECTION ?? "matter-vault";

/** Run once per environment before the first intake. */
export async function createVault(): Promise<void> {
  await post("/v1/vector/collection/create", {
    collection: COLLECTION,
    dimension: EMBED_DIMENSION,
    metric: "cosine",
    metadata: { purpose: "matter clauses" },
  });
}

export type Ingested = { matterId: string; documentId: string; chunks: number };

export async function ingestDocument(matter: Matter, doc: MatterDocument): Promise<Ingested> {
  const chunks: Chunk[] = chunkDocument(matter, doc);
  const vectors = (await embed(chunks.map((c) => c.text))).map((embedding, i) => ({
    id: chunks[i].id,
    embedding,
    metadata: {
      matter_id: matter.matterId,
      client: matter.client,
      practice: matter.practice,
      document_id: doc.documentId,
      title: doc.title,
      signed_at: doc.signedAt,
      clause: chunks[i].clause,
      ordinal: chunks[i].ordinal,
      text: chunks[i].text,
    },
  }));

  // Chunk ids are derived from (matter, document, ordinal), so re-running the
  // same intake writes over the same rows instead of duplicating the matter.
  await post("/v1/vector/upsert", { collection: COLLECTION, vectors });
  return { matterId: matter.matterId, documentId: doc.documentId, chunks: chunks.length };
}

export type Hit = { clause: string | null; title: string; signedAt: string | null; text: string };

type QueryResponse = { matches?: Array<{ metadata?: Record<string, unknown> }> };
type RerankResponse = { results?: Array<{ index: number }> };

/** Search one matter, then rerank the survivors against the original question. */
export async function searchMatter(matterId: string, question: string, topK = 4): Promise<Hit[]> {
  const [embedding] = await embed([question]);

  const found = await post<QueryResponse>("/v1/vector/query", {
    collection: COLLECTION,
    embedding,
    top_k: topK * 4,
    filter: { matter_id: matterId },
    include_metadata: true,
  });

  const hits: Hit[] = (found.matches ?? []).map((m) => ({
    clause: (m.metadata?.clause as string | null) ?? null,
    title: String(m.metadata?.title ?? ""),
    signedAt: (m.metadata?.signed_at as string | null) ?? null,
    text: String(m.metadata?.text ?? ""),
  }));
  if (hits.length < 2) return hits.slice(0, topK);

  const ranked = await post<RerankResponse>("/v1/ai/rerank", {
    query: question,
    candidates: hits.map((h) => h.text),
    top_k: topK,
  });

  return (ranked.results ?? []).map((r) => hits[r.index]).filter(Boolean);
}
