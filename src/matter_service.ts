import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError } from "./infrai_rest.ts";
import { ingestDocument, searchMatter } from "./matter_vault.ts";
import { scheduleFollowUp } from "./followup_clock.ts";

const IntakeBody = z.object({
  matter: z.object({
    matterId: z.string().min(1),
    client: z.string().min(1),
    practice: z.string().min(1),
  }),
  document: z.object({
    documentId: z.string().min(1),
    title: z.string().min(1),
    signedAt: z.string().date().nullable(),
    body: z.string().min(1),
  }),
  noticeDays: z.number().int().positive().max(365).default(30),
});

const AskBody = z.object({
  matterId: z.string().min(1),
  question: z.string().min(3),
  topK: z.number().int().min(1).max(10).default(4),
});

async function readJson(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const routes: Record<string, (body: unknown) => Promise<unknown>> = {
  "POST /matters/intake": async (raw) => {
    const { matter, document, noticeDays } = IntakeBody.parse(raw);
    const ingested = await ingestDocument(
      {
        matterId: matter.matterId,
        client: matter.client,
        practice: matter.practice,
      },
      {
        documentId: document.documentId,
        title: document.title,
        signedAt: document.signedAt,
        body: document.body,
      },
    );
    return { ...ingested, followUp: scheduleFollowUp(document.signedAt, noticeDays) };
  },
  "POST /matters/ask": async (raw) => {
    const { matterId, question, topK } = AskBody.parse(raw);
    return { matterId, hits: await searchMatter(matterId, question, topK) };
  },
};

const server = createServer(async (req, res) => {
  const handler = routes[`${req.method} ${req.url}`];
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  };

  if (!handler) return send(404, { error: "no such route" });

  try {
    send(200, await handler(await readJson(req)));
  } catch (err) {
    if (err instanceof z.ZodError) return send(422, { error: "invalid body", issues: err.issues });
    // A rejected argument is an answer about the request, so it stays a 4xx for our caller.
    if (err instanceof InfraiError) return send(err.status < 500 ? 400 : 502, { error: err.code });
    send(500, { error: "internal" });
  }
});

server.listen(Number(process.env.PORT ?? 8080), () => {
  console.log(`matter service on :${process.env.PORT ?? 8080}`);
});
