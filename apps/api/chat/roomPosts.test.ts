// chat room post tests: a shared image the moderation flags rejects the post, an image whose check could not run posts
// as a clean one does and is checked once, a post to a chat room the user may not use spends no moderation call, and a
// shared file that was not read rejects the post with why
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as uncheckedImages from "@carlnotes/db/uncheckedImages"
import * as moderation from "@carlnotes/models/moderation"
import { AttachmentValidationError } from "@carlnotes/pipeline/attachContentType"
import * as attachExtraction from "@carlnotes/pipeline/attachExtraction"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as room from "./room"
import * as roomAccess from "./roomAccess"
import { chatRoomRoute, TEAM_ROOM_PATH } from "./roomRoute"

// a shared image and a shared PDF as a chat room post sends them. the read of the PDF's text is stubbed, so its bytes
// are never parsed
const SHARED_IMAGE = {
	kind: "image",
	name: "shot.png",
	dataUrl: "data:image/png;base64,AA",
	keep: false,
} satisfies ChatAttachment
const SHARED_PDF = {
	kind: "pdf",
	name: "paper.pdf",
	dataUrl: "data:application/pdf;base64,AA",
	keep: false,
} satisfies ChatAttachment

// each way the read of a shared file's text fails, with the error its chat room post responds with. a file whose
// read ran past its deadline or the memory limit is too large to read, a file that waited behind other files until
// its deadline is busy, and a file that cannot be parsed is rejected
const UNREAD_FILE_ERRORS = [
	{
		unreadFile: "a file too large to read in time",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("time"),
		error: "attachment too large",
	},
	{
		unreadFile: "a file whose read passes the memory limit",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("memory"),
		error: "attachment too large",
	},
	{
		unreadFile: "a file that waited behind other files",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("wait"),
		error: "attachment busy",
	},
	{
		unreadFile: "a file that cannot be read",
		extractionError: new AttachmentValidationError("the file is not a PDF"),
		error: "attachment rejected",
	},
]

// each post counts in the tool callers' rate limit window, over a fake Redis
beforeEach(() => {
	stubRedisClient()
})

// put the spies, the connection pool's own query, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// post a chat message with its shared files to team-1's own chat room as user-1
async function postToTeamRoom(content: string, attachments: ChatAttachment[]): Promise<Response> {
	return toSignedInApp(chatRoomRoute, "user-1").request(
		TEAM_ROOM_PATH.replace(":id", "team-1"),
		toJsonRequest({ content, attachments }),
	)
}

// a shared image the moderation flags rejects the whole post with Carl's 422, and nothing posts
test("a chat room post with a flagged image is rejected with its category", async () => {
	// a room the user may post to, a clean text, a flagged image, and a post that must not run
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(moderation, "classifyUserText").mockResolvedValue({ outcome: "skipped" })
	spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "violence" },
	})
	const postChatRoomMessageSpy = spyOn(room, "postChatRoomMessage")

	// the post, with one image
	const response = await postToTeamRoom("look", [SHARED_IMAGE])
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "violence" })
	expect(postChatRoomMessageSpy).not.toHaveBeenCalled()
})

// only a room's members see its image, so an image whose check could not run posts. its failure is reported with the
// room's ids and never the image, and no image is saved as unchecked for a sweep to check again
test("a chat room image whose check could not run posts as a clean one does, after one check", async () => {
	// a room the user may post to, a clean text, and a post that returns its chat message
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(moderation, "classifyUserText").mockResolvedValue({ outcome: "skipped" })
	const postedChatMessage = { chatMessageId: 42, rejectionReason: null }
	const postChatRoomMessageSpy = spyOn(room, "postChatRoomMessage").mockResolvedValue(postedChatMessage)

	// the first post's image is clean, and the second post's check could not run
	const classifyImageSpy = spyOn(moderation, "classifyImage")
		.mockResolvedValueOnce({ outcome: "classified", verdict: { isViolation: false, category: null } })
		.mockResolvedValueOnce({ outcome: "failed", error: new Error("the image moderation timed out") })
	const reportErrorSpy = quietErrorReports()
	const saveUncheckedImageSpy = spyOn(uncheckedImages, "saveUncheckedImage")

	// the clean image posts after one check, with no report
	const cleanResponse = await postToTeamRoom("look", [SHARED_IMAGE])
	expect(cleanResponse.status).toBe(200)
	expect(await cleanResponse.json()).toEqual(postedChatMessage)
	expect(classifyImageSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy).not.toHaveBeenCalled()

	// the unchecked image posts after one check too, and its post is the clean image's post
	const uncheckedResponse = await postToTeamRoom("look", [SHARED_IMAGE])
	expect(uncheckedResponse.status).toBe(200)
	expect(await uncheckedResponse.json()).toEqual(postedChatMessage)
	expect(classifyImageSpy).toHaveBeenCalledTimes(2)
	expect(postChatRoomMessageSpy.mock.calls[1]?.[5]).toEqual([SHARED_IMAGE])
	expect(postChatRoomMessageSpy.mock.calls[1]).toEqual(postChatRoomMessageSpy.mock.calls[0])

	// the failure is reported once with the room's ids and never the image, and nothing is saved as unchecked
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({
		moderationSubjectKind: "chatRoomImage",
		moderationSubjectId: "team:team-1",
	})
	expect(JSON.stringify(reportErrorSpy.mock.calls[0])).not.toContain(SHARED_IMAGE.dataUrl)
	expect(saveUncheckedImageSpy).not.toHaveBeenCalled()
})

// a post to a chat room the user may not use reads as missing before any moderation call is made
test("a chat room post the user may not make spends no moderation call", async () => {
	// a chat room the user may not post to, with both checks spied
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	const classifyUserTextSpy = spyOn(moderation, "classifyUserText")
	const classifyImageSpy = spyOn(moderation, "classifyImage")

	// the post, with one image
	const response = await postToTeamRoom("look", [SHARED_IMAGE])
	expect(response.status).toBe(404)
	expect(classifyUserTextSpy).not.toHaveBeenCalled()
	expect(classifyImageSpy).not.toHaveBeenCalled()
})

// one shared file that was not read rejects the whole post with why
test.each(UNREAD_FILE_ERRORS)(
	"a chat room post responds 400 with $error for $unreadFile",
	async ({ extractionError, error }) => {
		// a room the user may post to, a clean text, and the poster's first shared file, whose read fails
		spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
		spyOn(moderation, "classifyUserText").mockResolvedValue({ outcome: "skipped" })
		const sentQueries = stubConnectionPool(() => [[0]])
		quietErrorReports()
		spyOn(attachExtraction, "extractChatAttachmentText").mockRejectedValue(extractionError)

		// the post is rejected with the file's error, and no chat message or shared file is stored
		const response = await postToTeamRoom("the paper", [SHARED_PDF])
		expect(response.status).toBe(400)
		expect(await response.json()).toEqual({ error })
		expect(sentQueries.some(({ text }) => text.startsWith("insert"))).toBe(false)
	},
)
