// kinframe/day: "how much today" from cumulative meters (kinframe docs/plugins.md §13.1), the baseline in ctx.store.
import type { Ctx } from '../kinframe';

export interface DayTotals {
  /** Keeps the counters' values at the start of the frame's day. */
  record(values: Record<string, number | null | undefined>): void;
  /** How much each counter grew today (null where unknown). */
  since(values: Record<string, number | null | undefined>): Record<string, number | null>;
  readonly date: string | null;
}

/** Today's totals for the counters `names` (keep their order: it is the stored format), under ctx.store `key`. */
export function dayTotals(ctx: Ctx, names: string[], key?: string): DayTotals;
