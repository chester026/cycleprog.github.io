/**
 * Shared domain types + zod schemas (T-2.2, docs/audit/00-AUDIT-AND-PLAN.md,
 * docs/audit/layers/04-cross-layer.md §6.1). One source of truth for shapes
 * previously redeclared per-client (9× `interface UserProfile`, 4×
 * `interface Bike` in BikeLabApp, ad-hoc `any` elsewhere) — server, web and
 * app all import from here instead.
 */
export * from './activity.js';
export * from './profile.js';
export * from './bike.js';
export * from './goal.js';
export * from './calendar.js';
export * from './event.js';
export * from './checklist.js';
export * from './training.js';
export * from './snapshot.js';
export * from './skills.js';
export * from './achievement.js';
export * from './auth.js';
export * from './ftp.js';
