export type FollowUp =
  | { status: "awaiting-signature"; dueOn: null }
  | { status: "scheduled"; dueOn: string };

const DAY = 86_400_000;

/**
 * The clock starts at signature, never at intake. An unsigned document has no
 * deadline to miss, so we say so instead of inventing one. Weekend due dates
 * roll forward to Monday, because that is when someone actually files.
 */
export function scheduleFollowUp(signedAt: string | null, noticeDays: number): FollowUp {
  if (!signedAt) return { status: "awaiting-signature", dueOn: null };

  const due = new Date(Date.parse(`${signedAt.slice(0, 10)}T00:00:00Z`) + noticeDays * DAY);
  const dow = due.getUTCDay();
  if (dow === 6) due.setUTCDate(due.getUTCDate() + 2);
  if (dow === 0) due.setUTCDate(due.getUTCDate() + 1);

  return { status: "scheduled", dueOn: due.toISOString().slice(0, 10) };
}
