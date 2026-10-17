// new-topic chat tool tests for the tool list, the draft writes, the team check before an agreed create, and the
// tool text
import { expect, test } from "bun:test"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/topicPayloads"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import type { ChatTurnToolCalls } from "./chatTools"
import {
	createTopicInChat,
	TEAM_MISSING_TEXT,
	toCreateTopicReason,
	toCreateTopicText,
	toNewTopicChatTools,
	toSuggestionsText,
} from "./newTopicChatTools"

// the new-topic chat's saving tools are draftTopic alone: no tool creates the topic, and the suggestion tool is bound
// apart from them
test("the new-topic chat offers draftTopic and no create tool, without the suggestion tool", () => {
	const topicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT }
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls: { count: 0, topicSaves: [], topicSaveRejections: [] },
		topicDraft,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(Object.keys(newTopicTools)).toEqual(["draftTopic"])
})

// a public or invite draft that names no team is not created, and carl is told to ask which team the topic goes on
test("an agreed create asks for a team before it creates a public or invite topic", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const topicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, name: "Hoops", prompt: "Pickup games", visibility: "invite" }
	const createTopicText = await createTopicInChat({
		userId: "user-1",
		toolCalls,
		topicDraft,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(createTopicText).toBe(TEAM_MISSING_TEXT)
	expect(toolCalls.topicSaves).toEqual([])
})

// draftTopic writes the named fields alone, and an empty value clears a field as the description promises
test("draftTopic writes the named fields, leaves the rest, and clears on an empty value", async () => {
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const topicDraft: TopicDraft = {
		...EMPTY_TOPIC_DRAFT,
		prompt: "Runs after work",
		sources: [{ sourceOption: "reddit", value: "Sourdough" }],
	}
	const newTopicTools = toNewTopicChatTools({
		userId: "user-1",
		toolCalls,
		topicDraft,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	await newTopicTools.draftTopic?.execute?.(
		{ name: "Hoops", visibility: "public" },
		{ toolCallId: "call-1", messages: [], context: undefined },
	)
	expect(topicDraft).toEqual({
		...EMPTY_TOPIC_DRAFT,
		name: "Hoops",
		prompt: "Runs after work",
		visibility: "public",
		sources: [{ sourceOption: "reddit", value: "Sourdough" }],
		isPodcastEnabled: true,
	})
	expect(toolCalls.topicDraft).toEqual(topicDraft)
	expect(toolCalls.count).toBe(1)

	// an empty list clears the sources the call before it left standing
	await newTopicTools.draftTopic?.execute?.({ sources: [] }, { toolCallId: "call-2", messages: [], context: undefined })
	expect(topicDraft.sources).toEqual([])
})

// a new topic draft's podcast starts on, Carl can turn it off, and an instance with no speech model has no podcast
test("draftTopic starts the podcast on, keeps it off once named, and leaves it out with no speech model", async () => {
	const restoreEnvSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL"])
	try {
		// a new-topic chat on an instance with the default speech model
		delete Bun.env.PODCAST_SPEECH_MODEL
		const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
		const topicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT }
		const newTopicTools = toNewTopicChatTools({
			userId: "user-1",
			toolCalls,
			topicDraft,
			analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		})
		const toolCallOptions = { toolCallId: "call-1", messages: [], context: undefined }

		// name the podcast off, then write another field
		await newTopicTools.draftTopic?.execute?.({ isPodcastEnabled: false }, toolCallOptions)
		expect(topicDraft.isPodcastEnabled).toBe(false)
		await newTopicTools.draftTopic?.execute?.({ name: "Hoops" }, toolCallOptions)
		expect(topicDraft.isPodcastEnabled).toBe(false)

		// with the speech model set empty, a draft has no podcast setting
		Bun.env.PODCAST_SPEECH_MODEL = ""
		const draftWithoutPodcast: TopicDraft = { ...EMPTY_TOPIC_DRAFT }
		const toolsWithoutPodcast = toNewTopicChatTools({
			userId: "user-1",
			toolCalls,
			topicDraft: draftWithoutPodcast,
			analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		})
		await toolsWithoutPodcast.draftTopic?.execute?.({ name: "Hoops" }, toolCallOptions)
		expect(draftWithoutPodcast.isPodcastEnabled).toBeUndefined()
	} finally {
		// put the setting back as the environment had it
		restoreEnvSettings()
	}
})

// the create and suggestion text is plain words
test("the create and suggestion text is plain words", () => {
	expect(
		toCreateTopicText({ status: "created", topicId: "topic-1", name: "Hoops", teamName: null, addTeamRejection: null }),
	).toContain("Created Hoops")
	expect(
		toCreateTopicText({
			status: "created",
			topicId: "topic-1",
			name: "Hoops",
			teamName: "Notes of Carl",
			addTeamRejection: null,
		}),
	).toContain("It is on Notes of Carl")
	expect(toCreateTopicText({ status: "incomplete" })).toContain("title and a prompt")
	expect(toCreateTopicText({ status: "inviteeRejected", email: "a@b.co" })).toContain("a@b.co")
	expect(toSuggestionsText({ status: "ok", sources: [{ sourceOption: "reddit", value: "r/hoops" }] })).toContain(
		"- reddit r/hoops",
	)
	expect(toSuggestionsText({ status: "limit" })).toContain("used up")
})

// a rejected create toasts what stopped it, in the reader's own terms
test("a rejected create names what stopped it", () => {
	expect(toCreateTopicReason({ status: "quota" })).toBe("Your plan holds all the topics it allows.")
	expect(toCreateTopicReason({ status: "inviteeRejected", email: "a@b.co" })).toBe("a@b.co doesn't take invites.")
	expect(toCreateTopicReason({ status: "limit", limit: 10 })).toBe("That's more than the 10 sources a topic can have.")
})
