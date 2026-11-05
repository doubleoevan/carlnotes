// exercise registration, shared cursors, result budgets, and side-effect-free routing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { suggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { TOPIC_SUGGESTIONS_PAGE_SIZE } from "@carlnotes/contracts/topicSuggestions"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as matching from "@carlnotes/pipeline/personalSources/matchTopics"
import * as sends from "@carlnotes/pipeline/personalSources/send"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as mcpViewData from "./mcpViewData"
import { registerPersonalSourcesTools } from "./personalSourcesTools"
import { fromCursor, MCP_PAGE_MAX_CHARS, toCursor } from "./results"
import type { RegisterToolsOptions } from "./toolShapes"
import { suggestTopics } from "./topicSuggestions"

// repeat identical content with each cursor and never echo it into a result
const payload = { title: "Coffee", summary: "private-routing-canary", links: ["https://example.com/coffee"] }
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("both routes advertise a read-only suggestion tool and tell agents to wait for the user's choices", async () => {
	const match = spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		topics: [],
		totalCount: 0,
	})
	const send = spyOn(sends, "sendToPersonalSources")
	spyOn(mcpViewData, "loadSuggestionMcpViewData").mockResolvedValue({ session: null, podcastEpisodes: [] })
	for (const routeTopicId of [null, "bound"]) {
		for (const kind of ["visitor", "user"] as const) {
			const registered = new Map<
				string,
				{
					config: { description: string; annotations: { readOnlyHint: boolean } }
					handler: (input: typeof payload) => Promise<CallToolResult>
				}
			>()
			registerPersonalSourcesTools({
				mcpServer: {
					registerTool: (name: string, config: unknown, handler: unknown) =>
						registered.set(name, { config, handler } as never),
				} as unknown as RegisterToolsOptions["mcpServer"],
				toolCaller:
					kind === "user"
						? { kind, userId: "owner", clientId: "client", clientName: "App", plan: "free" }
						: { kind, clientName: "App" },
				routeTopicId,
				clientAddress: null,
			})
			const tool = registered.get("suggest_topics")
			if (!tool) {
				throw new Error("Missing suggestion tool")
			}
			expect(tool.config.annotations.readOnlyHint).toBe(true)
			expect(tool.config.description).toContain("Never call it on your own initiative")
			expect(registered.get("send_to_topic")?.config.description).toContain("Never paste the raw conversation")
			const result = await tool.handler(payload)
			expect(JSON.stringify(result)).not.toContain("private-routing-canary")
			if (kind === "user") {
				expect(result.structuredContent).toMatchObject({
					status: "suggested",
					editableTopics: [],
					publicTopicsToFollow: [],
					nextCursor: null,
				})
				expect(result.structuredContent).toHaveProperty("newPrivateTopic")
			} else {
				expect(JSON.stringify(result)).toContain("connected CarlNotes account")
			}
		}
	}
	expect(match).toHaveBeenCalledTimes(2)
	expect(
		match.mock.calls.every(
			([options]) => options.includeAllEditableTopics && options.limit === TOPIC_SUGGESTIONS_PAGE_SIZE + 1,
		),
	).toBe(true)
	expect(send).not.toHaveBeenCalled()
})

test("all editable Topics traverse five-item cursor pages with a persistent new-Topic offer", async () => {
	const topics = Array.from(
		{ length: 47 },
		(_, index): matching.MatchedTopic => ({
			id: String(index),
			name: `Topic ${index}`,
			prompt: "Roasting",
			url: "https://carlnotes.com/topics/topic",
			group: "editable",
			relevance: 0.99 - index / 1000,
		}),
	)
	spyOn(matching, "matchPersonalSourcesTopics").mockImplementation(async ({ offset = 0 }) => ({
		status: "matched",
		totalCount: topics.length,
		topics: topics.slice(offset, offset + TOPIC_SUGGESTIONS_PAGE_SIZE + 1),
	}))
	const queries = stubConnectionPool((query) => (query.text.includes("date_trunc") ? [["0", 12]] : []))
	const pageCount = Math.ceil(topics.length / TOPIC_SUGGESTIONS_PAGE_SIZE)
	const collected: string[] = []
	let cursor: string | undefined
	for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
		const page = await suggestTopics("owner", { ...payload, cursor })
		if (page.status !== "suggested") {
			throw new Error("Expected suggestions")
		}
		const items = [...page.editableTopics, ...page.publicTopicsToFollow]
		expect(page.pageCount).toBe(pageCount)
		if (pageIndex === 0) {
			expect(page.editableTopics[0]?.weeklyFindingCount).toBe(12)
			expect(page.editableTopics[1]?.weeklyFindingCount).toBe(0)
		}
		expect(page.publicTopicsToFollow).toEqual([])
		expect(items.length).toBeLessThanOrEqual(TOPIC_SUGGESTIONS_PAGE_SIZE)
		expect(JSON.stringify(page).length).toBeLessThan(MCP_PAGE_MAX_CHARS + 1024)
		expect(page.newPrivateTopic?.label).toBe("Start a new topic for this chat")
		collected.push(...items.map((topic) => topic.id))
		if (page.nextCursor) {
			expect(fromCursor(page.nextCursor)).toBe(collected.length)
		}
		cursor = page.nextCursor ?? undefined
	}
	const countQueries = queries.filter((query) => query.text.includes("date_trunc"))
	expect(countQueries).toHaveLength(pageCount)
	for (const query of countQueries) {
		expect(query.text).toContain("date_trunc('week', now() at time zone 'UTC')")
		expect(query.text).toContain('"findings"."rating" is distinct from')
		expect(query.text).toContain('group by "findings"."topic_id"')
		expect(query.values).not.toContain("private-routing-canary")
	}
	expect(cursor).toBeUndefined()
	expect(collected).toEqual(topics.map((topic) => topic.id))
	expect(await suggestTopics("owner", { ...payload, cursor: toCursor(47) })).toMatchObject({
		status: "suggested",
		editableTopics: [],
		publicTopicsToFollow: [],
		nextCursor: null,
	})
})

test("routing rejects malformed, oversized, or identity-bearing requests with the send's content limits", () => {
	for (const invalid of [
		{ ...payload, title: "" },
		{ ...payload, summary: "x".repeat(2001) },
		{ ...payload, links: ["http://127.0.0.1/private"] },
		{ ...payload, topic_id: "other" },
		{ ...payload, chat_url: "javascript:alert(1)" },
	]) {
		expect(suggestTopicsPayload.safeParse(invalid).success).toBe(false)
	}
})

test("empty suggestions skip Finding reads and a character-limited page does not invent an exact page count", async () => {
	const queries = stubConnectionPool(() => [])
	const match = spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		topics: [],
		totalCount: 0,
	})
	expect(await suggestTopics("owner", payload)).toMatchObject({ status: "suggested", pageCount: 1, nextCursor: null })
	expect(queries).toHaveLength(0)

	// pathological legacy names still obey the existing character budget and cursor
	match.mockResolvedValue({
		status: "matched",
		totalCount: 2,
		topics: [0, 1].map((index) => ({
			id: String(index),
			name: "x".repeat(25000),
			prompt: "Roasting",
			url: "https://carlnotes.com/topics/topic",
			group: "editable",
			relevance: 0.8,
		})),
	})
	const page = await suggestTopics("owner", payload)
	expect(page).not.toHaveProperty("pageCount")
	expect(page.status === "suggested" && page.editableTopics.length).toBe(1)
	expect(page.status === "suggested" && page.nextCursor).toBe(toCursor(1))
})

test("autocomplete uses literal editable names, five-result cursors and no content matching", async () => {
	const match = spyOn(matching, "matchPersonalSourcesTopics")
	const queries = stubConnectionPool(() => Array.from({ length: 6 }, (_, index) => [String(index), `Agent ${index}`]))
	const result = await suggestTopics("owner", { ...payload, autocomplete: true, query: "50%_", cursor: toCursor(5) })
	expect(result).toMatchObject({ status: "suggested", nextCursor: toCursor(10), publicTopicsToFollow: [] })
	expect(result.status === "suggested" && result.editableTopics).toHaveLength(5)
	expect(match).not.toHaveBeenCalled()
	const query = queries.find((query) => query.text.includes('from "topics"'))
	if (!query) {
		throw new Error("Missing editable Topic query")
	}
	expect(query.text).toContain('"topics"."owner_id"')
	expect(query.text).toContain('from "users"')
	expect(query.text).toContain('"team_members"."is_active" = true')
	expect(query.text).toContain("ilike")
	expect(query.values).toContain("%50\\%\\_%")
	expect(query.values).not.toContain(payload.summary)
	expect(queries.some((query) => /insert|update|delete/i.test(query.text))).toBe(false)
})
