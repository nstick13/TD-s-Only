/**
 * Roster shape rules. Single source of truth for how many of each position
 * a manager may hold in a given stage — mirror these values in the
 * enforce_roster_limits() trigger in
 * supabase/migrations/0001_core.sql, but do not duplicate them anywhere
 * else in application code. Import from here instead.
 */
export type Position = "QB" | "RB" | "WR" | "TE";

export const ROSTER_SHAPE: Record<Position, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
};

export const ROSTER_SIZE = Object.values(ROSTER_SHAPE).reduce(
  (sum, n) => sum + n,
  0,
); // 6

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
