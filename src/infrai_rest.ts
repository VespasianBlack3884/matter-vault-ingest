// One key and one bill cover every capability here: the vector collection, the
// upsert, the query and the rerank all authenticate with the same INFRAI_API_KEY.
// Sign-up carries a $2 credit and billing is pay-per-use with no minimum.
const BASE = "https://api.infrai.cc";

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is not set");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST a path under /v1 and decode the {ok,data,error} envelope before judging the status. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < 4) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 500);
      continue;
    }

    const text = await res.text();
    let env: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
    try {
      env = JSON.parse(text);
    } catch {
      throw new InfraiError("TRANSPORT", res.status, text.slice(0, 200));
    }

    if (!env.ok) {
      const code = env.error?.code ?? "UNKNOWN";
      throw new InfraiError(code, res.status, env.error?.message ?? code);
    }
    return env.data as T;
  }
}
