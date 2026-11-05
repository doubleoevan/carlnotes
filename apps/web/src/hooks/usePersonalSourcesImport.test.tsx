import { afterEach, expect, spyOn, test } from "bun:test"
import * as personalSourcesClient from "@carlnotes/client/personalSourcesClient"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import { usePersonalSourcesImport } from "./usePersonalSourcesImport"

// the worker boundary exposes disposal and transferable input without running a browser parser
const workers: FakeWorker[] = []
class FakeWorker {
	onmessage: ((event: { data: unknown }) => void) | null = null
	onerror: (() => void) | null = null
	isTerminated = false
	transfers: Transferable[] = []
	constructor() {
		workers.push(this)
	}
	postMessage(_input: unknown, transfers: Transferable[]): void {
		this.transfers = transfers
	}
	terminate(): void {
		this.isTerminated = true
	}
}
const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker")
const cleanups: (() => Promise<void>)[] = []
const spies: { mockRestore: () => void }[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	for (const spy of spies.splice(0)) {
		spy.mockRestore()
	}
	workers.length = 0
	if (originalWorker) {
		Object.defineProperty(globalThis, "Worker", originalWorker)
	} else {
		Reflect.deleteProperty(globalThis, "Worker")
	}
})

test("cancellation retires worker replies and transfers file buffers without uploading", async () => {
	// parse a synthetic local file through the real import hook
	Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker })
	const upload = spyOn(personalSourcesClient, "sendImportConversations")
	spies.push(upload)
	const harness = await renderTestHook(() => usePersonalSourcesImport("topic"))
	cleanups.push(harness.close)
	const bytes = new ArrayBuffer(24)
	await act(async () => harness.read().parseFile({ size: 24, arrayBuffer: async () => bytes } as File))
	const worker = workers[0]
	expect(worker?.transfers).toEqual([bytes])
	await act(async () => harness.read().reset())
	expect(worker?.isTerminated).toBe(true)
	await act(async () =>
		worker?.onmessage?.({ data: { status: "ready", preview: { provider: "transcript", conversations: [] } } }),
	)
	expect(harness.read().state.status).toBe("idle")
	expect(upload).not.toHaveBeenCalled()
})

test("replacing an unresolved file never starts its stale worker", async () => {
	// replace a slow file read with pasted text before its bytes become available
	Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker })
	const pendingFile = Promise.withResolvers<ArrayBuffer>()
	const harness = await renderTestHook(() => usePersonalSourcesImport("topic"))
	cleanups.push(harness.close)
	let read: Promise<void> | undefined
	await act(async () => {
		read = harness.read().parseFile({ size: 20, arrayBuffer: () => pendingFile.promise } as File)
	})
	await act(async () => harness.read().parseText({ title: "Selected", text: "Use this instead" }))
	pendingFile.resolve(new ArrayBuffer(20))
	await act(async () => read)
	expect(workers).toHaveLength(1)
	await harness.close()
	cleanups.pop()
	expect(workers[0]?.isTerminated).toBe(true)
})
