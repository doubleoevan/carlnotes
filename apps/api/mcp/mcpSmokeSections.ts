// the sections of the mcp smoke: a visitor's reads, a user's writes and edits, and the rate limit. the oauth flow is in
// mcpOAuthSmokeSections.ts

import { MCP_CARDS, toMcpCardUri } from "@carlnotes/contracts/mcpCards"
import { db } from "@carlnotes/db"
import { topicPromptVersions } from "@carlnotes/db/schema/topics"
import { desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { CALLER_RATE_LIMIT, toolCallerRateLimiter, toolCallerRateLimitStore, toRateLimitKey } from "../rateLimit"
import { stopFirstScan } from "../topic/firstScanSmoke"
import {
	check,
	type FeedPage,
	runId,
	type TopicPage,
	toClient,
	topicId,
	toResultJson,
	toResultText,
} from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { mcpRoute } from "./server"

/** Checks a visitor's results on /mcp, then on the topic-bound route. */
export async function checkVisitor(): Promise<void> {
	const { client, transport } = toClient("/mcp")
	await client.connect(transport)
	const { tools } = await client.listTools()
	check(
		"initialize and list tools as a visitor",
		tools.length === 11 && !tools.some((tool) => REMOVED_TOOL_NAMES.includes(tool.name)),
		tools.map((tool) => tool.name),
	)
	check(
		"the edit tool is annotated destructive and the reads read-only",
		tools.find((tool) => tool.name === "edit_topic")?.annotations?.destructiveHint === true &&
			tools.find((tool) => tool.name === "read_topic_feed")?.annotations?.readOnlyHint === true &&
			tools.find((tool) => tool.name === "search")?.annotations?.readOnlyHint === true,
	)

	// search the seeded public topic by name, and read each card's resource
	const visitorSearchResult = await client.callTool({
		name: "search",
		arguments: { q: `${runId} topic`, kinds: ["topics"] },
	})
	check("search finds the seeded public topic by name", toResultText(visitorSearchResult).includes(topicId))
	await checkCardResources(client)

	// list the topics and read the feed. a visitor sees every explanation and no consumed flag
	const listTopicsResult = await client.callTool({ name: "list_topics", arguments: {} })
	check("list_topics includes the seeded public topic", toResultText(listTopicsResult).includes(topicId))
	const feedText = toResultText(await client.callTool({ name: "read_topic_feed", arguments: { topic_id: topicId } }))
	check(
		"read_topic_feed returns the findings with their explanations",
		feedText.includes(`Why finding 3 matters to ${runId}.`),
	)
	check("a visitor's findings have no consumed flag", !feedText.includes("isConsumed"))

	// call an account-only tool as the visitor. it returns the connect-account text
	const visitorRateFindingResult = await client.callTool({
		name: "rate_finding",
		arguments: { finding_id: "any", rating: "up" },
	})
	check(
		"rate_finding returns the connect text to a visitor",
		toResultText(visitorRateFindingResult) === CONNECT_ACCOUNT_TEXT,
	)
	const visitorCreateTopicResult = await client.callTool({
		name: "create_topic",
		arguments: { name: "x", prompt: "y" },
	})
	check(
		"create_topic returns the connect text to a visitor",
		toResultText(visitorCreateTopicResult) === CONNECT_ACCOUNT_TEXT,
	)

	// search with the public key cleared. the result asks for an account
	const searchKey = Bun.env.LITELLM_PUBLIC_KEY
	Bun.env.LITELLM_PUBLIC_KEY = ""
	const searchTopicFindingsResult = await client.callTool({
		name: "search_topic_findings",
		arguments: { topic_id: topicId, query: "anything" },
	})
	Bun.env.LITELLM_PUBLIC_KEY = searchKey
	check("search without a public key returns a message", toResultText(searchTopicFindingsResult).includes("account"))
	await client.close()

	// read through the topic-bound route with no topic named, then with another topic. it rejects the second
	const topicRouteClient = toClient(`/mcp/t/${topicId}`)
	await topicRouteClient.client.connect(topicRouteClient.transport)
	const routeFeedResult = await topicRouteClient.client.callTool({ name: "read_topic_feed", arguments: {} })
	check("the bound route reads its topic with no argument", toResultText(routeFeedResult).includes("Finding 1"))
	const otherTopicFeedResult = await topicRouteClient.client.callTool({
		name: "read_topic_feed",
		arguments: { topic_id: "another" },
	})
	check("the bound route rejects another topic", toResultText(otherTopicFeedResult).includes("bound to one topic"))
	await topicRouteClient.client.close()
}

/** Checks a user's writes: marking consumed, rating, bookmarking, edit_topic and its confirmation, and subscribing. */
export async function checkUser(accessToken: string): Promise<void> {
	const { client, transport } = toClient("/mcp", accessToken)
	await client.connect(transport)

	// read the feed, mark one finding consumed, and read it again
	const feed = toResultJson<FeedPage>(
		await client.callTool({ name: "read_topic_feed", arguments: { topic_id: topicId } }),
	)
	const findingId = feed.items[0]?.findingId ?? ""
	check(
		"a user's feed includes the consumed flag",
		feed.items.every((feedItem) => feedItem.isConsumed === false),
	)
	const markConsumedResult = await client.callTool({
		name: "mark_finding_consumed",
		arguments: { finding_id: findingId },
	})
	const feedAgain = toResultJson<FeedPage>(
		await client.callTool({ name: "read_topic_feed", arguments: { topic_id: topicId } }),
	)
	check(
		"marking consumed shows on the next read",
		toResultText(markConsumedResult) === "Marked consumed." &&
			feedAgain.items.find((feedItem) => feedItem.findingId === findingId)?.isConsumed === true,
	)

	// rate and bookmark a finding as the owner
	const rateFindingResult = await client.callTool({
		name: "rate_finding",
		arguments: { finding_id: findingId, rating: "up" },
	})
	check("the owner rates a finding", toResultText(rateFindingResult) === "Rated.", toResultText(rateFindingResult))
	const bookmarkFindingResult = await client.callTool({
		name: "bookmark_finding",
		arguments: { finding_id: findingId, is_bookmarked: true },
	})
	check(
		"the owner bookmarks a finding",
		toResultText(bookmarkFindingResult) === "Bookmark saved.",
		toResultText(bookmarkFindingResult),
	)

	// save the topic's prompt through edit_topic, then read its newest prompt version
	const editPromptResult = await client.callTool({
		name: "edit_topic",
		arguments: { topic_id: topicId, prompt: "smoke, edited over mcp" },
	})
	const [version] = await db
		.select()
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, topicId))
		.orderBy(desc(topicPromptVersions.createdAt))
		.limit(1)
	check(
		"edit_topic saves the prompt and versions it with origin mcp",
		toResultText(editPromptResult).startsWith("Saved") &&
			version?.origin === "mcp" &&
			version.prompt === "smoke, edited over mcp",
		toResultText(editPromptResult),
	)

	// add a source beside the topic's web search, and find its id in the topic list
	const addTopicSourceText = toResultText(
		await client.callTool({
			name: "edit_topic",
			arguments: { topic_id: topicId, addSources: [{ sourceOption: "reddit", value: "r/startups" }] },
		}),
	)
	check(
		"edit_topic adds a source and returns its cost",
		addTopicSourceText.startsWith("Added reddit — r/startups") && addTopicSourceText.includes("¢"),
		addTopicSourceText,
	)
	const listTopicsPage = toResultJson<TopicPage>(await client.callTool({ name: "list_topics", arguments: {} }))
	const listedTopic = listTopicsPage.items.find((listedItem) => listedItem.topicId === topicId)
	const listedTopicSource = listedTopic?.sources.find((topicSource) => topicSource.label === "reddit — r/startups")
	check("list_topics shows the source with its id", Boolean(listedTopicSource?.sourceId), listedTopic)

	// removing the source previews first, then saves with the preview's confirmation, which never saves twice
	const removeArguments = { topic_id: topicId, removeSourceIds: [listedTopicSource?.sourceId ?? ""] }
	const removePreview = (await client.callTool({
		name: "edit_topic",
		arguments: removeArguments,
	})) as EditTopicToolResult
	check(
		"edit_topic previews a removal and saves nothing",
		removePreview.structuredContent?.status === "confirmRequired",
		toResultText(removePreview),
	)
	const confirmedArguments = { ...removeArguments, confirmation: removePreview.structuredContent?.confirmation }
	const removeTopicSourceText = toResultText(
		await client.callTool({ name: "edit_topic", arguments: confirmedArguments }),
	)
	check(
		"the confirmation removes the source",
		removeTopicSourceText === "Removed reddit — r/startups.",
		removeTopicSourceText,
	)
	const repeatRemoval = (await client.callTool({
		name: "edit_topic",
		arguments: confirmedArguments,
	})) as EditTopicToolResult
	check(
		"the same confirmation saves nothing again",
		repeatRemoval.structuredContent?.status === "confirmRequired",
		toResultText(repeatRemoval),
	)

	// an owner always subscribes to their own topic, so the unsubscribe is rejected
	const unsubscribeResult = await client.callTool({
		name: "follow_topic",
		arguments: { topic_id: topicId, is_following: false },
	})
	check("follow_topic keeps an owner following", toResultText(unsubscribeResult).includes("An owner always follows"))

	// create a topic from a draft. the result names its id, and its first version has origin mcp
	const createArguments = {
		name: `${runId} agent topic`,
		prompt: "pickup runs after work",
		sources: [],
		inviteEmails: [],
	}
	const createTopicResult = await client.callTool({ name: "create_topic", arguments: createArguments })
	const createdTopicId =
		(createTopicResult as { structuredContent?: { topicId?: string } }).structuredContent?.topicId ?? ""
	// the first prompt version the create wrote
	const [createdVersion] = await db
		.select({ origin: topicPromptVersions.origin })
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, createdTopicId))
	check(
		"create_topic makes the topic with a first version of origin mcp",
		toResultText(createTopicResult).startsWith("Created") && createdVersion?.origin === "mcp",
		toResultText(createTopicResult),
	)

	// stop the first scan the create started and wait for it to end. the cleanup deletes the user under it
	await stopFirstScan(createdTopicId)
	await client.close()
}

// an edit_topic result's status and the confirmation a preview returns
type EditTopicToolResult = { structuredContent?: { status?: string; confirmation?: string } }

// tool names the server never lists
const REMOVED_TOOL_NAMES = ["update_topic_prompt", "update_topic_fields", "add_source", "remove_source"]

// read each card's resource, which is the built bundle's html naming its card
async function checkCardResources(client: ReturnType<typeof toClient>["client"]): Promise<void> {
	for (const mcpCard of MCP_CARDS) {
		const cardResource = await client.readResource({ uri: toMcpCardUri(mcpCard) })
		const cardHtml = (cardResource.contents[0] as { text?: string } | undefined)?.text ?? ""
		check(`the ${mcpCard} card's resource is its html`, cardHtml.includes(`data-card="${mcpCard}"`))
	}
}

/**
 * Checks the per-tool-caller rate limit. A bearer nobody holds resolves to a visitor, so the requests share the
 * visitor bucket.
 */
export async function checkRateLimit(): Promise<void> {
	const limitedRoute = new Hono<AppEnv>().use("/mcp/*", toolCallerRateLimiter).route("/", mcpRoute)

	// start the visitor bucket's rate limit window empty. Redis may already count other visitor requests from the last minute
	await toolCallerRateLimitStore.resetKey(toRateLimitKey({ userId: null, clientAddress: null }))

	// send one more initialize than the limit allows, all as that visitor
	const statuses: number[] = []
	for (let index = 0; index <= CALLER_RATE_LIMIT; index += 1) {
		const initializeResponse = await limitedRoute.request("http://carlnotes.test/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				authorization: `Bearer ${runId}-nobody`,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: index,
				method: "initialize",
				params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rate-limit", version: "1" } },
			}),
		})
		statuses.push(initializeResponse.status)
	}
	check(
		"the limiter lets the limit through and rejects the next request with 429",
		statuses.slice(0, CALLER_RATE_LIMIT).every((status) => status === 200) && statuses.at(-1) === 429,
		statuses,
	)
}
