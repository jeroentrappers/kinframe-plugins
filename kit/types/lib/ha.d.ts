// kinframe/ha: a Home Assistant connection (kinframe docs/plugins.md §13.1). Settings base_url (url, local_only) and
// token (secret); permissions http and websocket on settings.base_url.
import type { Ctx, HttpResponse } from '../kinframe';

export interface Entity { state: string; attributes: Record<string, any>; updated: number; missing?: undefined }
export interface MissingEntity { missing: true }
export interface Connection { base: string; entities: Record<string, Entity | MissingEntity>; live: boolean; error: string | null; nextId: number }

export function baseUrl(s: string): string;
export function connection(ctx: Ctx): Connection;
export function entities(ctx: Ctx): Record<string, Entity | MissingEntity>;
export function isLive(ctx: Ctx): boolean;
/** base_url and token are set. */
export function configured(ctx: Ctx): boolean;
export function applyEvent(entities: Record<string, Entity | MissingEntity>, ev: any): void;
/** WebSocket: auth, subscribe_entities for ids, every event applied and ctx.invalidate(). Call in start. */
export function subscribe(ctx: Ctx, ids: string[]): void;
/** REST, one GET per entity (always). */
export function poll(ctx: Ctx, ids: string[]): Promise<void>;
/** REST, one GET per entity, only while the WebSocket isn't live. Call in update. */
export function refresh(ctx: Ctx, ids: string[]): Promise<void>;
/** Throws the plugin's token_refused text once Home Assistant refused the token. */
export function requireToken(ctx: Ctx): void;
/** POST /api/services/<domain>/<service>, for actions. */
export function callService(ctx: Ctx, domain: string, service: string, data?: Record<string, unknown>): Promise<HttpResponse>;
