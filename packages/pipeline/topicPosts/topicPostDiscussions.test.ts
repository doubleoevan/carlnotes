// Topic Post Discussion recording tests: the first discussion's start, a start whose workflow fails, the screen of the
// Comments and the author's name, a spent budget, and a post that is gone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { topicPostDiscussions } from "@carlnotes/db/schema/topicPosts"
import * as sharedComments from "@carlnotes/db/sharedComments"
import * as store from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import * as models from "@carlnotes/models/models"
import type { ModerationClassification } from "@carlnotes/models/moderation"
import * as moderation from "@carlnotes/models/moderation"
import * as speech from "@carlnotes/models/speech"
import * as monitoring from "@carlnotes/server/monitoring"
import * as podcastEpisodeAudio from "../podcast/podcastEpisodeAudio"
import * as temporalClient from "../temporalClient"
import * as topicMemoryPrompt from "../topicMemoryPrompt"
import { recordTopicPostDiscussionAudio } from "./topicPostDiscussionAudio"
import * as discussionScript from "./topicPostDiscussionScript"
import {
	failTopicPostDiscussion,
	startTopicPostDiscussion,
	startTopicPostPublishDiscussion,
	TopicPostDiscussionError,
	writeTopicPostDiscussionScript,
} from "./topicPostDiscussions"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a recording row joined to its published post and its author's name, in the script read's column order
const DISCUSSION_ROW = [
	"member-2",
	"recording",
	null,
	"post-1",
	"topic-1",
	false,
	"Light Roasts",
	"<p>Start light.</p>",
	new Date(),
	"Rude-Name",
]

// the two turns a written script holds
const TURNS = [
	{ speaker: "host" as const, text: "Start light, she says." },
	{ speaker: "cohost" as const, text: "And she is right." },
]

// a classification that flags a text, and one that lets it through
const toClassification = (isViolation: boolean): ModerationClassification =>
	({ outcome: "classified", verdict: { isViolation, category: isViolation ? "harassment" : null } }) as never

// the recording row's read, the starter's key, a month with budget left, and a script the writer returns
function stubScriptWrite(hasPublicTopicMemories = false): {
	sentQueries: ReturnType<typeof stubConnectionPool>
	writeSpy: ReturnType<typeof spyOn>
} {
	// make the saved discussion and its billing gate available to the script writer
	const row = DISCUSSION_ROW.with(5, hasPublicTopicMemories)
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [row] : []))
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("member-2-key")
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	const writeSpy = spyOn(discussionScript, "writeTopicPostDiscussion").mockResolvedValue({
		turns: TURNS,
		costDollars: 0.02,
	})
	return { sentQueries, writeSpy }
}

test("a flagged Comment is left out, a flagged author is not named, and the script bills the starter's key", async () => {
	const { sentQueries, writeSpy } = stubScriptWrite()
	spyOn(sharedComments, "loadTopicPostSharedCommentTexts").mockResolvedValue([
		{ username: "Clover-Field", body: "A full meter lost half my foragers." },
		{ username: "Loud-Hornet", body: "a flagged thing to say" },
	])

	// the screen flags one Comment's text and the author's username
	spyOn(moderation, "classifyUserText").mockImplementation(async ({ text }) =>
		toClassification(text === "a flagged thing to say" || text === "Rude-Name"),
	)
	await writeTopicPostDiscussionScript("discussion-1", "the pancake part")

	// the writer reads the clean Comment alone, with no author to name, on the key of the user the row bills
	expect(writeSpy).toHaveBeenCalledWith({
		title: "Light Roasts",
		html: "<p>Start light.</p>",
		authorUsername: null,
		comments: [{ username: "Clover-Field", body: "A full meter lost half my foragers." }],
		hint: "the pancake part",
		litellmApiKey: "member-2-key",
		topicMemoryPrompt: "",
	})

	// the script is kept on the row, and the note is in no query
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_post_discussions"'))
	expect(JSON.stringify(updateQuery?.values)).toContain("Start light, she says.")
	expect(JSON.stringify(sentQueries)).not.toContain("the pancake part")
})

test("a public post embeds its own text and sends relevant topic memories to the discussion writer", async () => {
	const { writeSpy } = stubScriptWrite(true)
	const embed = spyOn(models, "embedVector").mockResolvedValue([1, 0])
	const load = spyOn(topicMemoryPrompt, "loadTopicMemoryPrompt").mockResolvedValue("fenced background")
	spyOn(sharedComments, "loadTopicPostSharedCommentTexts").mockResolvedValue([])
	spyOn(moderation, "classifyUserText").mockResolvedValue(toClassification(false))
	await writeTopicPostDiscussionScript("discussion-1")

	expect(embed).toHaveBeenCalledWith("Light Roasts\nStart light.", { litellmApiKey: "member-2-key", maxRetries: 0 })
	expect(load).toHaveBeenCalledWith({ topicId: "topic-1", embeddings: [[1, 0]], isPublicOnly: true })
	expect(writeSpy).toHaveBeenCalledWith(expect.objectContaining({ topicMemoryPrompt: "fenced background" }))
})

test("a spent budget fails the discussion alone, before any model call", async () => {
	const { writeSpy } = stubScriptWrite()
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const failure = await writeTopicPostDiscussionScript("discussion-1").catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(TopicPostDiscussionError)
	expect((failure as TopicPostDiscussionError).isBudgetSpent).toBe(true)
	expect(writeSpy).not.toHaveBeenCalled()
})

test("a discussion whose post was deleted has nothing to record", async () => {
	const { writeSpy } = stubScriptWrite()

	// the delete took the recording row with the post
	stubConnectionPool()
	const failure = await writeTopicPostDiscussionScript("discussion-1").catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(TopicPostDiscussionError)
	expect((failure as TopicPostDiscussionError).isBudgetSpent).toBe(false)
	expect(writeSpy).not.toHaveBeenCalled()
})

test("a published post's first discussion bills its author, and starts once", async () => {
	const startWorkflowSpy = spyOn(temporalClient, "startTopicPostDiscussionWorkflow").mockResolvedValue()

	// the post's author, no discussion yet, and the row the insert returns
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("insert")) {
			return [["discussion-1"]]
		}
		return text.includes('from "topic_posts"') ? [["author-1"]] : []
	})
	// the discussion starts, billed to the author
	expect(await startTopicPostPublishDiscussion("post-1")).toBe("discussion-1")
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(insertQuery?.values).toEqual(expect.arrayContaining(["post-1", "author-1", "publish"]))
	expect(startWorkflowSpy).toHaveBeenCalledWith({ discussionId: "discussion-1", hint: undefined })

	// a post that already has a discussion, and a post that is gone, start none
	stubConnectionPool(({ text }) => (text.includes('from "topic_posts"') ? [["author-1"]] : [["discussion-1"]]))
	expect(await startTopicPostPublishDiscussion("post-1")).toBeNull()
	stubConnectionPool()
	expect(await startTopicPostPublishDiscussion("post-1")).toBeNull()
	expect(startWorkflowSpy).toHaveBeenCalledTimes(1)
})

test("a discussion whose workflow does not start leaves no recording row, so the next start is not blocked", async () => {
	// the insert returns the row, and the workflow's start fails
	const workflowError = new Error("temporal is down")
	const startWorkflowSpy = spyOn(temporalClient, "startTopicPostDiscussionWorkflow").mockRejectedValue(workflowError)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("insert")) {
			return [["discussion-1"]]
		}
		return text.includes('from "topic_posts"') ? [["author-1"]] : []
	})

	// the start throws the workflow's error, after the row is deleted
	const failure = await startTopicPostDiscussion({ topicPostId: "post-1", userId: "member-2", kind: "regenerate" })
		.then(() => null)
		.catch((error: unknown) => error)
	expect(failure).toBe(workflowError)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "topic_post_discussions"'))
	expect(deleteQuery?.values).toEqual(["discussion-1"])

	// the publish's next attempt finds no discussion, and starts one
	startWorkflowSpy.mockResolvedValue()
	expect(await startTopicPostPublishDiscussion("post-1")).toBe("discussion-1")
	expect(startWorkflowSpy).toHaveBeenCalledTimes(2)
})

// the post keeps its earlier discussion and nobody is told of the failure, so it is reported
test("a discussion that is closed as failed is reported, and one that already published is not", async () => {
	// the failing write returns the post of the row it closed
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const deleteStoredObjectsSpy = spyOn(store, "deleteStoredObjects").mockResolvedValue()
	const sentQueries = stubConnectionPool(() => [["post-1"]])
	await failTopicPostDiscussion("discussion-1", "the speech call failed")

	// the row closes only while it still reads recording, and the report names it with its reason
	expect(sentQueries[0]?.values).toEqual(["failed", "the speech call failed", "discussion-1", "recording"])
	expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall.slice(1))).toEqual([
		["podcast-episode", { discussionId: "discussion-1", reason: "the speech call failed" }],
	])

	// the speech that an attempt stored goes with the failed row
	expect(deleteStoredObjectsSpy.mock.calls).toEqual([[[SPEECH_KEY]]])

	// a row that published meanwhile matches nothing, and nothing more is reported or deleted
	stubConnectionPool(() => [])
	await failTopicPostDiscussion("discussion-1", "the speech call failed")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(deleteStoredObjectsSpy).toHaveBeenCalledTimes(1)
})

// the keys of the discussion's stored speech and of its finished audio
const SPEECH_KEY = "topic-post-discussions/post-1/discussion-1.wav"
const AUDIO_KEY = "topic-post-discussions/post-1/discussion-1.mp3"

// two seconds of speech as a WAV file's bytes
const TWO_SECOND_SPEECH = new Uint8Array(speech.WAV_HEADER_BYTES + 2 * speech.SPEECH_BYTES_PER_SECOND)

// stub what a recording touches: the row with its script, the storage, the speech call, and the join. returns the
// queries sent, the order the steps ran in, and the speech call's spy
function stubRecording(storedSpeechByteSize: number | null): {
	sentQueries: SentQuery[]
	steps: string[]
	recordSpeechSpy: ReturnType<typeof spyOn<typeof speech, "recordSpeech">>
} {
	// the recording row, and a publish that finds it still recording
	const recordingRow = toTableRow(topicPostDiscussions, {
		...{ id: "discussion-1", topicPostId: "post-1", userId: "member-2", kind: "publish", status: "recording" },
		...{ script: TURNS, cost: 0, createdAt: new Date() },
	})
	// each query, write, and delete that the test checks, named in the order it ran
	const steps: string[] = []
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("select")) {
			return [recordingRow]
		}
		// a pending deletion is a step, so its order beside the uploads is checked
		if (text.startsWith('insert into "pending_object_deletions"')) {
			steps.push("pending deletion")
		}
		return text.includes('"status" = $') ? [["discussion-1"]] : []
	})

	// the storage
	spyOn(store, "loadStoredObjectByteSize").mockResolvedValue(storedSpeechByteSize)
	spyOn(store, "uploadAttachment").mockImplementation(async (key) => void steps.push(`store ${key}`))
	spyOn(store, "downloadPodcastEpisodeFile").mockImplementation(async ({ key }) => void steps.push(`read ${key}`))
	spyOn(store, "uploadPodcastEpisodeFile").mockImplementation(async ({ key }) => void steps.push(`store ${key}`))
	spyOn(store, "deleteStoredObjects").mockImplementation(async (keys) => void steps.push(`delete ${keys.join(" ")}`))

	// the speech call on the user's key, and the join
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("member-2-key")
	spyOn(podcastEpisodeAudio, "joinChapterFiles").mockImplementation(async () => void steps.push("join"))
	const recordSpeechSpy = spyOn(speech, "recordSpeech").mockImplementation(async () => {
		steps.push("speech")
		return { outcome: "recorded", audioBytes: TWO_SECOND_SPEECH, inputTokens: 100, audioTokens: 50 }
	})
	return { sentQueries, steps, recordSpeechSpy }
}

// the speech is the paid step, so it is stored before the encode can fail, and deleted once the row publishes
test("a discussion's speech is stored before the encode, and deleted once the discussion publishes", async () => {
	const { sentQueries, steps } = stubRecording(null)
	await recordTopicPostDiscussionAudio("discussion-1")
	expect(steps).toEqual([
		"speech",
		"pending deletion",
		`store ${SPEECH_KEY}`,
		"join",
		`store ${AUDIO_KEY}`,
		`delete ${SPEECH_KEY}`,
	])

	// the stored speech has a pending deletion two days out
	const pendingDeletionInsert = sentQueries.find((sentQuery) =>
		sentQuery.text.startsWith('insert into "pending_object_deletions"'),
	)
	expect(pendingDeletionInsert?.values[0]).toBe(SPEECH_KEY)
	expect(new Date(String(pendingDeletionInsert?.values[1])).getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000)

	// the row publishes with the two seconds that the speech holds
	const publishUpdate = sentQueries.find((sentQuery) => sentQuery.values.includes("published"))
	expect(publishUpdate?.values).toEqual(expect.arrayContaining([AUDIO_KEY, 2, "discussion-1", "recording"]))
})

// a retry after a failed encode finds the speech that the earlier attempt stored
test("a retry after a stored speech makes no speech call and adds no cost", async () => {
	const { sentQueries, steps, recordSpeechSpy } = stubRecording(TWO_SECOND_SPEECH.byteLength)
	await recordTopicPostDiscussionAudio("discussion-1")

	// the stored speech is read and encoded, with no speech call and no cost written
	expect(recordSpeechSpy).not.toHaveBeenCalled()
	expect(steps).toEqual([`read ${SPEECH_KEY}`, "join", `store ${AUDIO_KEY}`, `delete ${SPEECH_KEY}`])
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('set "cost"'))).toBe(false)

	// the length comes from the stored speech's size
	const publishUpdate = sentQueries.find((sentQuery) => sentQuery.values.includes("published"))
	expect(publishUpdate?.values).toEqual(expect.arrayContaining([AUDIO_KEY, 2]))
})

// a post deleted during the recording took the row with it, so the read after the publish finds no row
test("a discussion whose row is gone at the publish deletes its speech and its audio", async () => {
	const { steps } = stubRecording(null)
	stubConnectionPool(({ text }) =>
		text.startsWith("select") && !text.startsWith('select "audio_key"')
			? [
					toTableRow(topicPostDiscussions, {
						id: "discussion-1",
						topicPostId: "post-1",
						userId: "member-2",
						script: TURNS,
					}),
				]
			: [],
	)
	await recordTopicPostDiscussionAudio("discussion-1")
	expect(steps.at(-1)).toBe(`delete ${SPEECH_KEY} ${AUDIO_KEY}`)
})

// a recording attempt that outlives its heartbeat may still publish while its retry runs. the retry reads the row as
// recording, uploads to the same key, and its publish finds the row the first attempt published
test("a discussion that an overlapping attempt published keeps its audio", async () => {
	const { steps } = stubRecording(null)
	stubConnectionPool(({ text }) => {
		// the row plays the audio under the key, and the publish's update changes no row
		if (text.startsWith('select "audio_key"')) {
			return [[AUDIO_KEY]]
		}

		// the recording row as the attempt first read it
		return text.startsWith("select")
			? [
					toTableRow(topicPostDiscussions, {
						id: "discussion-1",
						topicPostId: "post-1",
						userId: "member-2",
						script: TURNS,
					}),
				]
			: []
	})
	await recordTopicPostDiscussionAudio("discussion-1")
	expect(steps.at(-1)).toBe(`delete ${SPEECH_KEY}`)
})
