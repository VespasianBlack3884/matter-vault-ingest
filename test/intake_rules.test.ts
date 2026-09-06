import test from "node:test";
import assert from "node:assert/strict";
import { chunkDocument, chunkId } from "../src/clause_chunker.ts";
import { scheduleFollowUp } from "../src/followup_clock.ts";

const matter = { matterId: "M-2041", client: "Kestrel Robotics", practice: "commercial" };

const doc = {
  documentId: "engagement-letter-v3",
  title: "Engagement Letter",
  signedAt: "2026-03-12",
  body: [
    "This engagement letter records the terms on which the firm acts.",
    "9.2 Notice of termination",
    "Either party may end this engagement by giving thirty (30) days written notice.",
    "12.3 Filing deadline",
    "The client must deliver the executed schedules within fourteen (14) days of signature.",
  ].join("\n\n"),
};

test("each numbered clause lands in its own chunk", () => {
  const chunks = chunkDocument(matter, doc);
  assert.deepEqual(chunks.map((c) => c.clause), [null, "9.2", "12.3"]);
  assert.match(chunks[2].text, /fourteen \(14\) days/);
  assert.ok(!chunks[1].text.includes("Filing deadline"));
});

test("re-ingesting the same document reuses the same chunk ids", () => {
  const first = chunkDocument(matter, doc).map((c) => c.id);
  const again = chunkDocument(matter, { ...doc, signedAt: "2026-04-01" }).map((c) => c.id);
  assert.deepEqual(first, again);
  assert.equal(first[0], chunkId(matter.matterId, doc.documentId, 0));
  assert.notEqual(first[0], chunkId("M-9999", doc.documentId, 0));
});

test("the follow-up clock starts at signature and skips the weekend", () => {
  assert.deepEqual(scheduleFollowUp("2026-03-12", 14), { status: "scheduled", dueOn: "2026-03-26" });
  // 14 March + 14 days is Saturday 28 March, so the task lands on Monday the 30th.
  assert.deepEqual(scheduleFollowUp("2026-03-14", 14), { status: "scheduled", dueOn: "2026-03-30" });
  assert.deepEqual(scheduleFollowUp(null, 14), { status: "awaiting-signature", dueOn: null });
});
