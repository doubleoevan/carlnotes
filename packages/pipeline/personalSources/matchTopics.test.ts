// real Drizzle reads and deterministic embeddings exercise privacy, context, and complete routing
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import * as keys from "@carlnotes/models/litellm"
import * as models from "@carlnotes/models/models"
import { matchPersonalSourcesTopics } from "./matchTopics"
import { MIN_FILED_TOPIC_RELEVANCE } from "./topicRelevance"

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
		// every other query returns the next page. the last page repeats
		return pages[Math.min(pageIndex++, pages.length - 1)] ?? []
	})
}

// preserve the query vector, keep the default attachment weak, and assign a controlled score by the other texts
function stubEmbeddings(score: (text: string) => number = () => 0.8): Mock<typeof models.embedPrivateVectors> {
	return spyOn(models, "embedPrivateVectors").mockImplementation(async (texts) =>
		texts.map((text) => {
			if (text.includes("private-routing-canary")) {
				return queryVector
			}
			return toVector(text === "Ready attachment context" ? 0.1 : score(text))
		}),
	)
}

// one Topic's scores for its name and prompt, for its attachment context, and for both joined as one text
type ScoredTopic = {
	id: string
	context: string
	nameAndPromptScore: number
	attachmentScore: number
	combinedScore: number
}

// serve each Topic's stored scores, and return the matcher's ranking with each relevance
async function rankScoredTopics(scoredTopics: ScoredTopic[]): Promise<[string, number][]> {
	const rows = scoredTopics.map(({ id, context }) => topicRow(id, "private", context))
	stubPages([rows, rows])
	const scoresByText = new Map(
		scoredTopics.flatMap(({ id, context, nameAndPromptScore, attachmentScore, combinedScore }) => [
			[`${id}\nRoasting`, nameAndPromptScore],
			[context, attachmentScore],
			[`${id}\nRoasting\n${context}`, combinedScore],
		]),
	)
	spyOn(models, "embedPrivateVectors").mockImplementation(async (texts) =>
		texts.map((text) =>
			text.includes("private-routing-canary") ? queryVector : toVector(scoresByText.get(text) ?? 0),
		),
	)
	const matchTopicsResult = await matchPersonalSourcesTopics({
		userId: "owner",
		payload,
		includeAllEditableTopics: true,
	})
	return matchTopicsResult.status === "matched"
		? matchTopicsResult.topics.map((topic) => [topic.id, topic.relevance])
		: []
}

test("a development chat ranks the documentation Topic over a long architecture attachment", async () => {
	const ranking = await rankScoredTopics([
		{
			id: "How do I use NachoNacho",
			context: "Long CarlNotes architecture",
			nameAndPromptScore: 0.386,
			attachmentScore: 0.764,
			combinedScore: 0.659,
		},
		{ id: "CarlNotes Documentation", context: "", nameAndPromptScore: 0.62, attachmentScore: 0, combinedScore: 0.62 },
	])
	expect(ranking[0]?.[0]).toBe("CarlNotes Documentation")
})

test("an unrelated long attachment cannot pass a Topic whose purpose matches", async () => {
	const ranking = await rankScoredTopics([
		{
			id: "Marathon training",
			context: "Long Kubernetes runbook",
			nameAndPromptScore: 0.166,
			attachmentScore: 0.685,
			combinedScore: 0.65,
		},
		{ id: "Kubernetes operations", context: "", nameAndPromptScore: 0.56, attachmentScore: 0, combinedScore: 0.56 },
	])
	expect(ranking[0]?.[0]).toBe("Kubernetes operations")
})

test("a clarifying attachment raises a vague Topic half of the way to its own score", async () => {
	const ranking = await rankScoredTopics([
		{
			id: "Project Atlas",
			context: "Usage metering",
			nameAndPromptScore: 0.35,
			attachmentScore: 0.79,
			combinedScore: 0.7,
		},
		{ id: "Software deals", context: "", nameAndPromptScore: 0.51, attachmentScore: 0, combinedScore: 0.51 },
	])
	expect(ranking[0]?.[0]).toBe("Project Atlas")
	expect(ranking[0]?.[1]).toBeCloseTo(0.57, 5)
})

test("a weak attachment never lowers a Topic", async () => {
	const ranking = await rankScoredTopics([
		{ id: "Home espresso", context: "Old notes", nameAndPromptScore: 0.7, attachmentScore: 0.2, combinedScore: 0.45 },
	])
	expect(ranking[0]?.[1]).toBeCloseTo(0.7, 5)
})

test("a Topic with no attachment keeps its own score and embeds one text", async () => {
	const ranking = await rankScoredTopics([
		{ id: "Plain Topic", context: "", nameAndPromptScore: 0.66, attachmentScore: 0, combinedScore: 0.66 },
		{ id: "Attached Topic", context: "Notes", nameAndPromptScore: 0.3, attachmentScore: 0.5, combinedScore: 0.9 },
	])
	expect(ranking).toEqual([
		["Plain Topic", expect.closeTo(0.66, 5)],
		["Attached Topic", expect.closeTo(0.4, 5)],
	])
})

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
	expect(embed.mock.calls[1]?.[0]).toContain("editable\nRoasting")
	expect(embed.mock.calls[1]?.[0]).toContain("Ready attachment context")
	expect(embed.mock.calls[1]?.[0].filter((text) => text === "Ready attachment context")).toHaveLength(1)
	// the result and the queries leave out the private text. every query is a select
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
		// subscriptions, public visibility, stored vectors, and Personal sources contexts play no part
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
	// every Topic returns. each embedding call stays within 64 texts and the reads page by id
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
		minimumRelevance: MIN_FILED_TOPIC_RELEVANCE,
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
	// a malformed vector and a model failure each return unavailable
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
	// the read matches the escaped name. the embedded text leaves the search out
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
	// the chat url stays out of the embeddings, the queries, and the result
	expect(JSON.stringify(embed.mock.calls)).not.toContain(chat_url)
	expect(JSON.stringify(queries)).not.toContain(chat_url)
	expect(JSON.stringify(result)).not.toContain(chat_url)
})
