// the mcp edit_topic flow: an edit saves each field through the chat's save path, and making a topic public or removing
// a source waits for a confirmation issued for that edit over the topic as it stands
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ProposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import * as topicSourceTools from "../tool/topicSourceTools"
import * as topicTools from "../tool/topicTools"
import * as topics from "../topic/topics"
import { toMcpAnalyticsProperties } from "./toolCaller"
import { isTopicEditConfirmed, TOPIC_EDIT_CONFIRMATION_LIFETIME_MS } from "./topicEditConfirmations"
import { type EditTopicOptions, editTopic, toEditableTopicFields } from "./topicEdits"

// an invite topic the user may edit, with a web search source and a reddit source
const TOPIC_PAGE = {
	id: "topic-1",
	name: "Agents",
	prompt: "AI agents at work",
	visibility: "invite",
	team: null,
	tags: ["ai"],
	frequency: "weekly",
	scheduledTime: "09:00",
	scheduledDayOfWeek: "wednesday",
	maxTopicFindings: 10,
	podcast: { isEnabled: true },
	sources: [
		{ id: "source-1", sourceKind: "search", summary: "" },
		{ id: "source-2", sourceKind: "reddit", summary: "r/agents" },
	],
	invites: [],
	canEdit: true,
} as unknown as TopicResponse

// the user who may edit the topic, connected through an app
const USER = { kind: "user" as const, userId: "user-1", plan: "free", clientName: "test-app" }

// the topic page each read returns, which a test changes to stand for an edit made elsewhere
let topicPage: TopicResponse

// the saving tools, each stubbed to save
let updateTopicPromptSpy: ReturnType<typeof spyOn<typeof topicTools, "updateTopicPrompt">>
let updateTopicFieldsSpy: ReturnType<typeof spyOn<typeof topicTools, "updateTopicFields">>
let addTopicSourceSpy: ReturnType<typeof spyOn<typeof topicSourceTools, "addTopicSource">>
let removeTopicSourceSpy: ReturnType<typeof spyOn<typeof topicSourceTools, "removeTopicSource">>

// the auth secret the confirmation signs with, the topic read, and saving tools that save
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	topicPage = TOPIC_PAGE
	spyOn(topics, "loadTopicPage").mockImplementation(async () => topicPage)
	updateTopicPromptSpy = spyOn(topicTools, "updateTopicPrompt").mockResolvedValue({
		status: "saved",
		topicName: "Agents",
	})
	updateTopicFieldsSpy = spyOn(topicTools, "updateTopicFields").mockResolvedValue({
		status: "saved",
		topicName: "Agents",
	})
	addTopicSourceSpy = spyOn(topicSourceTools, "addTopicSource").mockResolvedValue({
		status: "saved",
		topicSourceLabel: "Hacker News",
		topicSourceCostDelta: { perScanCents: 1, perMonthCents: 4 },
	} as never)
	removeTopicSourceSpy = spyOn(topicSourceTools, "removeTopicSource").mockImplementation(async () => {
		// the removal takes the source off the topic the next read returns
		topicPage = { ...topicPage, sources: topicPage.sources.filter((topicSource) => topicSource.id !== "source-2") }
		return { status: "saved", topicSourceLabel: "r/agents" } as never
	})
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// an edit as the user who may edit the topic
function toEditTopicOptions(topicEdit: ProposeTopicEditPayload, confirmation: string | null = null): EditTopicOptions {
	return {
		userId: "user-1",
		topicId: "topic-1",
		topicEdit,
		confirmation,
		analyticsProperties: toMcpAnalyticsProperties(USER),
	}
}

test("an edit saves each field through the chat's save path with the mcp origin", async () => {
	const editTopicResult = await editTopic(
		toEditTopicOptions({
			name: "Agents at work",
			tags: ["ai", "work"],
			frequency: "daily",
			scheduledTime: "07:30",
			scheduledDayOfWeek: "monday",
			maxTopicFindings: 15,
			isPodcastEnabled: false,
			prompt: "AI agents in the workplace",
			addSources: [{ sourceOption: "rss", value: "https://news.ycombinator.com/rss" }],
		}),
	)

	// the prompt, the settings in one save, then the added source, each with the mcp origin
	expect(editTopicResult.status).toBe("saved")
	expect(updateTopicPromptSpy).toHaveBeenCalledWith(
		expect.objectContaining({ prompt: "AI agents in the workplace", origin: "mcp" }),
	)
	expect(updateTopicFieldsSpy).toHaveBeenCalledWith(
		expect.objectContaining({
			topicFields: {
				name: "Agents at work",
				tags: ["ai", "work"],
				frequency: "daily",
				scheduledTime: "07:30",
				scheduledDayOfWeek: "monday",
				maxTopicFindings: 15,
				isPodcastEnabled: false,
			},
			promptVersionOrigin: "mcp",
		}),
	)
	expect(addTopicSourceSpy).toHaveBeenCalledWith(expect.objectContaining({ sourceOption: "rss", origin: "mcp" }))
})

test("the result shows the topic before and after, and names each save", async () => {
	// a new frequency, saved
	const editTopicResult = await editTopic(toEditTopicOptions({ frequency: "daily" }))
	if (editTopicResult.status !== "saved") {
		throw new Error(`expected a save, got ${editTopicResult.status}`)
	}

	// the old frequency before, and the save's own line
	expect(editTopicResult.beforeTopicDraft.frequency).toBe("weekly")
	expect(editTopicResult.serverToolCallOutputs).toEqual(["Saved the settings for Agents."])
	expect(editTopicResult.savedLines).toEqual(["Carl saved the topic's settings."])
})

test("a rejected save is named beside the saves that went through", async () => {
	// a daily frequency the plan cannot hold, beside a new prompt
	updateTopicFieldsSpy.mockResolvedValue({ status: "dailyFrequency", limit: 1 })
	const editTopicResult = await editTopic(
		toEditTopicOptions({ prompt: "AI agents in the workplace", frequency: "daily" }),
	)
	if (editTopicResult.status !== "saved") {
		throw new Error(`expected a save, got ${editTopicResult.status}`)
	}

	// the prompt saved, and the frequency named as rejected
	expect(editTopicResult.savedLines).toEqual(["Carl saved the new prompt."])
	expect(editTopicResult.rejectedLines).toHaveLength(1)
})

test("a user who may not edit the topic gets no fields and nothing is saved", async () => {
	topicPage = { ...TOPIC_PAGE, canEdit: false }
	expect(await editTopic(toEditTopicOptions({ frequency: "daily" }))).toEqual({ status: "forbidden" })
	expect(updateTopicFieldsSpy).not.toHaveBeenCalled()
})

test("going public saves nothing at first, and the confirmation saves it", async () => {
	// the first call previews the topic as public and returns a confirmation
	const previewResult = await editTopic(toEditTopicOptions({ visibility: "public" }))
	if (previewResult.status !== "confirmRequired") {
		throw new Error(`expected a preview, got ${previewResult.status}`)
	}
	expect(previewResult.topicEditConfirmationReasons).toEqual(["goesPublic"])
	expect(previewResult.topicEditChanges).toEqual(["makes the topic public, so anyone can read it"])
	expect(previewResult.afterTopicDraft.visibility).toBe("public")
	expect(updateTopicFieldsSpy).not.toHaveBeenCalled()

	// the same edit with the confirmation saves
	const confirmedResult = await editTopic(toEditTopicOptions({ visibility: "public" }, previewResult.confirmation))
	expect(confirmedResult.status).toBe("saved")
	expect(updateTopicFieldsSpy).toHaveBeenCalledWith(expect.objectContaining({ topicFields: { visibility: "public" } }))
})

test("removing a source needs a confirmation, which saves once", async () => {
	// the preview names the source, and nothing is removed
	const previewResult = await editTopic(toEditTopicOptions({ removeSourceIds: ["source-2"] }))
	if (previewResult.status !== "confirmRequired") {
		throw new Error(`expected a preview, got ${previewResult.status}`)
	}
	expect(previewResult.topicEditConfirmationReasons).toEqual(["removesSources"])
	expect(previewResult.removeSourceIds).toEqual(["source-2"])
	expect(previewResult.topicEditChanges).toEqual(["removes reddit r/agents"])
	expect(removeTopicSourceSpy).not.toHaveBeenCalled()

	// the confirmation removes it, and the same confirmation again matches no topic as it now stands
	const confirmation = previewResult.confirmation
	expect((await editTopic(toEditTopicOptions({ removeSourceIds: ["source-2"] }, confirmation))).status).toBe("saved")
	expect((await editTopic(toEditTopicOptions({ removeSourceIds: ["source-2"] }, confirmation))).status).toBe(
		"confirmRequired",
	)
	expect(removeTopicSourceSpy).toHaveBeenCalledTimes(1)
})

test("a confirmation for one edit does not save another", async () => {
	const previewResult = await editTopic(toEditTopicOptions({ removeSourceIds: ["source-2"] }))
	const confirmation = previewResult.status === "confirmRequired" ? previewResult.confirmation : ""
	const otherEditResult = await editTopic(toEditTopicOptions({ removeSourceIds: ["source-1"] }, confirmation))
	expect(otherEditResult.status).toBe("confirmRequired")
	expect(removeTopicSourceSpy).not.toHaveBeenCalled()
})

test("an edit made elsewhere since the preview voids its confirmation", async () => {
	const previewResult = await editTopic(toEditTopicOptions({ visibility: "public" }))
	const confirmation = previewResult.status === "confirmRequired" ? previewResult.confirmation : ""

	// the prompt changes on the page before the confirming call
	topicPage = { ...TOPIC_PAGE, prompt: "AI agents, edited on the page" }
	const staleResult = await editTopic(toEditTopicOptions({ visibility: "public" }, confirmation))
	expect(staleResult.status).toBe("confirmRequired")
	expect(updateTopicFieldsSpy).not.toHaveBeenCalled()
})

test("a confirmation expires after fifteen minutes", async () => {
	const previewResult = await editTopic(toEditTopicOptions({ visibility: "public" }))
	const confirmation = previewResult.status === "confirmRequired" ? previewResult.confirmation : ""
	const topicEditConfirmationOptions = {
		userId: "user-1",
		topicId: "topic-1",
		topicEdit: { visibility: "public" as const },
		editableTopicFields: toEditableTopicFields(TOPIC_PAGE),
	}
	expect(isTopicEditConfirmed(topicEditConfirmationOptions, confirmation)).toBe(true)
	const afterExpiry = Date.now() + TOPIC_EDIT_CONFIRMATION_LIFETIME_MS + 1000
	expect(isTopicEditConfirmed(topicEditConfirmationOptions, confirmation, afterExpiry)).toBe(false)
	expect(isTopicEditConfirmed(topicEditConfirmationOptions, "not-a-confirmation")).toBe(false)
})

test("an edit with neither change saves on its first call", async () => {
	const editTopicResult = await editTopic(
		toEditTopicOptions({
			prompt: "AI agents in the workplace",
			addSources: [{ sourceOption: "rss", value: "https://news.ycombinator.com/rss" }],
		}),
	)
	expect(editTopicResult.status).toBe("saved")
	expect(updateTopicPromptSpy).toHaveBeenCalledTimes(1)
	expect(addTopicSourceSpy).toHaveBeenCalledTimes(1)
})
