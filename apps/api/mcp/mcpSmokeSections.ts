// the sections of the mcp smoke: a visitor's reads, a user's writes and edits, and the rate limit. the oauth flow is in
// mcpOAuthSmokeSections.ts

import { MCP_VIEWS, toMcpUiResourceUri } from "@carlnotes/contracts/mcpViews"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topicPromptVersions, topics } from "@carlnotes/db/schema/topics"
import { desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { CALLER_RATE_LIMIT, toolCallerRateLimiter, toolCallerRateLimitStore, toRateLimitKey } from "../rateLimit"
import { stopFirstScan } from "../topic/firstScanSmoke"
import { toMcpToolContractIssues } from "./mcpContractTestFixtures"
import { check, type FeedPage, runId, type TopicPage, toClient, topicId, toResultJson } from "./mcpSmokeFixtures"
import { checkLastDraftSlot } from "./mcpTopicDraftSmoke"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { mcpRoute, SERVER_INSTRUCTIONS } from "./server"
import { toResultText } from "./toolTestFixtures"

/** Checks a visitor's results on /mcp, then on the topic-bound route. */
export async function checkVisitor(): Promise<void> {
	const { client, transport } = toClient("/mcp")
	await client.connect(transport)
	const { tools } = await client.listTools()
	const contractIssues = toMcpToolContractIssues(tools)
	check("every visitor tool has its title and classified hints", contractIssues.length === 0, contractIssues)
	check("the server instructions name Carl and CarlNotes", client.getInstructions() === SERVER_INSTRUCTIONS)

	// search the seeded public topic by name, and read each MCP view's resource
	const visitorSearchResult = await client.callTool({
		name: "search",
		arguments: { q: `${runId} topic`, kinds: ["topics"] },
	})
	check("search finds the seeded public topic by name", toResultText(visitorSearchResult).includes(topicId))
	await checkMcpUiResources(client)

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
	const visitorFindingFeedbackResult = await client.callTool({
		name: "send_finding_feedback",
		arguments: { finding_id: "any", feedback: "Too basic." },
	})
	check(
		"send_finding_feedback returns the connect text to a visitor",
		toResultText(visitorFindingFeedbackResult) === CONNECT_ACCOUNT_TEXT,
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
	check("the bound route sends the instructions", topicRouteClient.client.getInstructions() === SERVER_INSTRUCTIONS)
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

	// rate, send feedback on, and bookmark a finding as the owner
	const rateFindingResult = await client.callTool({
		name: "rate_finding",
		arguments: { finding_id: findingId, rating: "up" },
	})
	check("the owner rates a finding", toResultText(rateFindingResult) === "Rated.", toResultText(rateFindingResult))
	const feedbackResult = await client.callTool({
		name: "send_finding_feedback",
		arguments: { finding_id: findingId, feedback: "Too basic." },
	})
	check("the owner sends feedback on a finding", toResultText(feedbackResult) === "Sent.", toResultText(feedbackResult))
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
	const draftPreview = (await client.callTool({
		name: "create_topic",
		arguments: createArguments,
	})) as EditTopicToolResult
	check("create_topic previews without creating", draftPreview.structuredContent?.status === "createConfirmRequired")
	const confirmedDraft = {
		name: "create_topic",
		arguments: { ...createArguments, confirmation: draftPreview.structuredContent?.confirmation },
	}
	// a double click and a lost host response must lead to the same Topic, version, and first Scan
	const [createTopicResult, retryResult] = await Promise.all([
		client.callTool(confirmedDraft),
		client.callTool(confirmedDraft),
	])
	const createdTopicId =
		(createTopicResult as { structuredContent?: { topicId?: string } }).structuredContent?.topicId ?? ""
	const createdTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.name, createArguments.name))
	const createdScans = await db.select({ id: scans.id }).from(scans).where(eq(scans.topicId, createdTopicId))
	check(
		"concurrent confirmations return one Topic and start one Scan",
		createdTopicId !== "" &&
			(retryResult as EditTopicToolResult).structuredContent?.topicId === createdTopicId &&
			createdTopics.length === 1 &&
			createdScans.length === 1,
	)
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
	// deliberately delete only this smoke run's draft. An old confirmation must respect that deletion.
	await db.delete(topics).where(eq(topics.id, createdTopicId))
	const deletedRetry = await client.callTool(confirmedDraft)
	check(
		"retrying a deleted draft cannot restore the Topic",
		deletedRetry.isError === true && toResultText(deletedRetry).includes("already been used"),
	)
	await checkLastDraftSlot(client)
	await client.close()
}

// an edit_topic result's status and the confirmation a preview returns
type EditTopicToolResult = { structuredContent?: { status?: string; confirmation?: string; topicId?: string } }

// read each MCP view's resource, which is the built bundle's html naming its MCP view
async function checkMcpUiResources(client: ReturnType<typeof toClient>["client"]): Promise<void> {
	for (const mcpView of MCP_VIEWS) {
		const uiResource = await client.readResource({ uri: toMcpUiResourceUri(mcpView) })
		const mcpViewHtml = (uiResource.contents[0] as { text?: string } | undefined)?.text ?? ""
		check(`the ${mcpView} MCP view's resource is its html`, mcpViewHtml.includes(`data-mcp-view="${mcpView}"`))
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
