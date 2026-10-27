// kinframe/series: a short history of a live value (kinframe docs/plugins.md §13.1), kept in ctx.state.
import type { Ctx } from '../kinframe';

export interface Series {
  readonly count: number;
  /** A reading at `time` (epoch ms); readings within one step are averaged. */
  add(value: number, time: number): void;
  last(): number | null;
  trend(options?: { window?: number; ratio?: number; min?: number }): 'up' | 'down' | null;
  /** A sparkline's points over `spanMs` (default an hour) in `n` buckets (default 96); null where there was no reading. */
  buckets(spanMs?: number, n?: number): (number | null)[];
}

export function series(ctx: Ctx, name: string, options?: { stepMs?: number; samples?: number }): Series;
