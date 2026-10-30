import { afterEach, expect, test } from "bun:test"
import { openChatRoomEvents } from "./chatRoomEvents"

// the real event stream library uses a test request implementation
const originalXmlHttpRequestDescriptor = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest")
const requests: TestRequest[] = []
const cleanups: (() => void)[] = []
afterEach(() => {
	// close every stream a test opened, then put the real request class back
	for (const close of cleanups.splice(0)) {
		close()
	}
	requests.length = 0

	// the real request class, or none where the runtime had none
	if (originalXmlHttpRequestDescriptor) {
		Object.defineProperty(globalThis, "XMLHttpRequest", originalXmlHttpRequestDescriptor)
	} else {
		Reflect.deleteProperty(globalThis, "XMLHttpRequest")
	}
})

test("native SSE sends session/device headers and reports EOF without its own reconnect", async () => {
	Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: TestRequest })
	let openCount = 0
	let messageCount = 0
	let endCount = 0
	cleanups.push(
		openChatRoomEvents({
			url: "https://example.test/api/teams/team/room/events?after=7",
			headers: { Cookie: "test-session", "X-Client-Platform": "ios" },
			isCurrent: () => true,
			onUnauthorized: () => {},
			onAppVersionOutdated: () => {},
			events: {
				onOpen: () => {
					openCount += 1
				},
				onMessage: () => {
					messageCount += 1
				},
				onToolCalls: () => {},
				onPing: () => {},
				onError: () => {
					endCount += 1
				},
			},
		}),
	)
	await waitForRequest()

	// the request went out with the session and device headers
	const request = requests[0]
	expect(request?.url).toEndWith("after=7")
	expect(request?.headers.Cookie).toBe("test-session")
	expect(request?.headers["X-Client-Platform"]).toBe("ios")
	expect(request?.headers.Accept).toBe("text/event-stream")

	// a message arrives while the request is open
	request?.respond({ readyState: 3, text: 'event: message\nid: 8\ndata: {"id":8}\n\n' })
	expect(openCount).toBe(1)
	expect(messageCount).toBe(1)
	expect(endCount).toBe(0)

	// the end of the request is reported once, and the library opens no second request
	request?.respond({ readyState: 4, text: 'event: message\nid: 8\ndata: {"id":8}\n\n' })
	expect(endCount).toBe(1)
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(requests).toHaveLength(1)
})

test("retired native callbacks cannot sign out another account and close aborts the request", async () => {
	Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: TestRequest })

	// a stream whose chat changes before its 401 arrives
	let isCurrent = true
	let revocationCount = 0
	const close = openChatRoomEvents({
		url: "https://example.test/events",
		headers: {},
		isCurrent: () => isCurrent,
		onUnauthorized: () => {
			revocationCount += 1
		},
		onAppVersionOutdated: () => {},
		events: { onOpen: () => {}, onMessage: () => {}, onToolCalls: () => {}, onPing: () => {}, onError: () => {} },
	})
	cleanups.push(close)
	await waitForRequest()

	// the retired callback signs nothing out, and close aborts the request
	isCurrent = false
	requests[0]?.respond({ readyState: 4, text: "private response", status: 401 })
	expect(revocationCount).toBe(0)
	close()
	expect(requests[0]?.isAborted).toBe(true)
})

test("a 426 on the stream opens the update notice and ends the stream", async () => {
	Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: TestRequest })
	let outdatedCount = 0
	let errorStatus: number | undefined

	// a stream whose only response is a 426
	cleanups.push(
		openChatRoomEvents({
			url: "https://example.test/events",
			headers: {},
			isCurrent: () => true,
			onUnauthorized: () => {},
			onAppVersionOutdated: () => {
				outdatedCount += 1
			},
			events: {
				onOpen: () => {},
				onMessage: () => {},
				onToolCalls: () => {},
				onPing: () => {},
				onError: (status) => {
					errorStatus = status
				},
			},
		}),
	)
	await waitForRequest()

	// the notice opened once and the stream reported the status
	requests[0]?.respond({ readyState: 4, text: "", status: 426 })
	expect(outdatedCount).toBe(1)
	expect(errorStatus).toBe(426)
})

// each request has the lifecycle the external SSE library owns
class TestRequest {
	// the ready states the library reads, and what the request recorded
	static LOADING = 3
	static DONE = 4
	headers: Record<string, string> = {}
	url = ""
	// the response the test applies
	status = 0
	readyState = 0
	responseText = ""
	isAborted = false
	onreadystatechange: (() => void) | null = null
	// the lifecycle calls the library makes
	open(_method: string, url: string): void {
		this.url = url
	}
	setRequestHeader(key: string, value: string): void {
		this.headers[key] = value
	}
	// the send and the abort the library makes, and the response a test applies
	send(): void {
		requests.push(this)
	}
	abort(): void {
		this.isAborted = true
	}
	respond({ readyState, text, status = 200 }: { readyState: number; text: string; status?: number }): void {
		// apply the simulated response
		this.readyState = readyState
		this.status = status
		this.responseText = text
		this.onreadystatechange?.()
	}
}

// wait up to two seconds for the library to open its request
async function waitForRequest(): Promise<void> {
	// poll every five milliseconds until the deadline
	const deadline = Date.now() + 2000
	while (!requests.length) {
		if (Date.now() > deadline) {
			throw new Error("native SSE did not open")
		}
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
}
