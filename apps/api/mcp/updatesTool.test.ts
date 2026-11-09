// the read_updates tool: a visitor, a user, a bound route, a Topic the user may not read, and the text a host without an
// MCP view reads
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import { SITE_URL } from "@carlnotes/contracts/site"
import { EMPTY_UPDATES_TEXT, type Updates, type UpdatesFinding } from "@carlnotes/contracts/updates"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { UNTRUSTED_DATA_TAG } from "@carlnotes/models/prompts/write"
import type { BuiltUpdates } from "../topic/updates"
import * as updates from "../topic/updates"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { type RegisteredToolHandler, toRegisteredTools, toResultText, USER, VISITOR } from "./toolTestFixtures"
import { toUpdatesText } from "./updatesTool"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a Finding of the list
const FINDING = {
	findingId: "finding-1",
	title: "Dialing in",
	url: "https://example.com/dialing-in",
	topicName: "Espresso",
	relevanceExplanation: "It settles the grind question.",
} as UpdatesFinding

// a list with one Finding and more behind it
const UPDATES_RESULT: BuiltUpdates = {
	opener: "Carl's line.",
	findings: [FINDING],
	moreCount: 12,
	morePath: "/topics",
	topics: [
		{ id: "topic-1", name: "Espresso", prompt: "Grinders", visibility: "public", canRate: true, canBookmark: true },
	],
	podcastEpisodes: [],
}

// the read_updates handler a caller gets
function toUpdatesHandler(...registeredToolOptions: Parameters<typeof toRegisteredTools>): RegisteredToolHandler {
	const handler = toRegisteredTools(...registeredToolOptions).get("read_updates")?.handler
	if (!handler) {
		throw new Error("read_updates is not registered")
	}
	return handler
}

test("a visitor reads that an account is needed, and nothing is built", async () => {
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const toolResult = await toUpdatesHandler(VISITOR)({})
	expect(toResultText(toolResult)).toBe(CONNECT_ACCOUNT_TEXT)
	expect(buildSpy).not.toHaveBeenCalled()
})

test("a user's call with no arguments builds a 15 minute list across Topics", async () => {
	stubConnectionPool()
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const toolResult = await toUpdatesHandler(USER)({})
	expect(buildSpy.mock.calls[0]?.[0]).toMatchObject({ userId: "user-1", minutes: 15, topicId: null })
	expect(toResultText(toolResult)).toContain("It settles the grind question.")
})

test("the model reads a fenced list, and the plain list and the rows' Topics go to the MCP view", async () => {
	stubConnectionPool()
	spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const toolResult = await toUpdatesHandler(USER)({})
	const { topics, podcastEpisodes, ...updatesList } = UPDATES_RESULT

	// each text a page or a model wrote sits inside a fence, in the structured copy and in the text
	const { opener, findings } = toolResult.structuredContent as Updates
	const { title, url, topicName, relevanceExplanation } = findings[0] as UpdatesFinding
	for (const fencedText of [opener, title, url, topicName, relevanceExplanation]) {
		expect(fencedText).toStartWith(`<${UNTRUSTED_DATA_TAG}-`)
	}
	expect(toResultText(toolResult)).toContain(`Topic: <${UNTRUSTED_DATA_TAG}-`)

	// the MCP view reads the list as written
	const mcpViewData = toolResult._meta?.[MCP_VIEW_META_KEY] as McpViewData
	expect(mcpViewData.updates).toEqual(updatesList)
	expect(mcpViewData.updatesTopics).toEqual(topics)
	expect(mcpViewData.podcastEpisodes).toEqual(podcastEpisodes)
})

test("a user's call passes its length and its Topic", async () => {
	stubConnectionPool()
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	await toUpdatesHandler(USER)({ minutes: 5, topic_id: "topic-1" })
	expect(buildSpy.mock.calls[0]?.[0]).toMatchObject({ minutes: 5, topicId: "topic-1" })
})

test("a bound route's call covers the bound Topic", async () => {
	stubConnectionPool()
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	await toUpdatesHandler(USER, "topic-1")({})
	expect(buildSpy.mock.calls[0]?.[0]).toMatchObject({ topicId: "topic-1" })
})

test("a bound route rejects another Topic without reading it", async () => {
	const sentQueries = stubConnectionPool()
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const toolResult = await toUpdatesHandler(USER, "topic-1")({ topic_id: "topic-2" })
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toContain("bound to one topic")
	// the rejection builds no list and sends no query
	expect(buildSpy).not.toHaveBeenCalled()
	expect(sentQueries).toEqual([])
})

test("a Topic the user may not read reads as a missing one", async () => {
	spyOn(updates, "buildUpdates").mockResolvedValue(null)
	const toolResult = await toUpdatesHandler(USER)({ topic_id: "private-topic" })
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toBe("No readable topic has that id.")
})

test("the text holds the opener, each Finding's title, Topic, link, and explanation, and the more link", () => {
	const text = toUpdatesText(UPDATES_RESULT)
	for (const expectedText of [
		"Carl's line.",
		"1. Dialing in",
		"Topic: Espresso",
		"https://example.com/dialing-in",
		"It settles the grind question.",
		`And 12 more: ${SITE_URL}/`,
	]) {
		expect(text).toContain(expectedText)
	}
})

test("a list with no opener and nothing more reads as its Findings alone", () => {
	const text = toUpdatesText({ ...UPDATES_RESULT, opener: null, moreCount: 0 })
	expect(text.startsWith("1. Dialing in")).toBe(true)
	expect(text).not.toContain("more:")
})

test("a Finding with no title reads as its link", () => {
	expect(toUpdatesText({ ...UPDATES_RESULT, findings: [{ ...FINDING, title: null }] })).toContain(`1. ${FINDING.url}`)
})

test("an empty list reads as the empty line", () => {
	expect(toUpdatesText({ ...UPDATES_RESULT, findings: [], moreCount: 0 })).toBe(EMPTY_UPDATES_TEXT)
})

test("the text of a full list fits the page", () => {
	// each Finding's json is longer than its text, so a list packed by json fits as text
	const finding = { ...FINDING, resourceId: "resource-1", scanId: "scan-1", topicPath: "/topics/topic-1/espresso" }
	expect(toUpdatesText({ ...UPDATES_RESULT, findings: [finding] }).length).toBeLessThan(
		JSON.stringify(finding).length + 80,
	)
})
