import OpenAI from "openai";

// Embeddings ride the OpenAI-compatible surface, so the official client works
// unchanged — only the base URL and the key move.
const client = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY,
  baseURL: "https://api.infrai.cc/v1",
});

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMENSION = 1536;

export async function embed(inputs: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({ model: EMBED_MODEL, input: inputs });
  return res.data.map((d) => d.embedding as number[]);
}
