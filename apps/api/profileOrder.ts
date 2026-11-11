// a topic's, a podcast episode's, and a film's position among the rows their topic's owner pinned to their profile,
// and a Topic Post's among the ones its author pinned to theirs: the writes and their routes

import { pinnedOrderPayload } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import {
	setPodcastEpisodeProfileOrder,
	setTopicPodcastEpisodeVideoProfileOrder,
	setTopicPostProfileOrder,
	setTopicProfileOrder,
} from "@carlnotes/db/profileOrder"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { gatedTopicColumns } from "@carlnotes/db/topicPermissions"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "./authorization"
import { type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"
import { purgeProfileAtEdge } from "./edgeCache"

// whether the profile order was applied, and if not, which rule rejected it: no such row for this user, a topic that
// is not public, a podcast episode or a Topic Post that is not published, or a film that is not ready, or a profile
// whose pinned topics, films, or podcast episodes are at their limit
type ProfileOrderResult = "ranked" | "missing" | "notPublic" | "full"

// what a profile order request names: the user, the row, and the position, where zero clears it
type SetProfileOrderOptions = { userId: string; id: string; position: number }

/**
 * Sets a public topic's position among the topics its owner pinned to their profile. Only the topic's owner sets it,
 * and anyone else is told the topic is missing.
 */
async function setTopicProfileOrderForOwner({
	userId,
	id,
	position,
}: SetProfileOrderOptions): Promise<ProfileOrderResult> {
	// the topic, for its owner alone
	const [topic] = await db.select(gatedTopicColumns).from(topics).where(eq(topics.id, id))
	if (!topic || !(await isAllowed(userId, "profile:setProfileOrder", topic))) {
		return "missing"
	}

	// only a public topic holds a profile order
	if (topic.visibility !== "public") {
		return "notPublic"
	}
	const isRanked = await db.transaction((transaction) =>
		setTopicProfileOrder({ id, ownerId: topic.ownerId, position, transaction }),
	)
	return isRanked ? "ranked" : "full"
}

/**
 * Sets a published podcast episode's position among the podcast episodes its topic's owner pinned to their profile,
 * with the topic's rules.
 */
async function setPodcastEpisodeProfileOrderForOwner({
	userId,
	id,
	position,
}: SetProfileOrderOptions): Promise<ProfileOrderResult> {
	// the podcast episode's status and its topic, for the topic's owner alone
	const [podcastEpisodeRow] = await db
		.select({ status: podcastEpisodes.status, topic: gatedTopicColumns })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(eq(podcastEpisodes.id, id))
	if (!podcastEpisodeRow || !(await isAllowed(userId, "profile:setProfileOrder", podcastEpisodeRow.topic))) {
		return "missing"
	}

	// only a published podcast episode of a public topic holds a profile order
	const { status, topic } = podcastEpisodeRow
	if (status !== "published" || topic.visibility !== "public") {
		return "notPublic"
	}
	const isRanked = await db.transaction((transaction) =>
		setPodcastEpisodeProfileOrder({ id, ownerId: topic.ownerId, position, transaction }),
	)
	return isRanked ? "ranked" : "full"
}

/**
 * Sets a ready film's position among the films its topic's owner pinned to their profile, with the topic's rules.
 * The id is the film's podcast episode.
 */
async function setTopicPodcastEpisodeVideoProfileOrderForOwner({
	userId,
	id,
	position,
}: SetProfileOrderOptions): Promise<ProfileOrderResult> {
	// the film with its podcast episode's status and its topic, for the topic's owner alone
	const [filmRow] = await db
		.select({
			id: topicPodcastEpisodeVideos.id,
			status: topicPodcastEpisodeVideos.status,
			podcastEpisodeStatus: podcastEpisodes.status,
			topic: gatedTopicColumns,
		})
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, id))
	if (!filmRow || !(await isAllowed(userId, "profile:setProfileOrder", filmRow.topic))) {
		return "missing"
	}

	// only a ready film of a published podcast episode of a public topic holds a profile order
	const { status, podcastEpisodeStatus, topic } = filmRow
	if (status !== "ready" || podcastEpisodeStatus !== "published" || topic.visibility !== "public") {
		return "notPublic"
	}
	const isRanked = await db.transaction((transaction) =>
		setTopicPodcastEpisodeVideoProfileOrder({ id: filmRow.id, ownerId: topic.ownerId, position, transaction }),
	)
	return isRanked ? "ranked" : "full"
}

/**
 * Sets a published Topic Post's position among the Topic Posts its author pinned to their profile, with the topic's
 * rules and no limit. Only the post's author sets it, and anyone else is told the post is missing.
 */
async function setTopicPostProfileOrderForAuthor({
	userId,
	id,
	position,
}: SetProfileOrderOptions): Promise<ProfileOrderResult> {
	// the Topic Post's author and published time, and its topic's visibility, for the author alone
	const [topicPostRow] = await db
		.select({
			authorUserId: topicPosts.authorUserId,
			publishedAt: topicPosts.publishedAt,
			visibility: topics.visibility,
		})
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(eq(topicPosts.id, id))
	if (!topicPostRow || topicPostRow.authorUserId !== userId) {
		return "missing"
	}

	// only a published Topic Post of a public topic holds a profile order
	if (!topicPostRow.publishedAt || topicPostRow.visibility !== "public") {
		return "notPublic"
	}

	// an author's pinned Topic Posts have no limit, so the write always applies
	await db.transaction((transaction) => setTopicPostProfileOrder({ id, ownerId: userId, position, transaction }))
	return "ranked"
}

// which kind of row a profile order request pins, and the write that pins it
type ProfileOrderWrite = {
	kind: "topic" | "podcastEpisode" | "topicPodcastEpisodeVideo" | "topicPost"
	setProfileOrder: (options: SetProfileOrderOptions) => Promise<ProfileOrderResult>
}

// answer one profile order request: run the write for the signed-in user, purge their profile, and report the change
async function respondToProfileOrder(
	context: Context<AppEnv>,
	position: number,
	{ kind, setProfileOrder }: ProfileOrderWrite,
): Promise<Response> {
	// reject a signed-out visitor
	const userId = currentUser(context)
	if (!userId) {
		return context.json({ error: "unauthorized" }, 401)
	}

	// position zero clears the row's order. a row that is missing, or is someone else's, reads as not found
	const id = context.req.param("id") ?? ""
	const profileOrderResult = await setProfileOrder({ userId, id, position })
	if (profileOrderResult === "missing") {
		return context.json({ error: "not found" }, 404)
	}

	// each other rejection is a conflict that names its rule
	if (profileOrderResult === "notPublic") {
		return context.json(
			{ error: "only a public topic and its published podcast episodes, ready films, and Topic Posts can be pinned" },
			409,
		)
	}
	if (profileOrderResult === "full") {
		return context.json({ error: "the profile's pins are at their limit" }, 409)
	}

	// the owner's profile page shows the change at once, and the event names ids alone
	await purgeProfileAtEdge(userId)
	trackEvent("social_profile_order_change", userId, {
		...toAnalyticsProperties(context),
		kind,
		objectId: id,
		position,
	})
	return context.json({ ok: true })
}

// the profile order routes, for a topic's owner and a Topic Post's author only
export const profileOrderRoute = new Hono<AppEnv>()
	.patch("/topics/:id/profile-order", zValidator("json", pinnedOrderPayload), (context) =>
		respondToProfileOrder(context, context.req.valid("json").position, {
			kind: "topic",
			setProfileOrder: setTopicProfileOrderForOwner,
		}),
	)
	.patch("/podcast-episodes/:id/profile-order", zValidator("json", pinnedOrderPayload), (context) =>
		respondToProfileOrder(context, context.req.valid("json").position, {
			kind: "podcastEpisode",
			setProfileOrder: setPodcastEpisodeProfileOrderForOwner,
		}),
	)
	.patch("/podcast-episodes/:id/video/profile-order", zValidator("json", pinnedOrderPayload), (context) =>
		respondToProfileOrder(context, context.req.valid("json").position, {
			kind: "topicPodcastEpisodeVideo",
			setProfileOrder: setTopicPodcastEpisodeVideoProfileOrderForOwner,
		}),
	)
	.patch("/topic-posts/:id/profile-order", zValidator("json", pinnedOrderPayload), (context) =>
		respondToProfileOrder(context, context.req.valid("json").position, {
			kind: "topicPost",
			setProfileOrder: setTopicPostProfileOrderForAuthor,
		}),
	)
