// the fixtures the poll tests share: the wait for awaited reads to settle, and the fake clock's advance by poll intervals
import { jest } from "bun:test"

/**
 * Lets the awaited reads settle by flushing ten microtasks.
 */
export async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve()
	}
}

/**
 * Advances the fake clock one poll interval at a time, so each read settles before the next.
 */
export async function advancePolls({ pollMs, pollCount }: { pollMs: number; pollCount: number }): Promise<void> {
	for (let i = 0; i < pollCount; i++) {
		jest.advanceTimersByTime(pollMs)
		await settle()
	}
}
