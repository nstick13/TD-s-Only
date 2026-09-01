/**
 * Draft order generation — pure logic, no I/O. Produces the 48-row
 * (8 managers x 6 rounds) overall snake-draft pick order for a stage.
 * Commissioner server actions (src/app/(app)/commish/actions.ts) call
 * this and persist the result to the draft_order table.
 */

/** Minimal shape of a previous stage's standings row needed to seed a redraft. */
export interface StandingsSeed {
  manager_id: string;
  /** 1 = best (first place) ... N = worst (last place). */
  rank: number;
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 * Used only for the Week 1 / first-stage random round-1 order.
 */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Derives the round-1 (base) pick order from the previous stage's
 * standings: LAST place picks first (rank 8 -> pick 1, ... rank 1 ->
 * pick 8) — the "loser's draft" reward for a bad week. Sorts descending
 * by rank, so ties in rank fall back to stable input order.
 */
export function seedRoundOneFromStandings(
  previousStandings: StandingsSeed[],
): string[] {
  return [...previousStandings]
    .sort((a, b) => b.rank - a.rank)
    .map((s) => s.manager_id);
}

/**
 * Generates the full 48-pick overall snake draft order for a stage.
 *
 * - `previousStandings === null` (Week 1 / the very first draftable
 *   stage): the round-1 base order is a RANDOM shuffle of `managerIds`.
 * - Otherwise: the round-1 base order is seeded from `previousStandings`
 *   with last place picking first (see seedRoundOneFromStandings).
 * - Snake: round 1 = base order, round 2 = reversed, round 3 = base, ...
 *   alternating for 6 rounds total (QB/RB/RB/WR/WR/TE roster shape ->
 *   6 picks per manager). So the previous week's 1st-place manager picks
 *   8th overall (last of round 1) and then 9th overall (first of round 2)
 *   back-to-back, exactly as the "snake" name implies.
 *
 * Deterministic given inputs, except for the Week 1 random shuffle branch.
 */
export function generateDraftOrder(
  managerIds: string[],
  previousStandings: StandingsSeed[] | null,
): string[] {
  const baseOrder =
    previousStandings === null
      ? shuffle(managerIds)
      : seedRoundOneFromStandings(previousStandings);

  const managersPerRound = baseOrder.length;
  const rounds = 6;

  const picks: string[] = [];
  for (let round = 0; round < rounds; round++) {
    const roundOrder = round % 2 === 0 ? baseOrder : [...baseOrder].reverse();
    for (let i = 0; i < managersPerRound; i++) {
      picks.push(roundOrder[i]);
    }
  }
  return picks;
}
