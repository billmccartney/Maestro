/**
 * @file idle-watchdog.ts
 * @description Main-process import site for the silence-budget watchdog.
 *
 * The implementation lives in `src/shared/idleWatchdog.ts` because the renderer
 * supervises agent runs too (the wizard's document generators) and cannot import
 * from `src/main`. Same hoist, for the same reason, as `createKeyedWriteQueue`.
 */
export { createIdleWatchdog } from '../../shared/idleWatchdog';
export type { IdleWatchdog, IdleWatchdogOptions } from '../../shared/idleWatchdog';
