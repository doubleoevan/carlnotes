// the sections of the mcp smoke: a visitor's reads, the oauth flow, a user's writes and edits, and the rate limit

import { db } from "@carlnotes/db"
import { topicPromptVersions } from "@carlnotes/db/schema/topics"
import { desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { auth } from "../auth"
import type { AppEnv } from "../currentUser"
import { CALLER_RATE_LIMIT, toolCallerRateLimiter, toolCallerRateLimitStore, toRateLimitKey } from "../rateLimit"
import { stopFirstScan } from "../topic/firstScanSmoke"
import {
	apiRequest,
	check,
	type FeedPage,
	ownerEmail,
	ownerPassword,
	runId,
	type TopicPage,
	toClient,
	topicId,
	toResultJson,
	toResultText,
} from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { mcpRoute } from "./server"

// the oauth redirect uri, and the app's own origin
const REDIRECT_URI = "http://localhost:9999/callback"
const ORIGIN = Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173"

// the client id that the oauth flow registers
export let registeredClientId = ""

/** Checks a visitor's results on /mcp, then on the topic-bound route. */
export async function checkVisitor(): Promise<void> {
	const { client, transport } = toClient("/mcp")
	await client.connect(transport)
	const { tools } = await client.listTools()
	check(
		"initialize and list tools as a visitor",
		tools.length === 12,
		tools.map((tool) => tool.name),
	)
	check(
		"the edit tools are annotated destructive and the reads read-only",
		tools.find((tool) => tool.name === "update_topic_prompt")?.annotations?.destructiveHint === true &&
			tools.find((tool) => tool.name === "read_topic_feed")?.annotations?.readOnlyHint === true,
	)

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

/** Checks the oauth flow from client registration to the access token, and returns it. */
export async function checkOAuth(): Promise<string> {
	// sign the owner in and keep the cookie
	const signIn = await auth.api.signInEmail({
		body: { email: ownerEmail, password: ownerPassword },
		headers: new Headers({ origin: ORIGIN }),
		asResponse: true,
	})
	const cookie = signIn.headers
		.getSetCookie()
		.map((cookieLine) => cookieLine.split(";")[0])
		.join("; ")
	check("the owner signs in", signIn.ok && cookie.length > 0, signIn.status)

	// register a client
	const registrationResponse = await apiRequest("/api/auth/mcp/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_name: "mcp-smoke",
			redirect_uris: [REDIRECT_URI],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		}),
	})
	const registrationJson = (await registrationResponse.json()) as { client_id?: string }
	registeredClientId = registrationJson.client_id ?? ""
	check(
		"dynamic client registration",
		registrationResponse.ok && registeredClientId.length > 0,
		registrationResponse.status,
	)

	// build the pkce pair and the authorize query
	const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
	const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
	const authorizeQuery = new URLSearchParams({
		client_id: registeredClientId,
		redirect_uri: REDIRECT_URI,
		response_type: "code",
		scope: "openid profile email offline_access",
		state: "smoke-state",
		code_challenge: Buffer.from(challengeBytes).toString("base64url"),
		code_challenge_method: "S256",
	})

	// call authorize signed out. it redirects to the login page with the whole query
	const anonymousAuthorizeResponse = await apiRequest(`/api/auth/mcp/authorize?${authorizeQuery}`, {
		redirect: "manual",
	})
	const loginLocation = anonymousAuthorizeResponse.headers.get("location") ?? ""
	check(
		"a signed-out authorize goes to the login page with the oauth query",
		loginLocation.startsWith("/login?") && loginLocation.includes("client_id="),
		loginLocation,
	)

	// call authorize signed in. it redirects to the consent page
	const authorizeResponse = await apiRequest(`/api/auth/mcp/authorize?${authorizeQuery}`, {
		redirect: "manual",
		headers: { cookie },
	})
	const consentLocation = authorizeResponse.headers.get("location") ?? ""
	const consentCode = new URL(consentLocation, ORIGIN).searchParams.get("consent_code") ?? ""
	check(
		"a signed-in authorize goes to the consent page, never straight to a code",
		consentLocation.startsWith("/mcp/consent?") && consentCode.length > 0,
		consentLocation,
	)

	// read the client's name, then accept the consent for a code
	const clientNameResponse = await apiRequest(`/api/mcp/clients/${registeredClientId}`, { headers: { cookie } })
	const clientNameJson = clientNameResponse.ok ? ((await clientNameResponse.json()) as { name: string }) : null
	check("the consent page can name the client", clientNameJson?.name === "mcp-smoke", clientNameResponse.status)
	const consentResponse = await apiRequest("/api/auth/oauth2/consent", {
		method: "POST",
		headers: { "content-type": "application/json", origin: ORIGIN, cookie },
		body: JSON.stringify({ accept: true, consent_code: consentCode }),
	})
	const consentJson = (await consentResponse.json()) as { redirectURI?: string }
	const authorizationCode = consentJson.redirectURI ? new URL(consentJson.redirectURI).searchParams.get("code") : null
	check(
		"consent returns the client's redirect with a code",
		consentResponse.ok && Boolean(authorizationCode),
		consentResponse.status,
	)

	// exchange the code and the verifier for a token
	const tokenResponse = await apiRequest("/api/auth/mcp/token", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: authorizationCode,
			redirect_uri: REDIRECT_URI,
			client_id: registeredClientId,
			code_verifier: verifier,
		}),
	})
	const tokenJson = (await tokenResponse.json()) as { access_token?: string }
	check(
		"the token exchange issues an access token",
		tokenResponse.ok && Boolean(tokenJson.access_token),
		tokenResponse.status,
	)
	return tokenJson.access_token ?? ""
}

/** Checks a user's writes: marking consumed, rating, bookmarking, and the edit tools. */
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

	// save the topic's prompt, then read its newest prompt version
	const updateTopicPromptResult = await client.callTool({
		name: "update_topic_prompt",
		arguments: { topic_id: topicId, prompt: "smoke, edited over mcp" },
	})
	const [version] = await db
		.select()
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, topicId))
		.orderBy(desc(topicPromptVersions.createdAt))
		.limit(1)
	check(
		"update_topic_prompt saves and versions with origin mcp",
		toResultText(updateTopicPromptResult).startsWith("Saved") &&
			version?.origin === "mcp" &&
			version.prompt === "smoke, edited over mcp",
		toResultText(updateTopicPromptResult),
	)

	// add a source, find its id in the topic list, and remove it by that id
	const addTopicSourceText = toResultText(
		await client.callTool({
			name: "add_source",
			arguments: { topic_id: topicId, sourceOption: "reddit", value: "r/startups" },
		}),
	)
	check(
		"add_source returns the source and its cost",
		addTopicSourceText.startsWith("Added reddit — r/startups") && addTopicSourceText.includes("¢"),
		addTopicSourceText,
	)
	const listTopicsPage = toResultJson<TopicPage>(await client.callTool({ name: "list_topics", arguments: {} }))
	const listedTopic = listTopicsPage.items.find((listedItem) => listedItem.topicId === topicId)
	const listedTopicSource = listedTopic?.sources.find((topicSource) => topicSource.label === "reddit — r/startups")
	check("list_topics shows the source with its id", Boolean(listedTopicSource?.sourceId), listedTopic)
	const removeArguments = { topic_id: topicId, sourceId: listedTopicSource?.sourceId ?? "" }
	const removeTopicSourceText = toResultText(
		await client.callTool({ name: "remove_source", arguments: removeArguments }),
	)
	check(
		"remove_source drops it by that id",
		removeTopicSourceText === "Removed reddit — r/startups.",
		removeTopicSourceText,
	)
	// remove the same id again. the result says it was already gone
	const repeatRemoveTopicSourceText = toResultText(
		await client.callTool({ name: "remove_source", arguments: removeArguments }),
	)
	check(
		"a second removal says it was already gone",
		repeatRemoveTopicSourceText.includes("already gone"),
		repeatRemoveTopicSourceText,
	)

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
