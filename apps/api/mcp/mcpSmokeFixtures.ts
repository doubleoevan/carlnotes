// the fixtures of the mcp smoke: one run's ids, the seeded owner and topic, the checks, the sdk client, and the cleanup

import { db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { accounts, oauthApplications, users } from "@carlnotes/db/schema/users"
import { deleteUserLiteLLMKey } from "@carlnotes/models/litellm"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { hashPassword } from "better-auth/crypto"
import { eq, inArray } from "drizzle-orm"
import { apiRoute } from "../api"
import { mcpRoute } from "./server"

// one id per run, and every fixture id derives from it. parallel runs never collide
export const runId = `mcp-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const ownerId = `${runId}-owner`
export const ownerEmail = `${ownerId}@example.com`
export const ownerPassword = `${runId}-password`
export const topicId = `${runId}-topic`
const resourceUrls = [1, 2, 3].map((index) => `https://example.test/${runId}/${index}`)

// each check prints its own line and counts its failure
export let failureCount = 0

/** Prints a passed check's line, or counts a failed check and prints what it saw. */
export function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print the pass, or count the failure and print what it saw
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

/** Returns the text of a tool result. */
export function toResultText(toolResult: unknown): string {
	const resultContent = (toolResult as { content?: { type: string; text?: string }[] }).content ?? []
	return resultContent.map((contentPart) => contentPart.text ?? "").join("\n")
}

/** Returns a tool result's text parsed as json. */
export function toResultJson<Shape>(toolResult: unknown): Shape {
	return JSON.parse(toResultText(toolResult)) as Shape
}

// the page read_topic_feed returns
export type FeedPage = { items: { findingId: string; isConsumed?: boolean }[] }

// the page list_topics returns
export type TopicPage = { items: { topicId: string; sources: { sourceId: string; label: string }[] }[] }

/** Seeds a public topic with enough findings to be shown, owned by a user who can sign in. */
export async function seed(): Promise<void> {
	await db.insert(users).values({
		id: ownerId,
		name: ownerId,
		email: ownerEmail,
		username: ownerId,
		usernameNormalized: ownerId,
	})
	// the owner's password login
	await db.insert(accounts).values({
		userId: ownerId,
		accountId: ownerId,
		providerId: "credential",
		password: await hashPassword(ownerPassword),
	})

	// insert the public topic and a succeeded scan for its findings
	await db
		.insert(topics)
		.values({ id: topicId, ownerId, name: `${runId} topic`, prompt: "smoke", visibility: "public" })
	const [scan] = await db.insert(scans).values({ topicId, ownerId, status: "succeeded" }).returning({ id: scans.id })
	if (!scan) {
		throw new Error("could not seed a scan")
	}

	// insert three resources and a finding for each
	const resourceRows = await db
		.insert(resources)
		.values(resourceUrls.map((url, index) => ({ url, kind: "read" as const, title: `Finding ${index + 1}` })))
		.returning({ id: resources.id })
	await db.insert(findings).values(
		resourceRows.map((resourceRow, index) => ({
			topicId,
			resourceId: resourceRow.id,
			scanId: scan.id,
			foundScanId: scan.id,
			relevanceScore: 0.9 - index * 0.1,
			relevanceExplanation: `Why finding ${index + 1} matters to ${runId}.`,
		})),
	)
}

/**
 * Deletes the LiteLLM key that the created topic's first scan may have created for the user, then every fixture.
 * The user delete cascades through the topic.
 */
export async function cleanUp(registeredClientId: string): Promise<void> {
	await deleteUserLiteLLMKey(ownerId)
	await db.delete(users).where(eq(users.id, ownerId))
	await db.delete(resources).where(inArray(resources.url, resourceUrls))
	if (registeredClientId) {
		await db.delete(oauthApplications).where(eq(oauthApplications.clientId, registeredClientId))
	}
}

/** Returns an sdk client for one route. Its transport fetches from the hono app in-process. */
export function toClient(
	path: string,
	accessToken?: string,
): { client: Client; transport: StreamableHTTPClientTransport } {
	const transport = new StreamableHTTPClientTransport(new URL(`http://carlnotes.test${path}`), {
		fetch: async (url, init) => mcpRoute.request(url, init),
		requestInit: accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : undefined,
	})
	return { client: new Client({ name: "mcp-smoke", version: "1.0.0" }), transport }
}

/** Sends one request through the api tree, which has the session middleware and the forced consent. */
export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
	return apiRoute.request(`http://carlnotes.test${path}`, init)
}
