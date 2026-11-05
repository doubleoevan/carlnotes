// real Drizzle reads and deterministic embeddings exercise privacy, context, and complete routing
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import * as keys from "@carlnotes/models/litellm"
import * as models from "@carlnotes/models/models"
import { EMAIL_TOPIC_RELEVANCE_FLOOR, matchPersonalSourcesTopics } from "./matchTopics"

const payload = { title: "Coffee", summary: "private-routing-canary", links: ["https://example.com/roasting"] }
const queryVector = toVector(1)
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// use unit vectors so each synthetic relevance score is a real cosine calculation
function toVector(score: number): number[] {
	return Array.from({ length: EMBED_DIMENSIONS }, (_, index) =>
		index === 0 ? score : index === 1 ? Math.sqrt(1 - score ** 2) : 0,
	)
}

// match the selected candidate fields while keeping ready attachment text separate from the returned prompt
function topicRow(
	id: string,
	visibility: "private" | "public" | "invite" = "private",
	context = "Ready attachment context",
): unknown[] {
	return [id, id, "Roasting", context, visibility, null, 3]
}

// supply candidate pages and rechecks through the actual SQL decoder
function stubPages(
	pages: unknown[][][],
	key: string | null = "fixture-owner-key",
): ReturnType<typeof stubConnectionPool> {
	let pageIndex = 0
	return stubConnectionPool((query) => {
		if (query.text.startsWith('select "litellm_virtual_key" from "users"')) {
			return [[key]]
		}
		return pages[Math.min(pageIndex++, pages.length - 1)] ?? []
	})
}

// preserve the query vector and assign a controlled candidate score by its text
function stubEmbeddings(score: (text: string) => number = () => 0.8): Mock<typeof models.embedPrivateVectors> {
	return spyOn(models, "embedPrivateVectors").mockImplementation(async (texts) =>
		texts.map((text) => (text.includes("private-routing-canary") ? queryVector : toVector(score(text)))),
	)
}

test("empty candidates skip key provisioning and all embedding work", async () => {
	const queries = stubPages([[]])
	const provision = spyOn(keys, "loadOrProvisionUserLiteLLMKey")
	const embed = spyOn(models, "embedPrivateVectors")
	expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({
		status: "matched",
		topics: [],
		totalCount: 0,
	})
	expect(provision).not.toHaveBeenCalled()
	expect(embed).not.toHaveBeenCalled()
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain('from "users"')
})

test("editable private and public Topics rank by content; following grants no matching authority", async () => {
	const rows = [topicRow("editable"), topicRow("public-owned", "public"), topicRow("weak")]
	const queries = stubPages([rows, rows.slice(0, 2)])
	const embed = stubEmbeddings((text) => (text.startsWith("public") ? 0.95 : text.startsWith("weak") ? 0.5 : 0.8))
	const result = await matchPersonalSourcesTopics({ userId: "owner", payload })
	expect(
		result.status === "matched" && result.topics.map(({ id, group, visibility }) => [id, group, visibility]),
	).toEqual([
		["public-owned", "editable", "public"],
		["editable", "editable", "private"],
	])
	expect(result.status === "matched" && result.totalCount).toBe(2)
	expect(embed.mock.calls[1]?.[0]).toContain("editable\nRoasting\nReady attachment context")
	expect(JSON.stringify(result)).not.toContain("Ready attachment context")
	expect(JSON.stringify(result)).not.toContain("private-routing-canary")
	expect(queries.every((query) => query.text.startsWith("select "))).toBe(true)
	expect(JSON.stringify(queries)).not.toContain("private-routing-canary")
	// neither the first read nor the final rights recheck may let public visibility or a subscription grant access
	const candidateQueries = queries.filter((query) => query.text.includes("string_agg"))
	expect(candidateQueries).toHaveLength(2)
	for (const { text } of candidateQueries) {
		expect(text).toContain('"attachments"."status" = \'ready\'')
		expect(text).toContain('"users"."role" = \'admin\'')
		expect(text).toContain('"topics"."owner_id" = $')
		expect(text).toContain('"team_members"."is_active" = true')
		expect(text).not.toContain('"subscriptions"')
		expect(text).not.toContain('"topics"."visibility" =')
		expect(text).not.toContain("topic_vectors")
		expect(text).not.toContain("personal_source_contexts")
	}
})

test("the picker includes weak editable Topics of every visibility and checks only strong matches", async () => {
	const rows = [
		topicRow("strong"),
		topicRow("weak"),
		topicRow("public-owned", "public"),
		topicRow("weak-invite", "invite"),
	]
	stubPages([rows, rows])
	stubEmbeddings((text) => (text.startsWith("weak") ? 0.4 : text.startsWith("public") ? 0.95 : 0.8))
	const result = await matchPersonalSourcesTopics({ userId: "owner", payload, includeAllEditableTopics: true })
	expect(result.status === "matched" && result.topics.map((topic) => topic.id)).toEqual([
		"public-owned",
		"strong",
		"weak",
		"weak-invite",
	])
	expect(result.status === "matched" && result.topics.map((topic) => topic.isBestMatch)).toEqual([
		true,
		false,
		false,
		false,
	])
	expect(result.status === "matched" && result.totalCount).toBe(4)
})

test("a picker with only weak matches checks nothing and safely represents negative similarities", async () => {
	const rows = [topicRow("weak"), topicRow("unrelated")]
	stubPages([rows, rows])
	stubEmbeddings((text) => (text.startsWith("weak") ? 0.4 : -0.2))
	const result = await matchPersonalSourcesTopics({ userId: "owner", payload, includeAllEditableTopics: true })
	expect(result.status === "matched" && result.topics.map((topic) => topic.relevance)).toEqual([0.4, 0])
	expect(result.status === "matched" && result.topics.some((topic) => topic.isBestMatch)).toBe(false)
})

test("catalogs beyond 128 candidates return every clear email destination and retain exact cursor totals", async () => {
	const rows = Array.from({ length: 130 }, (_, index) => topicRow(`topic-${String(index).padStart(3, "0")}`))
	const pages = [rows.slice(0, 64), rows.slice(64, 128), rows.slice(128)]
	const queries = stubPages([...pages, ...pages])
	const embed = stubEmbeddings()
	const result = await matchPersonalSourcesTopics({ userId: "owner", payload, limit: null })
	expect(result.status === "matched" && result.topics.length).toBe(130)
	expect(result.status === "matched" && result.totalCount).toBe(130)
	expect(embed.mock.calls.every(([texts]) => texts.length <= 64)).toBe(true)
	expect(queries.some((query) => query.text.includes('"topics"."id" >'))).toBe(true)

	// paging slices the complete deterministic ranking, with three defaults on its first page only
	stubPages([...pages, ...pages])
	const page = await matchPersonalSourcesTopics({ userId: "owner", payload, offset: 20, limit: 21 })
	expect(page.status === "matched" && page.topics[0]?.id).toBe("topic-020")
	expect(page.status === "matched" && page.topics.length).toBe(21)
	expect(page.status === "matched" && page.totalCount).toBe(130)
	expect(page.status === "matched" && page.topics.some((topic) => topic.isBestMatch)).toBe(false)
})

test("late email sections contribute a match without persisting or returning their text", async () => {
	stubPages([[topicRow("late-topic")]])
	const embed = spyOn(models, "embedPrivateVectors").mockImplementation(async (texts) =>
		texts.map((text) =>
			text.includes("late-section-canary") || text.startsWith("late-topic") ? toVector(0) : queryVector,
		),
	)
	const result = await matchPersonalSourcesTopics({
		userId: "owner",
		payload: { title: "Email", summary: `${"a".repeat(9000)}late-section-canary`, links: [] },
	})
	expect(result.status === "matched" && result.topics[0]?.id).toBe("late-topic")
	expect(embed.mock.calls[0]?.[0].length).toBe(2)
	expect(embed.mock.calls.flatMap(([texts]) => texts).every((text) => text.length <= 8000)).toBe(true)
	expect(JSON.stringify(result)).not.toContain("late-section-canary")
})

test("case-insensitive fuzzy hints boost relevant names but never force weak content", async () => {
	const queries = stubPages([
		[topicRow("Coffee roasting"), topicRow("Tea"), topicRow("Cofee unrelated")],
		[topicRow("Coffee roasting"), topicRow("Tea")],
	])
	stubEmbeddings((text) => (text.startsWith("Cofee unrelated") ? 0.5 : text.startsWith("Tea") ? 0.8 : 0.7))
	const result = await matchPersonalSourcesTopics({
		userId: "owner",
		payload,
		topicNameHints: ["COFEE"],
		minimumRelevance: EMAIL_TOPIC_RELEVANCE_FLOOR,
	})
	expect(result.status === "matched" && result.topics.map((topic) => topic.id).sort()).toEqual([
		"Coffee roasting",
		"Tea",
	])
	expect(JSON.stringify(queries)).not.toContain("COFEE")
})

test("permission loss removes a destination and changed matching context returns unavailable", async () => {
	stubPages([[topicRow("editable")], []])
	stubEmbeddings()
	expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({
		status: "matched",
		totalCount: 0,
		topics: [],
	})
	stubPages([[topicRow("editable")], [topicRow("editable", "private", "Changed attachment")]])
	expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({ status: "unavailable" })
})

test("missing keys, malformed vectors, and model failures return no partial suggestions", async () => {
	stubPages([[topicRow("editable")]], null)
	const embed = spyOn(models, "embedPrivateVectors")
	expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({ status: "unavailable" })
	expect(embed).not.toHaveBeenCalled()
	for (const invalid of [[], [[1]], [[Number.NaN]], [Array(EMBED_DIMENSIONS).fill(0)]]) {
		stubPages([[topicRow("editable")]])
		embed.mockResolvedValue(invalid)
		expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({ status: "unavailable" })
	}
	embed.mockRejectedValue(new Error("private-routing-canary"))
	expect(await matchPersonalSourcesTopics({ userId: "owner", payload })).toEqual({ status: "unavailable" })
})

test("literal name search applies to editable candidates while matching content stays stable", async () => {
	const queries = stubPages([[topicRow("50%_")]])
	const embed = stubEmbeddings()
	await matchPersonalSourcesTopics({ userId: "owner", payload: { ...payload, query: "50%_" } })
	const candidateQuery = queries.find((query) => query.text.includes("string_agg"))
	expect(candidateQuery?.text).toContain('"topics"."name" ilike')
	expect(candidateQuery?.values).toContain("%50\\%\\_%")
	expect(embed.mock.calls[0]?.[0]).toEqual(["Coffee\nprivate-routing-canary\nhttps://example.com/roasting"])
})

test("conversation references never enter matching vectors, SQL, or returned suggestions", async () => {
	const queries = stubPages([[topicRow("editable")]])
	const embed = stubEmbeddings()
	const chat_url = "https://chatgpt.com/c/private-backlink-canary"
	const result = await matchPersonalSourcesTopics({ userId: "owner", payload: { ...payload, chat_url } })
	expect(result.status).toBe("matched")
	expect(JSON.stringify(embed.mock.calls)).not.toContain(chat_url)
	expect(JSON.stringify(queries)).not.toContain(chat_url)
	expect(JSON.stringify(result)).not.toContain(chat_url)
})
