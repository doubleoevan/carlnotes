// the podcast episode smoke's fixtures: one run's ids, the routes under a header-read user, the check and request
// helpers, and the seed and clean up of the users, topics, episodes, chapter, and subscriptions
import { HOUR_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { favicons } from "@carlnotes/db/schema/storage"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { documentsRoute } from "../documents"
import { podcastEpisodesRoute } from "./podcastEpisodes"
import { podcastFeedsRoute } from "./podcastFeeds"

// one id per run, and every fixture id derives from it. two runs at once never collide
export const runId = `episodes-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const ownerId = `${runId}-owner`
export const paidOwnerId = `${runId}-paid-owner`
export const subscriberId = `${runId}-subscriber`

// the host of the chapter's source, which has a stored favicon
export const chapterSourceHost = `${runId}.example`

// the public, invite, paid, and private topics
export const publicTopicId = `${runId}-public`
export const inviteTopicId = `${runId}-invite`
export const paidTopicId = `${runId}-paid`
export const privateTopicId = `${runId}-private`

// the public, invite, and private topics' podcast episodes, and the chapter's resource and finding
export const publicPodcastEpisodeId = `${runId}-public-episode`
export const invitePodcastEpisodeId = `${runId}-invite-episode`
export const privatePodcastEpisodeId = `${runId}-private-episode`
const resourceId = `${runId}-resource`
export const findingId = `${runId}-finding`

// the routes and the feed documents under a middleware that reads the user from a header, in place of the session
const app = new Hono<AppEnv>()
	.use("*", async (context, next) => {
		const userId = context.req.header("x-smoke-user")
		context.set("user", userId ? ({ id: userId } as SessionUser) : null)
		await next()
	})
	// the podcast episode routes, the feed and cover routes, and the feed documents
	.route("/", podcastEpisodesRoute)
	.route("/", podcastFeedsRoute)
	.route("/", documentsRoute)

// each check reports its own line, and one failure fails the run
let failureCount = 0

/**
 * Reports one check's line, and counts a failure against the run.
 */
export function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print one line for a pass, and the detail for a failure
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// a request's path, the user to send it as or null for a visitor, and its method, headers, and body
type RequestOptions = { path: string; userId: string | null; init?: RequestInit }

/**
 * Sends one request as the given user, or as a visitor.
 */
export function request({ path, userId, init = {} }: RequestOptions): Promise<Response> {
	const userHeaders: Record<string, string> = userId ? { "x-smoke-user": userId } : {}
	return Promise.resolve(app.request(path, { ...init, headers: { ...userHeaders, ...init.headers } }))
}

// a JSON request's path, its user, its method, and its body
type SendJsonOptions = { path: string; userId: string | null; method: string; body: unknown }

/**
 * Sends a JSON body as the given user.
 */
export function sendJson({ path, userId, method, body }: SendJsonOptions): Promise<Response> {
	const init = { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
	return request({ path, userId, init })
}

// one account, named by its own id
function toUserRow(id: string, plan: "free" | "plus" = "free"): typeof users.$inferInsert {
	return { id, name: id, email: `${id}@example.com`, username: id, usernameNormalized: id, plan }
}

// the id, the topic, and the topic's owner of one podcast episode to seed
type ToPodcastEpisodeRowOptions = { id: string; topicId: string; topicOwnerId: string }

// one published podcast episode of a topic, an hour old, with its scan's id
function toPodcastEpisodeRow({
	id,
	topicId,
	topicOwnerId,
}: ToPodcastEpisodeRowOptions): typeof podcastEpisodes.$inferInsert {
	return {
		id,
		topicId,
		ownerId: topicOwnerId,
		scanId: `${id}-scan`,
		status: "published",
		title: "A quieter grinder",
		description: "A quieter burr set.",
		season: 2026,
		episodeNumber: 1,
		audioKey: `episodes/${id}/audio.mp3`,
		audioByteSize: 123_456,
		durationSeconds: 120,
		cost: "0.050000",
		publishedAt: new Date(Date.now() - HOUR_MS),
	}
}

/**
 * Seeds a free owner with a public and an invite topic, a paid owner with a topic and a private topic, a subscriber
 * who joined the invite topic just now, and one published podcast episode on the public, the invite, and the private
 * topic.
 */
export async function seed(): Promise<void> {
	await db.insert(users).values([toUserRow(ownerId), toUserRow(paidOwnerId, "plus"), toUserRow(subscriberId)])
	await db.insert(topics).values([
		{ id: publicTopicId, ownerId, name: `${runId} public`, visibility: "public" },
		{ id: inviteTopicId, ownerId, name: `${runId} invite`, visibility: "invite" },
		{
			id: paidTopicId,
			ownerId: paidOwnerId,
			name: `${runId} paid`,
			visibility: "private",
			isPodcastEnabled: false,
		},
		{ id: privateTopicId, ownerId: paidOwnerId, name: `${runId} private`, visibility: "private" },
	])
	await db.insert(scans).values([
		{ id: `${publicPodcastEpisodeId}-scan`, topicId: publicTopicId, ownerId, status: "succeeded" },
		{ id: `${invitePodcastEpisodeId}-scan`, topicId: inviteTopicId, ownerId, status: "succeeded" },
		{ id: `${privatePodcastEpisodeId}-scan`, topicId: privateTopicId, ownerId: paidOwnerId, status: "succeeded" },
	])

	// the podcast episodes, with one chapter on the public topic's episode that narrates one finding
	await db
		.insert(podcastEpisodes)
		.values([
			toPodcastEpisodeRow({ id: publicPodcastEpisodeId, topicId: publicTopicId, topicOwnerId: ownerId }),
			toPodcastEpisodeRow({ id: invitePodcastEpisodeId, topicId: inviteTopicId, topicOwnerId: ownerId }),
			toPodcastEpisodeRow({ id: privatePodcastEpisodeId, topicId: privateTopicId, topicOwnerId: paidOwnerId }),
		])
	await db.insert(resources).values({ id: resourceId, url: `https://episodes-smoke.example/${runId}`, kind: "read" })
	const findingTopicAndScanIds = { topicId: publicTopicId, scanId: `${publicPodcastEpisodeId}-scan` }
	await db.insert(findings).values({ id: findingId, resourceId, relevanceScore: 0.9, ...findingTopicAndScanIds })
	const chapterTimes = { startSeconds: 0, endSeconds: 120 }
	await db.insert(podcastEpisodeChapters).values({
		podcastEpisodeId: publicPodcastEpisodeId,
		position: 0,
		findingId,
		resourceId,
		title: "The grinder",
		sourceUrl: `https://${chapterSourceHost}/grinder`,
		...chapterTimes,
	})
	await db.insert(favicons).values({ host: chapterSourceHost, objectKey: `favicons/${runId}` })

	// the subscriber holds a subscription to both topics and joined after the invite topic's podcast episode published
	await db.insert(subscriptions).values([
		{ topicId: publicTopicId, subscriberUserId: subscriberId },
		{ topicId: inviteTopicId, subscriberUserId: subscriberId },
	])
}

/**
 * Deletes the fixtures. The users' delete cascades to their topics, scans, podcast episodes, and subscriptions, and
 * the resource and the favicon belong to no user.
 */
export async function cleanUp(): Promise<void> {
	await db.delete(users).where(inArray(users.id, [ownerId, paidOwnerId, subscriberId]))
	await db.delete(resources).where(eq(resources.id, resourceId))
	await db.delete(favicons).where(eq(favicons.host, chapterSourceHost))
}

/**
 * Returns how many checks failed.
 */
export function toFailureCount(): number {
	return failureCount
}
