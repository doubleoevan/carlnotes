// real transport and database gates for explicit sends and storage-free Topic routing

import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import { TOPIC_SUGGESTIONS_PAGE_SIZE } from "@carlnotes/contracts/topicSuggestions"
import { db } from "@carlnotes/db"
import { personalSourceEntries, personalSourcesDailyCounts } from "@carlnotes/db/schema/personalSources"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { sources, topicDrafts, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { count, eq, inArray } from "drizzle-orm"
import { privateTopicId, searchQuery } from "./mcpDirectorySmokeFixtures"
import { check, ownerId, runId, toClient, toResultJson } from "./mcpSmokeFixtures"
import { fromCursor, MCP_PAGE_MAX_CHARS } from "./results"
import { toResultText } from "./toolTestFixtures"
import type { suggestTopics } from "./topicSuggestions"

// identical prompts give the live embedding model unambiguous relevant candidates on two pages
const payload = {
	title: "Sourdough fermentation research",
	summary: "Compare sourdough microbial cultures, fermentation temperatures, acidity, and crumb structure.",
	links: [],
}
const candidateIds = Array.from({ length: 22 }, (_, index) => `${runId}-suggest-${String(index).padStart(2, "0")}`)
const routingTeamId = `${runId}-routing-team`

/**
 * Checks both MCP routes without sending content or creating drafts as a side effect of routing.
 */
export async function checkPersonalSourcesRouting(accessToken: string): Promise<void> {
	// provisioning belongs to smoke setup, never to the read-only suggestion tool
	await loadOrProvisionUserLiteLLMKey(ownerId)
	try {
		// include an editable owning-Team Topic alongside owned public, invite, and private Topics
		await db.insert(teams).values({ id: routingTeamId, name: routingTeamId })
		await db.insert(teamMembers).values([
			{ teamId: routingTeamId, userId: ownerId, role: "member" },
			{ teamId: routingTeamId, userId: `${searchQuery}profile0`, role: "leader" },
		])
		await db.insert(topics).values(
			candidateIds.map((id, i) => ({
				id,
				ownerId: i === 0 ? `${searchQuery}profile0` : ownerId,
				teamId: i === 0 ? routingTeamId : null,
				name: payload.title,
				prompt: payload.summary,
				visibility: (["public", "invite", "private"] as const)[i % 3],
			})),
		)
		const before = await readRoutingCounts()
		for (const path of ["/mcp", `/mcp/t/${privateTopicId}`]) {
			await checkVisitorRouting(path)
			await checkRoutingPages(path, accessToken)
		}
		await checkAdminRouting(accessToken)
		check(
			"suggestions persist no entries, Sources, drafts, or send counters",
			JSON.stringify(await readRoutingCounts()) === JSON.stringify(before),
		)
		await checkMcpMultiSend(accessToken)
	} finally {
		await db.delete(topics).where(inArray(topics.id, candidateIds))
		await db.delete(teams).where(eq(teams.id, routingTeamId))
	}
}

// require sign-in and a destination through SDK validation on both routes
async function checkVisitorRouting(path: string): Promise<void> {
	const { client, transport } = toClient(path)
	try {
		await client.connect(transport)
		const suggestions = await client.callTool({ name: "suggest_topics", arguments: payload })
		check(
			`${path}: visitors receive routing sign-in guidance`,
			toResultText(suggestions).includes("connected CarlNotes account"),
		)
		const send = await client.callTool({ name: "send_to_topic", arguments: payload })
		check(`${path}: a send without a Topic fails validation`, Boolean(send.isError))
	} finally {
		await client.close()
	}
}

// traverse editable cursor pages without revealing unrelated private metadata
async function checkRoutingPages(path: string, accessToken: string): Promise<void> {
	const { client, transport } = toClient(path, accessToken)
	try {
		await client.connect(transport)
		const seen: string[] = []
		const fixtureScores: { id: string; relevance: number }[] = []
		let cursor: string | undefined
		for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
			const result = await client.callTool({ name: "suggest_topics", arguments: { ...payload, cursor } })
			const page = toResultJson<Awaited<ReturnType<typeof suggestTopics>>>(result)
			check(`${path}: live routing model returns matches`, page.status === "suggested")
			if (page.status !== "suggested") {
				break
			}
			const items = [...page.editableTopics, ...page.publicTopicsToFollow]
			checkMcpViewPageMetadata(path, pageIndex, page)
			check(
				`${path}: text-only results are numbered without exposing send content`,
				toResultText(result).includes("Your editable topics") &&
					!toResultText(result).includes(payload.summary) &&
					(items.length === 0 || toResultText(result).includes("1. ")),
			)
			if (pageIndex === 0) {
				check(
					`${path}: best matches are first and bounded`,
					page.editableTopics[0]?.isBestMatch === true &&
						page.editableTopics.filter((topic) => topic.isBestMatch).length <= 3,
				)
			}
			check(
				`${path}: routing result bounds`,
				items.length <= TOPIC_SUGGESTIONS_PAGE_SIZE && JSON.stringify(page).length <= MCP_PAGE_MAX_CHARS + 1024,
			)
			check(
				`${path}: routing contains only editable destinations`,
				page.publicTopicsToFollow.length === 0 &&
					page.editableTopics.every((item) => item.group === "editable" && (!item.isBestMatch || item.relevance > 0.6)),
			)
			check(
				`${path}: every page offers a new private Topic`,
				page.newPrivateTopic?.label === "Start a new topic for this chat",
			)
			seen.push(...items.map((item) => item.id))
			fixtureScores.push(
				...items.filter((item) => candidateIds.includes(item.id)).map(({ id, relevance }) => ({ id, relevance })),
			)
			if (!page.nextCursor) {
				break
			}
			check(`${path}: the list_topics cursor advances`, fromCursor(page.nextCursor) === seen.length)
			cursor = page.nextCursor
		}
		check(
			`${path}: editable pages include every public, invite, private, and Team fixture once`,
			candidateIds.every((id) => seen.filter((seenId) => seenId === id).length === 1),
			fixtureScores,
		)
		check(`${path}: weak editable Topics remain available`, seen.includes(privateTopicId))
		const search = await client.callTool({
			name: "suggest_topics",
			arguments: { ...payload, query: "no-matching-name-unique" },
		})
		const searchPage = toResultJson<Awaited<ReturnType<typeof suggestTopics>>>(search)
		check(
			`${path}: name search filters editable matches before pagination`,
			searchPage.status === "suggested" && searchPage.editableTopics.length === 0,
		)
		const autocomplete = await client.callTool({
			name: "suggest_topics",
			arguments: { ...payload, query: "Sourdough", autocomplete: true },
		})
		const names = toResultJson<Awaited<ReturnType<typeof suggestTopics>>>(autocomplete)
		checkAutocompletePage(path, names)
		const wrongTopic = await client.callTool({
			name: "send_to_topic",
			arguments: { ...payload, topic_id: "missing-topic" },
		})
		check(`${path}: a mismatched or missing Topic cannot store`, Boolean(wrongTopic.isError))
	} finally {
		await client.close()
	}
}

// check name-only paging independently of content relevance recommendations
function checkAutocompletePage(path: string, names: Awaited<ReturnType<typeof suggestTopics>>): void {
	check(
		`${path}: autocomplete returns five editable name choices without relevance defaults`,
		names.status === "suggested" &&
			names.editableTopics.length === 5 &&
			names.editableTopics.every((topic) => topic.name.includes("Sourdough") && topic.isBestMatch === false),
	)
	check(
		`${path}: autocomplete retains the shared cursor`,
		names.status === "suggested" && fromCursor(names.nextCursor) === 5,
	)
}

// compare persisted rows around the complete read-only operation
async function readRoutingCounts(): Promise<number[]> {
	const [entries, sourceRows, drafts, counts] = await Promise.all([
		db.select({ count: count() }).from(personalSourceEntries).where(eq(personalSourceEntries.userId, ownerId)),
		db.select({ count: count() }).from(sources).where(inArray(sources.topicId, candidateIds)),
		db.select({ count: count() }).from(topicDrafts).where(eq(topicDrafts.userId, ownerId)),
		db
			.select({ count: count() })
			.from(personalSourcesDailyCounts)
			.where(eq(personalSourcesDailyCounts.userId, ownerId)),
	])
	return [entries, sourceRows, drafts, counts].map((rows) => rows[0]?.count ?? 0)
}

// admin edit authority reduces to true and must remain a valid SQL ordering expression
async function checkAdminRouting(accessToken: string): Promise<void> {
	const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, ownerId))
	if (!account) {
		throw new Error("Routing fixture account missing")
	}
	await db.update(users).set({ role: "admin" }).where(eq(users.id, ownerId))
	try {
		for (const path of ["/mcp", `/mcp/t/${privateTopicId}`]) {
			const { client, transport } = toClient(path, accessToken)
			try {
				await client.connect(transport)
				const result = await client.callTool({ name: "suggest_topics", arguments: payload })
				const page = toResultJson<Awaited<ReturnType<typeof suggestTopics>>>(result)
				check(
					`${path}: admin routing ranks editable Topics without a SQL error`,
					page.status === "suggested" && page.editableTopics.length > 0 && page.publicTopicsToFollow.length === 0,
				)
			} finally {
				await client.close()
			}
		}
	} finally {
		await db.update(users).set({ role: account.role }).where(eq(users.id, ownerId))
	}
}

// check the SDK schema and authenticated receiver together, without changing review accounts
async function checkMcpMultiSend(accessToken: string): Promise<void> {
	const restore = saveEnvSettings(["PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	try {
		const before = await db
			.select()
			.from(personalSourcesDailyCounts)
			.where(eq(personalSourcesDailyCounts.userId, ownerId))
		const { client, transport } = toClient("/mcp", accessToken)
		try {
			await client.connect(transport)
			const input = { ...payload, topic_ids: candidateIds.slice(0, 2), request_id: "multi-smoke" }
			const response = await client.callTool({ name: "send_to_topic", arguments: input })
			const accepted = toResultJson<PersonalSourcesSendResult>(response)
			check(
				"/mcp: one authenticated send returns two destination confirmations",
				accepted.status === "accepted" && accepted.confirmations?.length === 2,
			)
			const retry = await client.callTool({
				name: "send_to_topic",
				arguments: { ...input, topic_ids: [...input.topic_ids].reverse() },
			})
			check(
				"/mcp: reordered multi-send retry returns the same confirmation",
				JSON.stringify(toResultJson(retry)) === JSON.stringify(accepted),
			)
			const after = await db
				.select()
				.from(personalSourcesDailyCounts)
				.where(eq(personalSourcesDailyCounts.userId, ownerId))
			check(
				"/mcp: multiple destinations and a retry charge once",
				after.reduce((sum, row) => sum + row.acceptedCount, 0) ===
					before.reduce((sum, row) => sum + row.acceptedCount, 0) + 1,
			)
		} finally {
			await client.close()
		}
		const bound = toClient(`/mcp/t/${privateTopicId}`, accessToken)
		try {
			await bound.client.connect(bound.transport)
			const rejected = await bound.client.callTool({
				name: "send_to_topic",
				arguments: { ...payload, topic_ids: [privateTopicId, candidateIds[0]], request_id: "bound-mismatch" },
			})
			check("bound MCP refuses any array destination outside its Topic", Boolean(rejected.isError))
			const accepted = await bound.client.callTool({
				name: "send_to_topic",
				arguments: { ...payload, topic_ids: [privateTopicId], request_id: "bound-array" },
			})
			check(
				"bound MCP accepts an array containing only its Topic",
				toResultJson<PersonalSourcesSendResult>(accepted).status === "accepted",
			)
		} finally {
			await bound.client.close()
		}
	} finally {
		restore()
	}
}

// validate the picker display fields without weakening the shared cursor and privacy gates
function checkMcpViewPageMetadata(
	path: string,
	pageIndex: number,
	page: Extract<Awaited<ReturnType<typeof suggestTopics>>, { status: "suggested" }>,
): void {
	check(
		`${path}: MCP view page totals and weekly Finding counts are available`,
		Number.isInteger(page.pageCount) &&
			(page.pageCount ?? 0) >= pageIndex + 1 &&
			page.editableTopics.every(
				(topic) => Number.isInteger(topic.weeklyFindingCount) && (topic.weeklyFindingCount ?? -1) >= 0,
			) &&
			page.publicTopicsToFollow.every((topic) => topic.weeklyFindingCount === undefined),
	)
}
