/**
 * Tests for inlineWizardDocumentGeneration.ts - idle watchdog
 *
 * A stream-json run emits `data` only with its final result, so a generation
 * timer re-armed on data alone was a hard 20-minute deadline: a long thinking
 * turn was killed while the agent was visibly working. These tests pin that
 * thinking / tool / usage events keep the run alive, and that real silence
 * still kills it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Cb = (sessionId: string, payload?: unknown) => void;

const listeners: Record<string, Cb | null> = {
	data: null,
	exit: null,
	thinking: null,
	tool: null,
	usage: null,
};
let spawnedSessionId: string | null = null;

const capture = (key: string) =>
	vi.fn((cb: Cb) => {
		listeners[key] = cb;
		return vi.fn(() => {
			listeners[key] = null;
		});
	});

const mockMaestro = {
	agents: { get: vi.fn() },
	process: {
		spawn: vi.fn(async (config: { sessionId: string }) => {
			spawnedSessionId = config.sessionId;
		}),
		kill: vi.fn().mockResolvedValue(undefined),
		onData: capture('data'),
		onExit: capture('exit'),
		onThinkingChunk: capture('thinking'),
		onToolExecution: capture('tool'),
		onUsage: capture('usage'),
	},
	autorun: {
		watchFolder: vi.fn().mockResolvedValue({ success: true }),
		unwatchFolder: vi.fn().mockResolvedValue({ success: true }),
		onFileChanged: vi.fn(() => vi.fn()),
		listDocs: vi.fn().mockResolvedValue({ success: true, files: [], tree: [] }),
		writeDoc: vi.fn().mockResolvedValue({ success: true }),
		readDoc: vi.fn().mockResolvedValue({ success: false }),
	},
	fs: { readFile: vi.fn().mockResolvedValue('') },
};

vi.stubGlobal('window', { maestro: mockMaestro });

import { generateInlineDocuments } from '../../../renderer/services/inlineWizardDocumentGeneration';

const MINUTE = 60 * 1000;

async function startGeneration() {
	const promise = generateInlineDocuments({
		agentType: 'opencode',
		directoryPath: '/project',
		projectName: 'Test Project',
		conversationHistory: [],
		mode: 'new',
		autoRunFolderPath: '/project/.maestro/playbooks',
	});
	// Let the async setup (agent lookup, prompt load, spawn) settle.
	for (let i = 0; i < 50 && !spawnedSessionId; i++) {
		await vi.advanceTimersByTimeAsync(0);
	}
	expect(spawnedSessionId).not.toBeNull();
	return promise;
}

describe('inlineWizardDocumentGeneration - idle watchdog', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		spawnedSessionId = null;
		for (const key of Object.keys(listeners)) listeners[key] = null;
		mockMaestro.agents.get.mockResolvedValue({
			id: 'opencode',
			available: true,
			command: 'opencode',
			args: [],
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('keeps a run alive past 20 minutes while thinking, tool and usage events arrive', async () => {
		const promise = startGeneration();
		await vi.advanceTimersByTimeAsync(0);
		const sid = spawnedSessionId!;

		// An hour of work with no `data` at all, only intermediate events.
		const emitters = [listeners.thinking, listeners.tool, listeners.usage];
		for (let minute = 0; minute < 60; minute += 5) {
			await vi.advanceTimersByTimeAsync(5 * MINUTE);
			emitters[(minute / 5) % emitters.length]?.(sid, {});
		}
		expect(mockMaestro.process.kill).not.toHaveBeenCalled();

		// Events for some OTHER process must not count as proof of life.
		listeners.thinking?.('someone-else', 'hi');
		await vi.advanceTimersByTimeAsync(20 * MINUTE);
		expect(mockMaestro.process.kill).toHaveBeenCalledWith(sid);

		const result = await promise;
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/20 minutes of inactivity/);
	});

	it('disarms the watchdog and drops liveness listeners when the agent exits', async () => {
		const promise = startGeneration();
		await vi.advanceTimersByTimeAsync(0);
		const sid = spawnedSessionId!;

		listeners.exit?.(sid, 0);
		await promise;

		expect(listeners.thinking).toBeNull();
		expect(listeners.tool).toBeNull();
		expect(listeners.usage).toBeNull();
		await vi.advanceTimersByTimeAsync(60 * MINUTE);
		expect(mockMaestro.process.kill).not.toHaveBeenCalled();
	});
});
