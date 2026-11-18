import { expect, test } from "bun:test"
import { withTopicVideoSlot } from "./topicVideoSlot"

test("a queued rebuild waits on the same film slot, an aborted waiter leaves it, and a failure releases it", async () => {
	const started = Promise.withResolvers<void>(),
		release = Promise.withResolvers<void>()
	const first = withTopicVideoSlot(undefined, async () => {
		started.resolve()
		await release.promise
		throw Error("capture failed")
	})
	const failure = first.catch((error: Error) => error.message)
	await started.promise
	const abort = new AbortController()
	let entered = false
	const waiting = withTopicVideoSlot(abort.signal, async () => {
		entered = true
	})
	const cancelled = waiting.catch((error: Error) => error.name)
	abort.abort()
	expect(await cancelled).toBe("AbortError")
	expect(entered).toBe(false)
	const rebuild = withTopicVideoSlot(undefined, async () => {
		entered = true
	})
	expect(entered).toBe(false)
	release.resolve()
	expect(await failure).toBe("capture failed")
	await rebuild
	expect(entered).toBe(true)
})
