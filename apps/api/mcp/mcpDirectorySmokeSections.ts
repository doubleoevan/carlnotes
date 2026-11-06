// the directory's transport and private-data regression checks on both MCP endpoints

import { db } from "@carlnotes/db"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { appUrl } from "@carlnotes/server/appUrl"
import { eq } from "drizzle-orm"
import { toMcpToolContractIssues } from "./mcpContractTestFixtures"
import { privateTopicId, subscribedTeamId, subscribedTopicId } from "./mcpDirectorySmokeFixtures"
import {
	check,
	type FeedPage,
	mcpRequest,
	ownerId,
	runId,
	type TopicPage,
	toClient,
	toResultJson,
} from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText } from "./toolTestFixtures"

/** Checks present and absent Origins, including a forbidden Origin with a valid account token. */
export async function checkOrigins(accessToken: string): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${privateTopicId}`]) {
		await checkRouteOrigins(path, accessToken)
	}
}

/** Checks every tool's metadata and private-feed permissions for visitors, invalid tokens, and the owner. */
export async function checkPrivateAccess(accessToken: string): Promise<void> {
	// exercise the same private read under each identity
	const callers = [
		{ identity: "visitor", token: undefined, isOwner: false },
		{ identity: "invalid bearer", token: "invalid-bearer", isOwner: false },
		{ identity: "owner", token: accessToken, isOwner: true },
	]
	for (const path of ["/mcp", `/mcp/t/${privateTopicId}`]) {
		for (const caller of callers) {
			await checkPrivateCaller({ path, ...caller })
		}
	}
}

/** Checks that a subscription stops exposing a private Topic while invite and team access remain valid. */
export async function checkSubscriptionAccess(accessToken: string): Promise<void> {
	// a followed public topic is listed even before it has enough findings for public discovery
	await checkSubscribedTopicLists(accessToken, true, "public follower")

	// keep the subscription while changing visibility and every sensitive field
	const sentinel = `${runId}-private-metadata`
	await db
		.update(topics)
		.set({ visibility: "private", name: sentinel, prompt: sentinel })
		.where(eq(topics.id, subscribedTopicId))

	// replace the Source metadata after access has ended
	await db
		.update(sources)
		.set({ config: { url: `https://example.test/${sentinel}` } })
		.where(eq(sources.topicId, subscribedTopicId))
	await checkSubscribedTopicLists(accessToken, false, "former public follower")

	// invite topics remain readable through an active subscription
	await db.update(topics).set({ visibility: "invite" }).where(eq(topics.id, subscribedTopicId))
	await checkSubscribedTopicLists(accessToken, true, "invite follower")

	// a real team role grants private access independently of the old subscription
	await db.update(topics).set({ visibility: "private" }).where(eq(topics.id, subscribedTopicId))
	await db.insert(teamMembers).values({ teamId: subscribedTeamId, userId: ownerId, role: "member", isActive: true })
	await checkSubscribedTopicLists(accessToken, true, "active team member")
}

// compare list and feed permissions after each visibility or membership change
async function checkSubscribedTopicLists(accessToken: string, isVisible: boolean, identity: string): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${subscribedTopicId}`]) {
		const { client, transport } = toClient(path, accessToken)
		try {
			await client.connect(transport)
			const result = await client.callTool({ name: "list_topics", arguments: {} })
			const listedTopics = toResultJson<TopicPage>(result)
			check(
				`${path}: ${identity} list access matches current permission`,
				listedTopics.items.some((topic) => topic.topicId === subscribedTopicId) === isVisible,
			)
			if (!isVisible) {
				check(
					`${path}: private name, prompt, and Source are absent`,
					!JSON.stringify(result).includes(`${runId}-private-metadata`),
				)
			}

			// both routes apply the same permission to the feed itself
			const feed = await client.callTool({ name: "read_topic_feed", arguments: { topic_id: subscribedTopicId } })
			check(`${path}: ${identity} feed access matches current permission`, Boolean(feed.isError) === !isVisible)
		} finally {
			await client.close()
		}
	}
}

// inspect each Origin through real initialization and tool listing on the guarded route
async function checkRouteOrigins(path: string, accessToken: string): Promise<void> {
	for (const origin of [
		null,
		"https://carlnotes.com",
		new URL(appUrl()).origin,
		"https://foreign.example",
		"null",
		"",
	]) {
		await checkOrigin({ path, origin, accessToken })
	}
}

// initialize the transport with one Origin and verify tool listing only when it is allowed
async function checkOrigin({
	path,
	origin,
	accessToken,
}: {
	path: string
	origin: string | null
	accessToken: string
}): Promise<void> {
	// use a real token even for forbidden origins
	const headers = new Headers({
		"content-type": "application/json",
		accept: "application/json, text/event-stream",
		authorization: `Bearer ${accessToken}`,
	})
	if (origin !== null) {
		headers.set("origin", origin)
	}

	// initialize the stateless transport
	const initialize = await mcpRequest(path, {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "origin-smoke", version: "1" } },
		}),
	})
	const isAllowedOrigin = origin === null || origin === "https://carlnotes.com" || origin === new URL(appUrl()).origin
	check(
		`${path}: Origin ${JSON.stringify(origin)} ${isAllowedOrigin ? "initializes" : "is forbidden"}`,
		initialize.status === (isAllowedOrigin ? 200 : 403),
		initialize.status,
	)
	if (!isAllowedOrigin) {
		return
	}

	// list tools through another request with the same accepted Origin
	const response = await mcpRequest(path, {
		method: "POST",
		headers,
		body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
	})
	const body = (await response.json()) as { result?: { tools: Parameters<typeof toMcpToolContractIssues>[0] } }
	const issues = toMcpToolContractIssues(body.result?.tools ?? [])
	check(`${path}: allowed Origin lists all classified tools`, response.ok && issues.length === 0, issues)
}

// compare the same private read under each identity, and always close its client
async function checkPrivateCaller({
	path,
	token,
	identity,
	isOwner,
}: {
	path: string
	token: string | undefined
	identity: string
	isOwner: boolean
}): Promise<void> {
	// close the SDK client even after a rejected result or failed assertion
	const { client, transport } = toClient(path, token)
	try {
		await client.connect(transport)
		const { tools } = await client.listTools()
		const issues = toMcpToolContractIssues(tools)
		check(`${path}: ${identity} tool contract`, issues.length === 0, issues)

		// reject private findings for both anonymous and invalid-token callers
		const result = await client.callTool({ name: "read_topic_feed", arguments: { topic_id: privateTopicId } })
		if (isOwner) {
			const feed = toResultJson<FeedPage>(result)
			check(
				`${path}: owner reads private findings`,
				!result.isError && feed.items.length === 1 && feed.items[0]?.isConsumed === false,
			)
		} else {
			check(
				`${path}: ${identity} cannot read private findings`,
				result.isError === true && !JSON.stringify(result).includes("Private finding."),
			)
			const writeResult = await client.callTool({
				name: "rate_finding",
				arguments: { finding_id: "private-finding", rating: "up" },
			})
			check(`${path}: ${identity} cannot write as an account`, toResultText(writeResult) === CONNECT_ACCOUNT_TEXT)
		}
	} finally {
		await client.close()
	}
}
