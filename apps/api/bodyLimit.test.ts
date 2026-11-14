// body admission tests: a large body waits its turn before it is read, the bytes in progress stay within their limit, a
// small body never waits, a chunked body counts as the route's limit, a body past the limit goes on to its rejection
// unread, a body whose turn does not come is busy, a user's large bodies are read one at a time, and a body's bytes
// are released however its response ends
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { toBodyAdmission, toBodyLimit } from "./bodyLimit"
import type { AppEnv } from "./currentUser"

// put the spied console back after each test
afterEach(() => {
	mock.restore()
})

// the admission the cases run under: a body past 100 bytes is large, a body past 1,000 is rejected, and at most 500
// bytes of large bodies are in progress
const BODY_ADMISSION = { maxBodyBytes: 1000, largeBodyBytes: 100, maxBytesInProgress: 500 }

// how long a case waits before it reads whether a post is still waiting
const WAIT_MS = 10

// an app under the admission, with what the cases read of it
type AdmissionApp = {
	app: Hono<AppEnv>
	// the most bytes of read bodies whose replies had not ended, at any moment
	toMostBytesInProgress: () => number
	// let every reply that waits on the reply gate end
	openReplyGate: () => void
	// let every route that works behind the work gate respond
	openWorkGate: () => void
}

// an app whose posts run under one admission and the limit, each as the user its x-user header names, if any. the
// reply route reads its body and streams a reply, which waits for the cases to open the reply gate if
// shouldRepliesWait is set. the work route reads its body and responds once the cases open the work gate. the other
// routes read their body and fail with an error, fail with a value that is no error, or respond with no body. waitMs
// is how long a large body waits its turn
function toAdmissionApp({ shouldRepliesWait = false, waitMs = 5_000 } = {}): AdmissionApp {
	// the bytes of the bodies read whose replies have not ended, and the gate the replies wait on
	let bytesInProgress = 0
	let mostBytesInProgress = 0
	const replyGate = Promise.withResolvers<void>()
	const workGate = Promise.withResolvers<void>()
	if (!shouldRepliesWait) {
		replyGate.resolve()
	}

	// one admission and one limit for every route, with a 503 for a body whose turn does not come
	const bodyAdmission = toBodyAdmission({ ...BODY_ADMISSION, waitMs })((context) =>
		context.json({ error: "busy" }, 503),
	)
	const bodyLimit = toBodyLimit(BODY_ADMISSION.maxBodyBytes)
	const app = new Hono<AppEnv>()
		// sign the request in as the user its header names
		.use(async (context, next) => {
			const userId = context.req.header("x-user")
			if (userId) {
				context.set("user", { id: userId } as AppEnv["Variables"]["user"])
			}
			await next()
		})
		// read the body, then respond once the work gate is open
		.post("/work", bodyAdmission, bodyLimit, async (context) => {
			await context.req.text()
			await workGate.promise
			return context.text("worked")
		})
		.post("/reply", bodyAdmission, bodyLimit, async (context) => {
			// read the body and count its bytes as in progress
			const bodyBytes = (await context.req.text()).length
			bytesInProgress += bodyBytes
			mostBytesInProgress = Math.max(mostBytesInProgress, bytesInProgress)

			// reply once the gate is open, and count the bytes out at the reply's end
			return stream(context, async (replyStream) => {
				await replyGate.promise
				await replyStream.write(`read ${bodyBytes}`)
				bytesInProgress -= bodyBytes
			})
		})
		// read the body, then fail with an error
		.post("/error", bodyAdmission, bodyLimit, async (context) => {
			await context.req.text()
			throw new Error("the handler failed")
		})
		// read the body, then fail with a value that is no error
		.post("/thrown-value", bodyAdmission, bodyLimit, async (context) => {
			await context.req.text()
			throw "the handler threw a value"
		})
		// read the body, then respond with no body
		.post("/no-body", bodyAdmission, bodyLimit, async (context) => {
			await context.req.text()
			return context.body(null, 204)
		})
	return {
		app,
		toMostBytesInProgress: () => mostBytesInProgress,
		openReplyGate: () => replyGate.resolve(),
		openWorkGate: () => workGate.resolve(),
	}
}

// a post of the given number of bytes that declares its content length, as a request on the wire does, signed in as
// the user if one is given
function toDeclaredPost(bodyBytes: number, path = "/reply", signal?: AbortSignal, userId?: string): Request {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-length": String(bodyBytes), ...(userId ? { "x-user": userId } : {}) },
		body: "x".repeat(bodyBytes),
		signal,
	})
}

// a post of the given number of bytes that declares a chunked body in place of a content length
function toChunkedPost(bodyBytes: number): Request {
	return new Request("http://localhost/reply", {
		method: "POST",
		headers: { "transfer-encoding": "chunked" },
		body: "x".repeat(bodyBytes),
	})
}

// whether a post's body is still unread after a moment
async function isStillWaiting(post: Request): Promise<boolean> {
	await Bun.sleep(WAIT_MS)
	return !post.bodyUsed
}

// ten bodies of 200 bytes fit two at a time in 500 bytes, and none is rejected for the wait
test("large bodies at once are read within the bytes in progress limit, and every one gets its reply", async () => {
	const { app, toMostBytesInProgress } = toAdmissionApp()
	const replies = await Promise.all(
		Array.from({ length: 10 }, async () => {
			const response = await app.request(toDeclaredPost(200))
			return `${response.status} ${await response.text()}`
		}),
	)
	expect(replies).toEqual(Array.from({ length: 10 }, () => "200 read 200"))
	expect(toMostBytesInProgress()).toBe(400)
})

// a body at the large size is never counted, so it is read while a large body waits
test("a small body is read at once while a large body waits its turn", async () => {
	// two bodies of 250 bytes fill the bytes in progress, with their replies waiting on the reply gate
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true })
	const inProgressReplies = [await app.request(toDeclaredPost(250)), await app.request(toDeclaredPost(250))]

	// a third large body waits unread
	const waitingPost = toDeclaredPost(250)
	const waitingReply = app.request(waitingPost)
	expect(await isStillWaiting(waitingPost)).toBe(true)

	// a body of 100 bytes is read at once, and the large body still waits
	const smallPost = toDeclaredPost(100)
	const smallReply = await app.request(smallPost)
	expect(smallPost.bodyUsed).toBe(true)
	expect(waitingPost.bodyUsed).toBe(false)

	// once the replies in progress end, the waiting body is read, and every post gets its reply
	openReplyGate()
	const replyTexts = await Promise.all(inProgressReplies.map((inProgressReply) => inProgressReply.text()))
	expect(replyTexts).toEqual(["read 250", "read 250"])
	expect(await (await waitingReply).text()).toBe("read 250")
	expect(await smallReply.text()).toBe("read 100")
})

// a chunked body's size is unknown until it is read, so it is counted as the largest body the route takes
test("a chunked body counts as a body at the route's limit", async () => {
	// a chunked body of 50 bytes is in progress, with its reply waiting on the reply gate
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true })
	const chunkedReply = await app.request(toChunkedPost(50))

	// a body of 150 bytes waits, which 50 bytes in progress would have left room for
	const waitingPost = toDeclaredPost(150)
	const waitingReply = app.request(waitingPost)
	expect(await isStillWaiting(waitingPost)).toBe(true)

	// the waiting body is read once the chunked body's reply ends
	openReplyGate()
	expect(await chunkedReply.text()).toBe("read 50")
	expect(await (await waitingReply).text()).toBe("read 150")
})

// a body the limit is about to reject counts for no bytes and waits for none
test("a body past the route's limit is rejected unread while large bodies fill the bytes in progress", async () => {
	// two bodies of 250 bytes fill the bytes in progress, with their replies waiting on the reply gate
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true })
	const inProgressReplies = [await app.request(toDeclaredPost(250)), await app.request(toDeclaredPost(250))]

	// a body past the limit gets the limit's 413 at once
	const oversizedPost = toDeclaredPost(BODY_ADMISSION.maxBodyBytes + 1)
	const oversizedReply = await app.request(oversizedPost)
	expect(oversizedReply.status).toBe(413)
	expect(oversizedPost.bodyUsed).toBe(false)

	// let the replies in progress end
	openReplyGate()
	await Promise.all(inProgressReplies.map((inProgressReply) => inProgressReply.text()))
})

// each body of 400 bytes fills the bytes in progress alone, so the next one is read only once the one before releases
test("a body's bytes are released if its reply is dropped, its request is aborted, or its handler fails", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const { app } = toAdmissionApp({ shouldRepliesWait: true })

	// a reply dropped before its end lets the next body be read
	const droppedReply = await app.request(toDeclaredPost(400))
	const abortController = new AbortController()
	const abortedPost = toDeclaredPost(400, "/reply", abortController.signal)
	const abortedReply = app.request(abortedPost)
	expect(await isStillWaiting(abortedPost)).toBe(true)
	await droppedReply.body?.cancel()
	await abortedReply
	expect(abortedPost.bodyUsed).toBe(true)

	// an aborted request lets the next body be read, and a handler that fails with an error responds with a 500
	const failedPost = toDeclaredPost(400, "/error")
	const failedReply = app.request(failedPost)
	expect(await isStillWaiting(failedPost)).toBe(true)
	abortController.abort()
	expect((await failedReply).status).toBe(500)

	// the failed reply's end lets the next body be read, which fails with a value that is no error
	const thrownValuePost = toDeclaredPost(400, "/thrown-value")
	const thrownValueReply = app.request(thrownValuePost)
	expect(await isStillWaiting(thrownValuePost)).toBe(true)
	await (await failedReply).text()
	await expect(thrownValueReply).rejects.toBe("the handler threw a value")

	// the thrown value released its body's bytes, and so does a response with no body
	const noBodyReply = await app.request(toDeclaredPost(400, "/no-body"))
	expect(noBodyReply.status).toBe(204)
	const lastReply = await app.request(toDeclaredPost(400, "/no-body"))
	expect(lastReply.status).toBe(204)
})

// a body that waits past the wait limit gets the busy response, and its body is never read
test("a large body whose turn does not come within the wait is busy, and is never read", async () => {
	// two bodies of 250 bytes fill the bytes in progress, with their replies waiting on the reply gate
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true, waitMs: 30 })
	const inProgressReplies = [await app.request(toDeclaredPost(250)), await app.request(toDeclaredPost(250))]

	// a third large body waits its 30 milliseconds, then is busy
	const busyPost = toDeclaredPost(250)
	const busyReply = await app.request(busyPost)
	expect(busyReply.status).toBe(503)
	expect(await busyReply.json()).toEqual({ error: "busy" })
	expect(busyPost.bodyUsed).toBe(false)
	expect(warnSpy).toHaveBeenCalledWith("a large body waited 30 ms for its turn and got the busy response")

	// once the replies in progress end, the next large body is read
	openReplyGate()
	await Promise.all(inProgressReplies.map((inProgressReply) => inProgressReply.text()))
	expect(await (await app.request(toDeclaredPost(250))).text()).toBe("read 250")
})

// a request that is aborted while its body waits leaves the wait, so the body behind it takes its turn
test("a request aborted while its body waits is never read, and the body behind it is", async () => {
	// one body of 400 bytes fills the bytes in progress, with its reply waiting on the reply gate
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true })
	const inProgressReply = await app.request(toDeclaredPost(400))

	// a second body waits, and its request is aborted
	const abortController = new AbortController()
	const abortedPost = toDeclaredPost(400, "/reply", abortController.signal)
	const abortedReply = app.request(abortedPost)
	expect(await isStillWaiting(abortedPost)).toBe(true)
	abortController.abort()
	expect((await abortedReply).status).toBe(503)
	expect(abortedPost.bodyUsed).toBe(false)

	// the body behind it is read once the first reply ends
	const nextPost = toDeclaredPost(400)
	const nextReply = app.request(nextPost)
	openReplyGate()
	expect(await inProgressReply.text()).toBe("read 400")
	expect(await (await nextReply).text()).toBe("read 400")
})

// two bodies of 200 bytes fit the bytes in progress together, yet one user's second body waits for their first
test("a user's large bodies are read one at a time, and another user's body is read beside them", async () => {
	const { app, openReplyGate } = toAdmissionApp({ shouldRepliesWait: true })
	const firstReply = await app.request(toDeclaredPost(200, "/reply", undefined, "user-1"))

	// the same user's second body waits, and another user's body is read at once
	const secondPost = toDeclaredPost(200, "/reply", undefined, "user-1")
	const secondReply = app.request(secondPost)
	expect(await isStillWaiting(secondPost)).toBe(true)
	const otherPost = toDeclaredPost(200, "/reply", undefined, "user-2")
	const otherReply = await app.request(otherPost)
	expect(otherPost.bodyUsed).toBe(true)

	// the second body is read once the first reply ends
	openReplyGate()
	expect(await firstReply.text()).toBe("read 200")
	expect(await otherReply.text()).toBe("read 200")
	expect(await (await secondReply).text()).toBe("read 200")
})

// the route still holds the body it read, so its bytes stay counted after the request is aborted
test("a body's bytes stay counted while its route still works on an aborted request", async () => {
	// a body of 400 bytes is read, and its request is aborted while the route still works on it
	const { app, openWorkGate } = toAdmissionApp()
	const abortController = new AbortController()
	const workedPost = toDeclaredPost(400, "/work", abortController.signal)
	const workedReply = app.request(workedPost)
	await Bun.sleep(WAIT_MS)
	expect(workedPost.bodyUsed).toBe(true)
	abortController.abort()

	// the next body waits until the route responds
	const nextPost = toDeclaredPost(400)
	const nextReply = app.request(nextPost)
	expect(await isStillWaiting(nextPost)).toBe(true)
	openWorkGate()
	await workedReply
	expect(await (await nextReply).text()).toBe("read 400")
})
