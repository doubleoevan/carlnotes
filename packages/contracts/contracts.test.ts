// tests for the payload contracts that create and update topic are validated through
import { expect, test } from "bun:test"
import { CHAT_HISTORY_ANSWER_CHARS, CHAT_HISTORY_TOOL_CALL_INPUT_CHARS, CHAT_HISTORY_TOOL_CALLS } from "./chat"
import {
	PODCAST_EPISODE_NOTE_CHAPTER_TITLE_CHARS,
	toPodcastEpisodeNoteParts,
	withAttachmentNote,
	withoutAttachmentNote,
	withPodcastEpisodeNote,
} from "./chatQuestionNotes"
import { TEST_PODCAST_EPISODE_NOTE } from "./chatTestFixtures"
import { TOPIC_SAVE_TOOL_NAMES, toSentToolCall, toSentToolCalls, toStandingTopicEditCall } from "./chatTurns"
import {
	type ChatToolCall,
	chatRoomMessagePayload,
	chatTurnPayload,
	podcastEpisodeChapterPayload,
	userInvitePayload,
} from "./payloads"
import {
	suggestSourcesPayload,
	type UpdateTopicPayload,
	updateTopicFieldsPayload,
	updateTopicPayload,
} from "./topicPayloads"
import {
	ATTACHMENT_NO_TEXT_REASON,
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_TOPIC_SOURCES,
	type ScanSourceResults,
	scanNote,
	scanSourceResults,
	toAttachmentFailureMessage,
} from "./topics"

// a valid topic payload, varied only by the source list each test case needs
function topicPayload(sources: UpdateTopicPayload["sources"]): UpdateTopicPayload {
	return {
		name: "A topic",
		prompt: "what to look for",
		tags: [],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday" as const,
		visibility: "private" as const,
		maxTopicFindings: 10,
		inviteEmails: [],
		sources,
	}
}

// a source list of the given length
function sourceList(count: number): UpdateTopicPayload["sources"] {
	return Array.from({ length: count }, (_, index) => ({
		sourceKind: "rss" as const,
		config: { url: `https://example.test/${index}/feed` },
	}))
}

// every Scan fetches every Source, so the list must have a limit
test("a topic holds at most the source limit", () => {
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES))).success).toBe(true)
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES + 1))).success).toBe(false)
})

// the editor merges prompt urls into the same array before it saves, so they must count toward the limit
test("prompt-derived url sources count toward the limit", () => {
	const promptUrls = Array.from({ length: 3 }, (_, index) => ({
		sourceKind: "url" as const,
		config: { url: `https://example.test/page-${index}` },
	}))
	const sources = [...sourceList(MAX_TOPIC_SOURCES - 2), ...promptUrls]
	expect(sources).toHaveLength(MAX_TOPIC_SOURCES + 1)
	expect(updateTopicPayload.safeParse(topicPayload(sources)).success).toBe(false)
})

// a topic with no sources at all is a topic that scans nothing, which the editor allows
test("an empty source list is still a valid payload", () => {
	expect(updateTopicPayload.safeParse(topicPayload([])).success).toBe(true)
})

// a source suggestion request includes every ready attachment's context joined together
test("a suggestion request accepts the attachment context up to the limit and rejects more", () => {
	const request = (attachmentContext: string): Record<string, unknown> => ({
		name: "Raccoons",
		prompt: "care",
		attachmentContext,
		excludeSources: [],
		limit: 3,
	})
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS))).success).toBe(true)
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1))).success).toBe(false)

	// a request that names no attachment context at all is still valid
	expect(
		suggestSourcesPayload.safeParse({ name: "Raccoons", prompt: "care", excludeSources: [], limit: 3 }).success,
	).toBe(true)
})

// the shape every user-invite request requires: exactly one identifier, with the email normalized
test("userInvitePayload accepts exactly one identifier and normalizes the email", () => {
	expect(userInvitePayload.safeParse({}).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny", email: "a@b.com" }).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny" }).success).toBe(true)
	const parsedInvite = userInvitePayload.safeParse({ email: "  A@B.COM " })
	expect(parsedInvite.success && parsedInvite.data.email).toBe("a@b.com")
})

// one staged file, the smallest attachment either chat payload accepts
const textAttachment = { kind: "text" as const, name: "notes.txt", text: "hello", keep: false }

// a chat turn or chat room message may be attachments alone, but never nothing at all
test("the chat payloads accept attachments alone and reject an empty send", () => {
	// a question or content may be empty while attachments go with the send
	expect(chatTurnPayload.safeParse({ question: "", attachments: [textAttachment] }).success).toBe(true)
	expect(chatRoomMessagePayload.safeParse({ content: "", attachments: [textAttachment] }).success).toBe(true)

	// a send with nothing at all is rejected by both
	expect(chatTurnPayload.safeParse({ question: "" }).success).toBe(false)
	expect(chatRoomMessagePayload.safeParse({ content: "" }).success).toBe(false)
})

// an attachments-only question reads as the note alone, with no leading blank lines
test("withAttachmentNote stands alone on an empty question", () => {
	expect(withAttachmentNote("", [{ name: "a.pdf" }])).toBe("[attached: a.pdf]")
})

// the attachment note comes off the way withAttachmentNote put it on, leaving an attachments-only question empty
test("withoutAttachmentNote drops the note that withAttachmentNote writes", () => {
	expect(withoutAttachmentNote(withAttachmentNote("what is this?", [{ name: "a.png" }]))).toBe("what is this?")
	expect(withoutAttachmentNote(withAttachmentNote("", [{ name: "a.pdf" }]))).toBe("")

	// a file name with a bracket in it still leaves the note whole
	expect(withoutAttachmentNote(withAttachmentNote("compare these", [{ name: "report [v2].pdf" }]))).toBe(
		"compare these",
	)
})

// a partial update where one field alone is enough, and an unknown visibility is still rejected
test("updateTopicFieldsPayload takes a name or a visibility alone and rejects an empty call", () => {
	expect(updateTopicFieldsPayload.safeParse({ name: "Where to hoop" }).success).toBe(true)
	expect(updateTopicFieldsPayload.safeParse({ visibility: "private" }).success).toBe(true)
	expect(updateTopicFieldsPayload.safeParse({ visibility: "secret" }).success).toBe(false)
	expect(updateTopicFieldsPayload.safeParse({}).success).toBe(false)
})

// a tool that returned more than the payload accepts must not reject every later question in that conversation
test("a long tool call output is clipped to what the chat turn payload accepts", () => {
	const longToolCall = {
		toolName: "searchWeb",
		input: { query: "sleep" },
		output: "x".repeat(CHAT_HISTORY_ANSWER_CHARS + 2_000),
	}
	const sentToolCall = toSentToolCall(longToolCall)
	expect(sentToolCall.output.length).toBeLessThanOrEqual(CHAT_HISTORY_ANSWER_CHARS)
	expect(sentToolCall.output.endsWith("\u2026")).toBe(true)
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [sentToolCall] }],
		}).success,
	).toBe(true)

	// the same payload with the raw call is what the validator rejects
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [longToolCall] }],
		}).success,
	).toBe(false)

	// a call already inside the limit is returned untouched
	const shortToolCall = { toolName: "draftTopic", input: {}, output: "The draft now reads: Sourdough" }
	expect(toSentToolCall(shortToolCall)).toBe(shortToolCall)
})

// an input past its own limit rejects the payload just as an output does, and a tool that takes a list of sources
// or a whole prompt can write one
test("a long tool call input is dropped, keeping the output that says what the call did", () => {
	const longInputToolCall = {
		toolName: "draftTopic",
		input: { sources: "x".repeat(CHAT_HISTORY_TOOL_CALL_INPUT_CHARS + 1_000) },
		output: "The draft now reads: Sourdough",
	}
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [longInputToolCall] }],
		}).success,
	).toBe(false)
	const sentToolCall = toSentToolCall(longInputToolCall)
	expect(sentToolCall.input).toBeNull()
	expect(sentToolCall.output).toBe("The draft now reads: Sourdough")
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [sentToolCall] }],
		}).success,
	).toBe(true)
})

// one turn may call more tools than the payload replays, as a consent that swaps every source does. the whole
// conversation would otherwise reject every later question
test("a turn's tool calls are clipped to the count the payload accepts, newest kept", () => {
	const toolCalls = Array.from({ length: CHAT_HISTORY_TOOL_CALLS + 3 }, (_, index) => ({
		toolName: "addSource",
		input: { value: `r/hoops${index}` },
		output: `Carl added reddit — r/hoops${index}.`,
	}))
	expect(
		chatTurnPayload.safeParse({
			question: "what did you change?",
			history: [{ question: "yes", answer: "Saved.", toolCalls }],
		}).success,
	).toBe(false)
	const sentToolCalls = toSentToolCalls(toolCalls)
	expect(sentToolCalls).toHaveLength(CHAT_HISTORY_TOOL_CALLS)
	expect(sentToolCalls.at(-1)?.output).toBe(`Carl added reddit — r/hoops${CHAT_HISTORY_TOOL_CALLS + 2}.`)
	expect(
		chatTurnPayload.safeParse({
			question: "what did you change?",
			history: [{ question: "yes", answer: "Saved.", toolCalls: sentToolCalls }],
		}).success,
	).toBe(true)
})

// the proposal a yes answers. one already saved is spent, so a later yes to anything else forces no save
test("a topic edit proposal stands until it is cancelled or saved", () => {
	const proposeCall = { toolName: "proposeTopicEdit", input: { tags: ["Testing"] }, output: "Proposed." }
	const toToolCall = (toolName: string): ChatToolCall => ({ toolName, input: {}, output: "" })
	expect(toStandingTopicEditCall([])).toBeNull()
	expect(toStandingTopicEditCall([toToolCall("searchWeb")])).toBeNull()
	expect(toStandingTopicEditCall([proposeCall])).toBe(proposeCall)

	// a search between the two leaves the proposal standing, since it saves nothing
	expect(toStandingTopicEditCall([proposeCall, toToolCall("searchWeb")])).toBe(proposeCall)
	expect(toStandingTopicEditCall([proposeCall, toToolCall("cancelTopicEdit")])).toBeNull()
	for (const savingToolName of TOPIC_SAVE_TOOL_NAMES) {
		expect(toStandingTopicEditCall([proposeCall, toToolCall(savingToolName)])).toBeNull()
	}

	// a proposal made after a save is standing again
	expect(toStandingTopicEditCall([proposeCall, toToolCall("addSource"), proposeCall])).toBe(proposeCall)
})

// a failed attachment tells its owner why for each reason the owner can act on, and says Carl couldn't read the file
// otherwise
test("toAttachmentFailureMessage names a file with no text and a flagged file", () => {
	expect(toAttachmentFailureMessage(ATTACHMENT_NO_TEXT_REASON)).toContain("no text")
	expect(toAttachmentFailureMessage("flagged by the scanner: PromptInjection")).toContain("flagged")
	expect(toAttachmentFailureMessage("S3 GetObject failed")).toBe("Carl couldn't read this one.")
	expect(toAttachmentFailureMessage(null)).toBe("Carl couldn't read this one.")
})

// a question asked from the podcast player ends with a note naming the podcast episode, the chapter, and the speaker
// who answered, read back by its parts. the chapter title is cut, and a question with no note or a note naming no
// speaker is whole
test("withPodcastEpisodeNote writes the podcast episode note and toPodcastEpisodeNoteParts reads it back", () => {
	const notedQuestion = withPodcastEpisodeNote("what did he mean by that?", TEST_PODCAST_EPISODE_NOTE)
	expect(notedQuestion).toBe(
		'what did he mean by that?\n\n[asked while listening to "Grinders get quiet", chapter 3, "The burr set"; Vienna answered]',
	)
	expect(toPodcastEpisodeNoteParts(notedQuestion)).toEqual({
		question: "what did he mean by that?",
		podcastEpisodeNote: TEST_PODCAST_EPISODE_NOTE,
	})

	// carl's answer names carl, and a long chapter title is cut to its limit
	const longChapterTitle = "a".repeat(PODCAST_EPISODE_NOTE_CHAPTER_TITLE_CHARS + 30)
	const carlNotedQuestion = withPodcastEpisodeNote("what did it say?", {
		...TEST_PODCAST_EPISODE_NOTE,
		chapterTitle: longChapterTitle,
		speaker: "host",
	})
	expect(carlNotedQuestion).toContain("; Carl answered]")
	expect(toPodcastEpisodeNoteParts(carlNotedQuestion).podcastEpisodeNote?.chapterTitle).toHaveLength(
		PODCAST_EPISODE_NOTE_CHAPTER_TITLE_CHARS,
	)

	// a typed question, and a note that names no host, stay whole
	expect(toPodcastEpisodeNoteParts("who is hiring?")).toEqual({ question: "who is hiring?", podcastEpisodeNote: null })
	const forgedQuestion = 'hi\n\n[asked while listening to "x", chapter 1, "y"; Bob answered]'
	expect(toPodcastEpisodeNoteParts(forgedQuestion).podcastEpisodeNote).toBeNull()
})

// a chapter reference past any podcast episode's chapters, or an id past any podcast episode id, is rejected before the
// lookup
test("podcastEpisodeChapterPayload bounds the chapter position and the podcast episode id", () => {
	expect(podcastEpisodeChapterPayload.safeParse({ podcastEpisodeId: "episode-1", chapterPosition: 2 }).success).toBe(
		true,
	)
	expect(podcastEpisodeChapterPayload.safeParse({ podcastEpisodeId: "episode-1", chapterPosition: 1e15 }).success).toBe(
		false,
	)
	expect(podcastEpisodeChapterPayload.safeParse({ podcastEpisodeId: "e".repeat(65), chapterPosition: 0 }).success).toBe(
		false,
	)
})

// a scan note's source results as the owner reads them: a cost on every result, and a failed result's reason
const OWNER_SCAN_SOURCE_RESULTS: ScanSourceResults = {
	sources: [
		{
			sourceId: "source-1",
			sourceKind: "search",
			label: "web search",
			foundCount: 6,
			keptCount: 2,
			costDollars: 0.031,
			durationMs: 2_400,
			status: "ok",
		},
		{
			sourceId: "source-2",
			sourceKind: "reddit",
			label: "r/typescript",
			foundCount: 4,
			keptCount: 1,
			costDollars: 0,
			durationMs: 900,
			status: "fallback",
			fallbackMode: "reddit-rss",
		},
		{
			sourceId: "source-3",
			sourceKind: "rss",
			label: "example.com",
			foundCount: 0,
			keptCount: 0,
			costDollars: 0,
			durationMs: 120,
			status: "failed",
			reason: "feed returned 404",
		},
	],
	earlierKeptCount: 3,
	earlierFoundCount: 8,
}

// the owner's view includes costs and reasons, and everyone else's view has neither
test("a scan note's source results parse with costs and reasons and without them", () => {
	expect(scanSourceResults.safeParse(OWNER_SCAN_SOURCE_RESULTS).success).toBe(true)
	const visitorScanSourceResults = {
		...OWNER_SCAN_SOURCE_RESULTS,
		sources: OWNER_SCAN_SOURCE_RESULTS.sources.map((sourceResult) =>
			sourceResult.status === "failed"
				? { ...sourceResult, costDollars: null, reason: null }
				: { ...sourceResult, costDollars: null },
		),
	}
	expect(scanSourceResults.safeParse(visitorScanSourceResults).success).toBe(true)
})

// a skipped Source never leaves the api, so the wire shape has no skipped member
test("a skipped source result is rejected on the wire", () => {
	const skippedSourceResult = {
		sourceId: "source-4",
		sourceKind: "url",
		label: "example.com",
		foundCount: 0,
		keptCount: 0,
		costDollars: 0,
		durationMs: 0,
		status: "skipped",
	}
	const scanSourceResultsResult = scanSourceResults.safeParse({
		...OWNER_SCAN_SOURCE_RESULTS,
		sources: [...OWNER_SCAN_SOURCE_RESULTS.sources, skippedSourceResult],
	})
	expect(scanSourceResultsResult.success).toBe(false)
})

// a malformed results value costs only the chart, and the note keeps Carl's summary
test("a scan note with malformed source results keeps its summary and parses the results to null", () => {
	const parsedScanNote = scanNote.parse({ scanSummary: "Carl's notes", sourceResults: { sources: "not a list" } })
	expect(parsedScanNote).toEqual({ scanSummary: "Carl's notes", sourceResults: null })
	expect(scanNote.parse({ scanSummary: null, sourceResults: OWNER_SCAN_SOURCE_RESULTS }).sourceResults).toEqual(
		OWNER_SCAN_SOURCE_RESULTS,
	)
})
