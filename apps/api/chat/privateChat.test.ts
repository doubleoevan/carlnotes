// private chat tests: a signed-in post's chat turn is authorized before its body is read, a rejected turn gets its
// rejection's response and reads no body, an allowed post is read under the body limit and answered, large bodies are
// read within the bytes in progress limit, a post with no attachment never waits, the unverified accounts switch rejects
// a chat turn before it is answered, and the conversation stays open for the user it limits
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { CHAT_PAUSED_ERROR, EMAIL_UNVERIFIED_ERROR } from "@carlnotes/contracts/chat"
import { FREE_USER_ACCESS_ROW, restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as analytics from "@carlnotes/server/analytics"
import { toSignedInApp } from "../testSession"
import * as chatAttachmentReads from "./chatAttachmentReads"
import * as chatTurnAnswer from "./chatTurnAnswer"
import * as chatTurnAuthorization from "./chatTurnAuthorization"
import { stubOwnerTopicRows, UNVERIFIED_SWITCH_ON_ROW } from "./chatTurnAuthorizationTestFixtures"
import * as chatTurns from "./chatTurns"
import { CHAT_BODY_BYTES_IN_PROGRESS_LIMIT, LARGE_CHAT_BODY_BYTES, privateChatRoute } from "./privateChat"

// put the spies, the connection pool's own query, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// one megabyte, and the bytes a post with a 25 megabyte video declares
const MEGABYTE = 1024 * 1024
const VIDEO_POST_BYTES = 25 * MEGABYTE

// how long a case waits before it reads whether a post is still waiting
const WAIT_MS = 10

// the three chat posts, each with the gate that authorizes its chat turn and the page its url names
const CHAT_POSTS = [
	{ path: "/topics/topic-1/chat", gateName: "authorizeChatTurn", page: { topicId: "topic-1" } },
	{ path: "/teams/team-1/chat", gateName: "authorizeTeamChatTurn", page: { teamId: "team-1" } },
	{ path: "/chat/new-topic", gateName: "authorizeNewTopicChatTurn", page: { newTopic: true } },
] as const

// each rejection of a signed-in chat turn, with the status and the error of its response
const CHAT_TURN_REJECTIONS = [
	{ authorization: { status: "budget", userId: "user-1" }, status: 402, error: "budget exhausted" },
	{ authorization: { status: "chatPaused", userId: "user-1" }, status: 429, error: CHAT_PAUSED_ERROR },
	{ authorization: { status: "emailUnverified", userId: "user-1" }, status: 403, error: EMAIL_UNVERIFIED_ERROR },
	{ authorization: { status: "forbidden" }, status: 403, error: "forbidden" },
] as const

// user-1 allowed to chat, as a persisted chat turn that may not edit the topic
const ALLOWED_CHAT_TURN = {
	status: "allowed",
	userId: "user-1",
	isTopicOwner: false,
	isPersisted: true,
	canEditTopic: false,
} as const

// a chat post's body with a question and no attachment
const QUESTION_BODY = JSON.stringify({ question: "what changed this week?" })

// a chat post with the content length a request on the wire declares, its body's own length unless a case declares
// another
function toChatPost(path: string, body: string, declaredBodyBytes = body.length): Request {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "content-length": String(declaredBodyBytes) },
		body,
	})
}

// whether a post's body is still unread after a moment
async function isStillWaiting(post: Request): Promise<boolean> {
	await Bun.sleep(WAIT_MS)
	return !post.bodyUsed
}

// a reply that says "answered" once the given promise resolves, and runs onEnded as it ends
function toDelayedReply(replyStart: Promise<void>, onEnded: () => void = () => {}): Response {
	return new Response(
		new ReadableStream({
			async start(controller) {
				await replyStart
				onEnded()
				controller.enqueue(new TextEncoder().encode("answered"))
				controller.close()
			},
		}),
	)
}

// a spent budget, a paused chat, an unverified email, and a page the user may not chat on each get their own
// response, and none of them reads the post's body
test("a chat post whose turn is rejected gets its rejection's response, and its body is never read", async () => {
	// a post with 20 megabytes of attachments, as user-1
	stubRedisClient()
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const answerChatTurnSpy = spyOn(chatTurnAnswer, "answerChatTurn")
	const video = { kind: "video", name: "clip.mp4", dataUrl: `data:video/mp4;base64,${"A".repeat(20 * MEGABYTE)}` }
	const attachmentsBody = JSON.stringify({ question: "what is in this clip?", attachments: [video] })
	const app = toSignedInApp(privateChatRoute, "user-1")

	// every chat post responds with each rejection as its gate decides
	for (const { path, gateName } of CHAT_POSTS) {
		for (const { authorization, status, error } of CHAT_TURN_REJECTIONS) {
			spyOn(chatTurnAuthorization, gateName).mockResolvedValue(authorization)
			const post = toChatPost(path, attachmentsBody)
			const response = await app.request(post)

			// the rejection's own status and error, with the body unread
			expect(response.status).toBe(status)
			expect(await response.json()).toEqual({ error })
			expect(post.bodyUsed).toBe(false)
		}
	}

	// no turn was answered, and each spent budget counted its event
	expect(answerChatTurnSpy).not.toHaveBeenCalled()
	expect(trackEventSpy).toHaveBeenCalledTimes(CHAT_POSTS.length)
	expect(trackEventSpy).toHaveBeenCalledWith("chat_budget_reached", "user-1", expect.anything())
})

// an allowed post passes the body limit and its validation, and the answer gets its page and the gate's decision
test("an allowed chat post is read under the body limit, validated, and answered", async () => {
	stubRedisClient()
	const answerChatTurnSpy = spyOn(chatTurnAnswer, "answerChatTurn").mockImplementation(
		async () => new Response("answered"),
	)
	const image = { kind: "image", name: "mug.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }
	const imageBody = JSON.stringify({ question: "what is this?", attachments: [image] })
	const app = toSignedInApp(privateChatRoute, "user-1")

	// each chat post with an image is read and answered on its own page
	for (const { path, gateName, page } of CHAT_POSTS) {
		spyOn(chatTurnAuthorization, gateName).mockResolvedValue(ALLOWED_CHAT_TURN)
		const post = toChatPost(path, imageBody)
		const response = await app.request(post)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe("answered")
		expect(post.bodyUsed).toBe(true)

		// the answer got the page, the gate's decision, and the validated body
		const [, answerChatTurnOptions] = answerChatTurnSpy.mock.lastCall ?? []
		expect(answerChatTurnOptions).toMatchObject({
			page,
			authorization: ALLOWED_CHAT_TURN,
			chatTurnPayload: { question: "what is this?", attachments: [image] },
		})
	}

	// a body that fails its validation is read and never answered
	const invalidResponse = await app.request(toChatPost("/topics/topic-1/chat", JSON.stringify({ question: "   " })))
	expect(invalidResponse.status).toBe(400)

	// a body past the body limit gets the limit's 413 unread
	const oversizedPost = toChatPost("/topics/topic-1/chat", QUESTION_BODY, 26 * MEGABYTE + 1)
	const oversizedResponse = await app.request(oversizedPost)
	expect(oversizedResponse.status).toBe(413)
	expect(await oversizedResponse.json()).toEqual({ error: "Those attachments are too large." })
	expect(oversizedPost.bodyUsed).toBe(false)
	expect(answerChatTurnSpy).toHaveBeenCalledTimes(CHAT_POSTS.length)
})

// each post declares 25 megabytes and sends a short body, because a body is admitted by its declared length alone. each
// comes from a user of its own, because one user's large posts are read one at a time
test("ten users' chat posts of 25 megabytes at once are read within the bytes in progress limit, and every post gets its reply", async () => {
	stubRedisClient()
	spyOn(chatTurnAuthorization, "authorizeChatTurn").mockResolvedValue(ALLOWED_CHAT_TURN)

	// the answer counts each read post's bytes as in progress until its reply ends
	let bytesInProgress = 0
	let mostBytesInProgress = 0
	spyOn(chatTurnAnswer, "answerChatTurn").mockImplementation(async () => {
		bytesInProgress += VIDEO_POST_BYTES
		mostBytesInProgress = Math.max(mostBytesInProgress, bytesInProgress)

		// the reply ends a moment later
		return toDelayedReply(Bun.sleep(5), () => {
			bytesInProgress -= VIDEO_POST_BYTES
		})
	})

	// ten posts at once, each from its own user and read to the end of its reply
	const replies = await Promise.all(
		Array.from({ length: 10 }, async (_, userIndex) => {
			const app = toSignedInApp(privateChatRoute, `user-${userIndex + 1}`)
			const response = await app.request(toChatPost("/topics/topic-1/chat", QUESTION_BODY, VIDEO_POST_BYTES))
			return response.text()
		}),
	)

	// four posts of 25 megabytes fit in the limit at once, and nobody was rejected for the wait
	expect(replies).toEqual(Array.from({ length: 10 }, () => "answered"))
	expect(mostBytesInProgress).toBe(4 * VIDEO_POST_BYTES)
	expect(mostBytesInProgress).toBeLessThanOrEqual(CHAT_BODY_BYTES_IN_PROGRESS_LIMIT)
})

// a post with no attachment, and a post at the large size, are never counted against the bytes in progress
test("a chat post with no attachment is read at once while large posts wait", async () => {
	// four posts of 25 megabytes fill the bytes in progress, with their replies waiting on the reply gate
	stubRedisClient()
	spyOn(chatTurnAuthorization, "authorizeChatTurn").mockResolvedValue(ALLOWED_CHAT_TURN)
	const replyGate = Promise.withResolvers<void>()
	spyOn(chatTurnAnswer, "answerChatTurn").mockImplementation(async () => toDelayedReply(replyGate.promise))
	const toVideoPost = (): Request => toChatPost("/topics/topic-1/chat", QUESTION_BODY, VIDEO_POST_BYTES)
	const inProgressReplies = await Promise.all(
		Array.from({ length: 4 }, (_, userIndex) =>
			toSignedInApp(privateChatRoute, `user-${userIndex + 1}`).request(toVideoPost()),
		),
	)

	// a fifth user's post of 25 megabytes waits unread
	const app = toSignedInApp(privateChatRoute, "user-5")
	const waitingPost = toVideoPost()
	const waitingReply = app.request(waitingPost)
	expect(await isStillWaiting(waitingPost)).toBe(true)

	// a post with no attachment and a post at the large size are read at once, and the large post still waits
	const questionPost = toChatPost("/topics/topic-1/chat", QUESTION_BODY)
	const largeSizePost = toChatPost("/topics/topic-1/chat", QUESTION_BODY, LARGE_CHAT_BODY_BYTES)
	const readReplies = [await app.request(questionPost), await app.request(largeSizePost)]
	expect(questionPost.bodyUsed).toBe(true)
	expect(largeSizePost.bodyUsed).toBe(true)
	expect(waitingPost.bodyUsed).toBe(false)

	// once the replies in progress end, the waiting post is read, and every post gets its reply
	replyGate.resolve()
	const replies = await Promise.all([...inProgressReplies, ...readReplies].map((reply) => reply.text()))
	expect(replies).toEqual(Array.from({ length: 6 }, () => "answered"))
	expect(await (await waitingReply).text()).toBe("answered")
})

// the gate runs on the stored rows: the switch on, no cutoff passed, and a free account that signed up with a password
test("the unverified accounts switch rejects an unverified password account's chat turn before it is answered", async () => {
	// owner-1 has not verified their email, and asks carl a question on their topic
	const unverifiedOwnerRows = {
		scanDollars: "0.00",
		ownerAccessRow: FREE_USER_ACCESS_ROW,
		overridesRow: UNVERIFIED_SWITCH_ON_ROW,
		isUnverifiedPasswordUser: true,
	}
	stubOwnerTopicRows(unverifiedOwnerRows)
	const answerChatTurnSpy = spyOn(chatTurnAnswer, "answerChatTurn").mockImplementation(
		async () => new Response("answered"),
	)
	const app = toSignedInApp(privateChatRoute, "owner-1")

	// the chat turn is rejected with the unverified email's error, unread and unanswered
	const rejectedPost = toChatPost("/topics/topic-1/chat", QUESTION_BODY)
	const rejectedResponse = await app.request(rejectedPost)
	expect(rejectedResponse.status).toBe(403)
	expect(await rejectedResponse.json()).toEqual({ error: EMAIL_UNVERIFIED_ERROR })
	expect(rejectedPost.bodyUsed).toBe(false)
	expect(answerChatTurnSpy).not.toHaveBeenCalled()

	// the same account asks again once its email is verified, and carl answers
	stubOwnerTopicRows({ ...unverifiedOwnerRows, isUnverifiedPasswordUser: false })
	const answeredResponse = await app.request(toChatPost("/topics/topic-1/chat", QUESTION_BODY))
	expect(answeredResponse.status).toBe(200)
	expect(await answeredResponse.text()).toBe("answered")
})

// the panel opens with the chat on, as it does past the chat cutoff, so a chat turn can say to verify the email
test("the conversation stays open for a user the unverified accounts switch limits", async () => {
	// user-1's empty conversation on topic-1, with the switch limiting user-1
	stubRedisClient()
	spyOn(chatTurns, "loadChatTurns").mockResolvedValue([])
	spyOn(chatAttachmentReads, "loadKeptTopicAttachments").mockResolvedValue([])
	const authorizeChatTurnSpy = spyOn(chatTurnAuthorization, "authorizeChatTurn").mockResolvedValue({
		status: "emailUnverified",
		userId: "user-1",
	})
	const app = toSignedInApp(privateChatRoute, "user-1")

	// the chat is on, with no signup and no spent budget
	const chatConversation = await (await app.request("/topics/topic-1/chat")).json()
	expect(chatConversation).toMatchObject({ canChat: true, isSignupRequired: false, isBudgetExhausted: false })

	// a spent budget still turns the chat off
	authorizeChatTurnSpy.mockResolvedValue({ status: "budget", userId: "user-1" })
	const spentBudgetConversation = await (await app.request("/topics/topic-1/chat")).json()
	expect(spentBudgetConversation).toMatchObject({ canChat: false, isBudgetExhausted: true })
})
