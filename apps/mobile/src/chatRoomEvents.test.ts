import { afterEach, expect, test } from "bun:test"
import { openChatRoomEvents } from "./chatRoomEvents"

// the real event stream library uses a test request implementation
const originalXmlHttpRequestDescriptor = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest")
const requests: TestRequest[] = []
const cleanups: (() => void)[] = []
afterEach(() => {
	for (const close of cleanups.splice(0)) {
		close()
	}
	requests.length = 0
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
	const request = requests[0]
	expect(request?.url).toEndWith("after=7")
	expect(request?.headers.Cookie).toBe("test-session")
	expect(request?.headers["X-Client-Platform"]).toBe("ios")
	expect(request?.headers.Accept).toBe("text/event-stream")
	request?.respond({ readyState: 3, text: 'event: message\nid: 8\ndata: {"id":8}\n\n' })
	expect(openCount).toBe(1)
	expect(messageCount).toBe(1)
	expect(endCount).toBe(0)
	request?.respond({ readyState: 4, text: 'event: message\nid: 8\ndata: {"id":8}\n\n' })
	expect(endCount).toBe(1)
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(requests).toHaveLength(1)
})

test("retired native callbacks cannot sign out another account and close aborts the request", async () => {
	Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: TestRequest })
	let isCurrent = true
	let revocationCount = 0
	const close = openChatRoomEvents({
		url: "https://example.test/events",
		headers: {},
		isCurrent: () => isCurrent,
		onUnauthorized: () => {
			revocationCount += 1
		},
		events: { onOpen: () => {}, onMessage: () => {}, onToolCalls: () => {}, onPing: () => {}, onError: () => {} },
	})
	cleanups.push(close)
	await waitForRequest()
	isCurrent = false
	requests[0]?.respond({ readyState: 4, text: "private response", status: 401 })
	expect(revocationCount).toBe(0)
	close()
	expect(requests[0]?.isAborted).toBe(true)
})

// each request has the lifecycle the external SSE library owns
class TestRequest {
	static LOADING = 3
	static DONE = 4
	headers: Record<string, string> = {}
	url = ""
	status = 0
	readyState = 0
	responseText = ""
	isAborted = false
	onreadystatechange: (() => void) | null = null
	open(_method: string, url: string): void {
		this.url = url
	}
	setRequestHeader(key: string, value: string): void {
		this.headers[key] = value
	}
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
async function waitForRequest(): Promise<void> {
	const deadline = Date.now() + 2000
	while (!requests.length) {
		if (Date.now() > deadline) {
			throw new Error("native SSE did not open")
		}
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
}
