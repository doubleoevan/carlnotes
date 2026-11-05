// sender-only reads exercise the real route, authorization, ciphertext decoding, and cursor SQL
import { afterEach, beforeEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { personalSourceEntries, topicPersonalSourceContexts } from "@carlnotes/db/schema/personalSources"
import { topics } from "@carlnotes/db/schema/topics"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { Hono } from "hono"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { personalSourcesRoute } from "./personalSourcesRoute"

let restoreEnvSettings: () => void
const receivedAt = "2026-11-02T12:30:00.000Z"
beforeEach(() => {
	restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 7).toString("base64")
})
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	restoreEnvSettings()
})

// resolve only the session identity here. personal sources authority remains production code
function app(userId: string | null): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use("*", async (context, next) => {
			context.set("user", userId ? ({ id: userId } as SessionUser) : null)
			await next()
		})
		.route("/", personalSourcesRoute)
}

test("visitors, send keys, other owners, followers, and administrators cannot read entries or context", async () => {
	const queries = stubConnectionPool(({ text }) =>
		text.includes('from "topics"')
			? [toTableRow(topics, { id: "topic", ownerId: "owner", visibility: "private", teamId: null })]
			: [],
	)
	for (const userId of [null, "other", "follower", "admin"]) {
		for (const suffix of ["context", "entries", "entries?page=2"]) {
			const response = await app(userId).request(`/topics/topic/personal-sources/${suffix}`, {
				headers: { authorization: "Bearer cnk_v1_not_a_session" },
			})
			expect(response.status).toBe(userId ? 404 : 401)
			expect(response.headers.get("cache-control")).toBe("no-store")
			expect(await response.text()).not.toContain("canary")
		}
	}
	expect(queries.some((query) => query.text.includes('from "personal_source_entries"'))).toBe(false)
})

test("numbered pages contain at most five items and clamp a retired final page", async () => {
	const queries = stubNumberedEntries([100, 100, 100, 100, 100, 100, 100])
	for (const [requestedPage, expectedPage, offset, count] of [
		[1, 1, 0, 5],
		[2, 2, 5, 2],
		[99, 2, 5, 2],
	] as const) {
		const response = await app("owner").request(`/topics/topic/personal-sources/entries?page=${requestedPage}`)
		const page = await response.json()
		expect(response.status).toBe(200)
		expect(page.entries).toHaveLength(count)
		expect(page.pagination).toEqual({ pageNumber: expectedPage, pageCount: 2, entryOffset: offset, totalEntryCount: 7 })
		expect(page.entries[0]?.id).toBe(`entry-${10 - (offset ?? 0)}`)
	}
	const reads = queries.filter(
		(query) => query.text.includes('from "personal_source_entries"') && !query.text.includes("octet_length"),
	)
	expect(reads.map((query) => query.values.length)).toEqual([5, 2, 2])
})

test("numbered pages preserve the ciphertext budget without skipping large imports", async () => {
	// The page boundaries are shared between requests for the same sender and revision.
	stubRedisClient()
	const queries = stubNumberedEntries([3 * 1024 * 1024, 3 * 1024 * 1024, 100, 100])
	const ids: string[] = []
	for (const pageNumber of [1, 2, 3]) {
		const response = await app("owner").request(`/topics/topic/personal-sources/entries?page=${pageNumber}`)
		const page = await response.json()
		expect(page.pagination.pageCount).toBe(3)
		expect(page.pagination.entryOffset).toBe(pageNumber - 1)
		ids.push(...page.entries.map((entry: { id: string }) => entry.id))
	}
	expect(ids).toEqual(["entry-10", "entry-9", "entry-8", "entry-7"])
	expect(queries.filter((query) => query.text.includes("octet_length") && query.values.includes(512))).toHaveLength(1)
})

test("an empty numbered page remains valid and malformed page requests are refused", async () => {
	stubNumberedEntries([])
	const response = await app("owner").request("/topics/topic/personal-sources/entries?page=4")
	expect(await response.json()).toEqual({
		entries: [],
		nextCursor: null,
		pagination: { pageNumber: 1, pageCount: 1, entryOffset: 0, totalEntryCount: 0 },
	})
	for (const query of ["page=0", "page=-1", "page=1.5", "page=no", "page=1&cursor=anything"]) {
		expect((await app("owner").request(`/topics/topic/personal-sources/entries?${query}`)).status).toBe(400)
	}
})

// only the chosen ids yield ciphertext; page boundaries read size metadata alone
function stubNumberedEntries(sizes: number[]): ReturnType<typeof stubConnectionPool> {
	const candidates = sizes.map((bytes, index) => ({ id: `entry-${10 - index}`, bytes }))
	const encryptedPayload = encryptPrivateText(
		JSON.stringify({
			title: "Stored note",
			text: "Full saved text",
			sender: "Sender",
			senderKind: "import",
			links: [],
			chatUrl: null,
		}),
	)
	return stubConnectionPool(({ text, values }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic", ownerId: "owner", visibility: "private", teamId: null })]
		}
		if (text.includes("coalesce(max(octet_length")) {
			return [[sizes.length, Math.max(0, ...sizes)]]
		}
		if (text.includes('from "topic_personal_source_contexts"')) {
			return [[7]]
		}
		if (text.includes("octet_length")) {
			// PostgreSQL omits OFFSET for the first page and binds it after LIMIT on subsequent pages.
			const [limit = 0, offset = 0] = values.slice(text.includes(" offset ") ? -2 : -1).map(Number)
			return candidates.slice(offset, offset + limit).map((entry) => [entry.id, receivedAt, entry.bytes])
		}
		if (text.includes('from "personal_source_entries"')) {
			return candidates
				.filter((entry) => values.includes(entry.id))
				.map((entry) =>
					toTableRow(personalSourceEntries, {
						id: entry.id,
						topicId: "topic",
						sourceId: "source",
						userId: "owner",
						origin: "import",
						encryptedPayload,
						receivedAt,
						expiresAt: null,
						summarizedAt: null,
						omittedLinkCount: 0,
					}),
				)
		}
		return []
	})
}

test("the owner gets the exact current scoring summary under revision and sender filters", async () => {
	const encrypted = encryptPrivateText("Exact scoring canary\nSecond line")
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic", ownerId: "owner", visibility: "private", teamId: null })]
		}
		if (text.includes('from "topic_personal_source_contexts"')) {
			return [
				toTableRow(topicPersonalSourceContexts, {
					topicId: "topic",
					userId: "owner",
					revision: 7,
					processedRevision: 7,
					encryptedContext: encrypted,
					includedEntryCount: 3,
					hasIncompleteCoverage: true,
					state: "ready",
				}),
			]
		}
		return []
	})
	const response = await app("owner").request("/topics/topic/personal-sources/context")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		text: "Exact scoring canary\nSecond line",
		expiresAt: null,
		includedEntryCount: 3,
		hasIncompleteCoverage: true,
	})
	const query = queries.find((query) => query.text.includes('from "topic_personal_source_contexts"'))
	expect(query?.text).toContain('"revision" = "topic_personal_source_contexts"."processed_revision"')
	expect(query?.text).not.toContain("earliest_expiry")
	expect(query?.values).toContain("ready")
	expect(query?.values).toContain("owner")
	expect(query?.text).toContain('"user_id" =')
})

test("the Topic-wide entry page includes different Sources and preserves full stored text and safe links", async () => {
	const payload = {
		title: "Title",
		text: "Full text canary\n".repeat(350),
		sender: "Sender",
		senderKind: "import",
		links: ["https://example.com/research"],
		chatUrl: null,
	}
	const encryptedPayload = encryptPrivateText(JSON.stringify(payload))
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic", ownerId: "owner", visibility: "private", teamId: null })]
		}
		if (text.includes("octet_length")) {
			return [
				["entry-b", receivedAt, 100],
				["entry-a", receivedAt, 100],
			]
		}
		if (text.includes('from "personal_source_entries"')) {
			return ["b", "a"].map((id) =>
				toTableRow(personalSourceEntries, {
					id: `entry-${id}`,
					topicId: "topic",
					sourceId: `source-${id}`,
					userId: "owner",
					origin: "import",
					encryptedPayload,
					receivedAt,
					expiresAt: null,
					summarizedAt: null,
					omittedLinkCount: 0,
				}),
			)
		}
		return []
	})
	const response = await app("owner").request("/topics/topic/personal-sources/entries")
	const page = (await response.json()) as {
		entries: { id: string; sourceId: string; text: string; links: string[] }[]
		nextCursor: string | null
	}
	expect(response.status).toBe(200)
	expect(page.entries.map((entry) => entry.id)).toEqual(["entry-b", "entry-a"])
	expect(page.entries.map((entry) => entry.sourceId)).toEqual(["source-b", "source-a"])
	expect(page.entries.every((entry) => entry.text === payload.text && entry.links[0] === payload.links[0])).toBe(true)
	expect(page.nextCursor).toBeNull()
	const selection = queries.find((query) => query.text.includes("octet_length"))
	expect(selection?.text).not.toContain('"source_id" =')
	expect(selection?.text).toContain(
		'order by "personal_source_entries"."received_at" desc, "personal_source_entries"."id" desc',
	)
})
