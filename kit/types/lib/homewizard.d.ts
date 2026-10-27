// kinframe/homewizard: a HomeWizard device's local API (kinframe docs/plugins.md §13.1). Setting host; permission
// http on settings.host, local_only. A non-2xx answer throws "HTTP <status>".
import type { Ctx } from '../kinframe';

export function baseUrl(host: string): string;
export function configured(ctx: Ctx): boolean;
/** GET /api/v1/data */
export function data(ctx: Ctx): Promise<Record<string, any>>;
/** GET /api */
export function device(ctx: Ctx): Promise<Record<string, any>>;
/** GET /api/v1/state (energy sockets) */
export function state(ctx: Ctx): Promise<Record<string, any>>;
/** PUT /api/v1/state (energy sockets) */
export function setState(ctx: Ctx, patch: Record<string, unknown>): Promise<Record<string, any>>;
/** A number from the flat JSON, or null when missing or not a number. */
export function number(o: Record<string, any> | null | undefined, key: string): number | null;
/** A kWh total, or the sum of the tariff registers on older firmware. */
export function total(o: Record<string, any> | null | undefined, prefix: string): number | null;
export function phases(o: Record<string, any> | null | undefined): any;
