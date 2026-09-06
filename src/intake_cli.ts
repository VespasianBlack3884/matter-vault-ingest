import { ingestDocument, searchMatter } from "./matter_vault.ts";
import { scheduleFollowUp } from "./followup_clock.ts";

const matter = { matterId: "M-2041", client: "Kestrel Robotics", practice: "commercial" };

const engagement = {
  documentId: "engagement-letter-v3",
  title: "Engagement Letter — Kestrel Robotics",
  signedAt: "2026-03-12",
  body: [
    "This engagement letter records the terms on which the firm acts for the client.",
    "4.1 Scope of work",
    "The firm advises on supply agreements and on the renewal of the distribution contract.",
    "9.2 Notice of termination",
    "Either party may end this engagement by giving thirty (30) days written notice to the other.",
    "12.3 Filing deadline",
    "The client must deliver the executed schedules within fourteen (14) days of signature, and the firm files them the next business day.",
  ].join("\n\n"),
};

const ingested = await ingestDocument(matter, engagement);
console.log(ingested, scheduleFollowUp(engagement.signedAt, 14));

for (const hit of await searchMatter(matter.matterId, "When must the executed schedules be filed?", 2)) {
  console.log(`clause ${hit.clause}: ${hit.text}`);
}
