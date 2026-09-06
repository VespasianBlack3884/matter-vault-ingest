import { createHash } from "node:crypto";

export type Matter = {
  matterId: string;
  client: string;
  practice: string;
};

export type MatterDocument = {
  documentId: string;
  title: string;
  signedAt: string | null;
  body: string;
};

export type Chunk = {
  id: string;
  text: string;
  clause: string | null;
  ordinal: number;
};

const CLAUSE_HEAD = /^(\d+(?:\.\d+)*)\s+\S/;
const MAX_CHARS = 900;

/**
 * Legal text is a clause tree, not prose. A numbered clause opens a new chunk
 * even when the current one is nearly empty, and a clause is only split when it
 * alone exceeds MAX_CHARS. Retrieval that hands back half of clause 12.3 is
 * worse than useless when the answer is a filing deadline.
 */
export function chunkDocument(matter: Matter, doc: MatterDocument): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let clause: string | null = null;

  const flush = () => {
    const text = buf.join("\n\n").trim();
    buf = [];
    if (!text) return;
    chunks.push({
      id: chunkId(matter.matterId, doc.documentId, chunks.length),
      text,
      clause,
      ordinal: chunks.length,
    });
  };

  for (const para of doc.body.split(/\n\s*\n/)) {
    const block = para.trim();
    if (!block) continue;
    const head = CLAUSE_HEAD.exec(block);
    if (head) {
      flush();
      clause = head[1];
    } else if (buf.join("\n\n").length + block.length > MAX_CHARS) {
      const carried: string | null = clause;
      flush();
      clause = carried;
    }
    buf.push(block);
  }
  flush();
  return chunks;
}

/** Stable across reruns, so re-ingesting a redlined document overwrites in place. */
export function chunkId(matterId: string, documentId: string, ordinal: number): string {
  return createHash("sha256")
    .update(`${matterId} ${documentId} ${ordinal}`)
    .digest("hex")
    .slice(0, 32);
}
