// Expo push tests: the chunk size, the access token on each send, the receipts read in chunks, and which failures
// may be sent again
import { afterEach, expect, spyOn, test } from "bun:test"
import { gunzipSync } from "node:zlib"
import { chunkPushMessages, isRetryablePushServiceError, readPushReceipts, sendPushMessageChunk } from "./expoPush"
import { saveEnvSettings } from "./savedEnvSettings"

// the access token as the environment had it, restored after each test
const restoreEnvSettings = saveEnvSettings(["EXPO_PUSH_ACCESS_TOKEN"])
afterEach(() => {
	restoreEnvSettings()
})

// a message to one test token
function toPushMessage(index: number): { to: string; body: string } {
	return { to: `ExponentPushToken[token-${index}]`, body: "2 new findings" }
}

// 250 messages split at the service's limit of 100
test("messages are chunked at 100 per send request", () => {
	const messageChunks = chunkPushMessages(Array.from({ length: 250 }, (_, index) => toPushMessage(index)))
	expect(messageChunks.map((messageChunk) => messageChunk.length)).toEqual([100, 100, 50])
})

// a send names the access token, and returns the tickets in the messages' order
test("a chunk sends with the access token and returns its tickets", async () => {
	// the service accepts the first message and rejects the second
	process.env.EXPO_PUSH_ACCESS_TOKEN = "expo-push-access-token"
	const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({
			data: [
				{ status: "ok", id: "ticket-1" },
				{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
			],
		}),
	)

	// the tickets come back in order, and the request authenticates
	const pushTickets = await sendPushMessageChunk([toPushMessage(1), toPushMessage(2)])
	expect(pushTickets.map((pushTicket) => pushTicket.status)).toEqual(["ok", "error"])
	const requestHeaders = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers)
	expect(requestHeaders.get("authorization")).toBe("Bearer expo-push-access-token")
	fetchSpy.mockRestore()
})

// receipts for 400 tickets are read in two requests and merged by ticket id
test("receipts are read in chunks and merged", async () => {
	// each request, gzipped by the SDK for its size, returns an ok receipt for the first id it asked for
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init?: RequestInit) => {
		const { ids } = JSON.parse(gunzipSync(init?.body as Buffer).toString()) as { ids: string[] }
		return Response.json({ data: { [ids[0] ?? ""]: { status: "ok" } } })
	}) as unknown as typeof fetch)

	// two requests, one receipt from each
	const ticketIds = Array.from({ length: 400 }, (_, index) => `ticket-${index}`)
	const pushReceipts = await readPushReceipts(ticketIds)
	expect(fetchSpy).toHaveBeenCalledTimes(2)
	expect([...pushReceipts.keys()]).toEqual(["ticket-0", "ticket-300"])
	fetchSpy.mockRestore()
})

// a rate limit, a server error, and no response may succeed later, and a rejected request may not
test("only a rate limit, a server error, or no response is retryable", () => {
	expect(isRetryablePushServiceError({ statusCode: 429 })).toBe(true)
	expect(isRetryablePushServiceError({ statusCode: 503 })).toBe(true)
	expect(isRetryablePushServiceError(new Error("socket hang up"))).toBe(true)
	expect(isRetryablePushServiceError({ statusCode: 400 })).toBe(false)
	expect(isRetryablePushServiceError({ statusCode: 401 })).toBe(false)
})
