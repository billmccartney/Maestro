/**
 * @file agentLiveness.ts
 * @description Renderer twin of `AGENT_LIVENESS_EVENTS` (src/main/utils/agent-liveness.ts).
 *
 * A renderer surface that supervises a spawned agent (the wizard's document
 * generators) needs the same answer main does to "is it still working?", and the
 * trap is the same one: for a `--print` stream-json run `data` arrives ONLY with
 * the terminal result, so a silence budget fed by `onData` alone is a hard
 * deadline. A long thinking turn produces `thinking-chunk`, `tool-execution`
 * and `usage` events the whole time and never re-arms it.
 *
 * Listeners are optional-chained because not every bridge exposes all four (the
 * web-desktop bridge and older test mocks), and a missing one must cost a
 * liveness signal, not the run.
 */

/**
 * Call `onAlive` on every proof of life from `sessionId`. Returns one cleanup
 * that removes every listener it registered.
 */
export function subscribeToAgentLiveness(sessionId: string, onAlive: () => void): () => void {
	const process = window.maestro.process;
	const forSession =
		(cb: () => void) =>
		(sid: string): void => {
			if (sid === sessionId) cb();
		};
	const cleanups = [
		process.onData?.(forSession(onAlive)),
		process.onThinkingChunk?.(forSession(onAlive)),
		process.onToolExecution?.(forSession(onAlive)),
		process.onUsage?.(forSession(onAlive)),
	];
	return () => {
		for (const cleanup of cleanups) cleanup?.();
	};
}
