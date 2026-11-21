// the cards the home draws: topics and podcast episodes in the shape the shared cards read, with their images,
// bylines, reactions, and latest podcast episodes read in batches, and the home's cards of every kind read together

import { type PodcastEpisodeCard, type TopicCard, toReactionCount } from "@carlnotes/contracts/home"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { type ReactionSummary, type SocialTarget, toSocialTargetKey } from "@carlnotes/contracts/social"
import { toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { eq, inArray } from "drizzle-orm"
import { loadLatestPodcastEpisodeRowTopics, loadLatestPodcastEpisodeSummaries } from "../podcast/latestPodcastEpisodes"
import { type PodcastEpisodeRow, podcastEpisodeColumns } from "../podcast/podcastEpisodeRows"
import { loadPodcastEpisodeSummaries, type TopicVideos } from "../podcast/podcastEpisodeShapes"
import { loadReactionSummaries } from "../social/reactionRows"
import { loadTopicOwners, type TopicOwner } from "../topic/topicOwners"
import { loadTopicPostCardRowsById, toTopicPostCardList, toTopicPostTarget } from "../topicPost/topicPosts"

// the topic row a card is built from
type TopicCardRow = typeof topics.$inferSelect

/**
 * A podcast episode card's row with its topic's columns that the card shows.
 */
export type PodcastEpisodeCardRow = {
	podcastEpisodeRow: PodcastEpisodeRow
	topic: Pick<typeof topics.$inferSelect, "id" | "name" | "visibility" | "imageHash">
}

// what the topic cards read beside their rows: each topic's owner and team, the reactions, and each topic's latest
// podcast episode that the user may listen to
type TopicCardReads = {
	topicOwners: Map<string, TopicOwner>
	reactionSummaryByTarget: Map<string, ReactionSummary>
	latestPodcastEpisodeByTopicId: Map<string, PodcastEpisodeSummary>
}

/**
 * Returns the topics' cards in the rows' order, for the user or a visitor.
 */
export async function toTopicCards(topicRows: TopicCardRow[], userId: string | null): Promise<TopicCard[]> {
	if (topicRows.length === 0) {
		return []
	}

	// each topic's owner, team, reactions, and latest podcast episode the user may listen to, read together
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [topicOwners, reactionSummaryByTarget, latestPodcastEpisodeByTopicId] = await Promise.all([
		loadTopicOwners(topicIds, userId),
		loadReactionSummaries({ userId, targets: topicIds.map(toTopicTarget) }),
		loadLatestPodcastEpisodeSummaries(topicRows, userId),
	])
	return toTopicCardList(topicRows, { topicOwners, reactionSummaryByTarget, latestPodcastEpisodeByTopicId })
}

/**
 * Returns the topics' cards in the ids' order, for the user or a visitor.
 */
export async function loadTopicCards(topicIds: string[], userId: string | null): Promise<TopicCard[]> {
	return toTopicCards(await loadTopicCardRows(topicIds), userId)
}

// the topics' rows in the ids' order. a topic deleted since its id was read has no row
async function loadTopicCardRows(topicIds: string[]): Promise<TopicCardRow[]> {
	if (topicIds.length === 0) {
		return []
	}
	const topicRows = await db.select().from(topics).where(inArray(topics.id, topicIds))
	const topicRowById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	return topicIds.flatMap((topicId) => topicRowById.get(topicId) ?? [])
}

// the topics' cards in the rows' order, from what the cards read beside their rows
function toTopicCardList(
	topicRows: TopicCardRow[],
	{ topicOwners, reactionSummaryByTarget, latestPodcastEpisodeByTopicId }: TopicCardReads,
): TopicCard[] {
	return topicRows.map((topicRow) => {
		const reactionSummary = reactionSummaryByTarget.get(toSocialTargetKey(toTopicTarget(topicRow.id)))
		return {
			id: topicRow.id,
			name: topicRow.name,
			path: toTopicPath(topicRow),
			image: toTopicImageUrlsOrNull(topicRow.id, topicRow.imageHash),
			tags: topicRow.tags,
			owner: topicOwners.get(topicRow.id)?.owner ?? null,
			teamLink: topicOwners.get(topicRow.id)?.team ?? null,
			reactionCount: reactionSummary ? toReactionCount(reactionSummary) : 0,
			latestPodcastEpisode: latestPodcastEpisodeByTopicId.get(topicRow.id) ?? null,
		}
	})
}

/**
 * Returns the podcast episodes' cards in the ids' order, each with its topic's page and image and its reaction count.
 */
export async function loadPodcastEpisodeCards(podcastEpisodeIds: string[]): Promise<PodcastEpisodeCard[]> {
	return loadPodcastEpisodeCardsFromRows(await loadPodcastEpisodeCardRows(podcastEpisodeIds))
}

// the films and the reactions the caller already read, each read here if the caller passes none
type PodcastEpisodeCardReads = {
	topicVideos?: TopicVideos | Promise<TopicVideos>
	reactionSummaryByTarget?: Promise<Map<string, ReactionSummary>>
}

/**
 * Returns the cards of podcast episodes whose rows and topics the caller already read, in the rows' order, with the
 * films and the reactions the caller read if it passes them.
 */
export async function loadPodcastEpisodeCardsFromRows(
	podcastEpisodeCardRows: PodcastEpisodeCardRow[],
	{ topicVideos, reactionSummaryByTarget: loadedReactionSummaryByTarget }: PodcastEpisodeCardReads = {},
): Promise<PodcastEpisodeCard[]> {
	// the summaries the player's rows show and the reactions, read together
	const [podcastEpisodeSummaries, reactionSummaryByTarget] = await Promise.all([
		loadPodcastEpisodeSummaries(podcastEpisodeCardRows, topicVideos),
		loadedReactionSummaryByTarget ??
			loadReactionSummaries({ userId: null, targets: podcastEpisodeCardRows.map(toPodcastEpisodeCardTarget) }),
	])
	return toPodcastEpisodeCards(podcastEpisodeSummaries, podcastEpisodeCardRows, reactionSummaryByTarget)
}

// each podcast episode's row with its topic, in the ids' order. a podcast episode gone since its id was read has none
async function loadPodcastEpisodeCardRows(podcastEpisodeIds: string[]): Promise<PodcastEpisodeCardRow[]> {
	if (podcastEpisodeIds.length === 0) {
		return []
	}
	const podcastEpisodeRows = await db
		.select({
			podcastEpisodeRow: podcastEpisodeColumns,
			topic: { id: topics.id, name: topics.name, visibility: topics.visibility, imageHash: topics.imageHash },
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
	const rowById = new Map(podcastEpisodeRows.map((row) => [row.podcastEpisodeRow.id, row]))
	return podcastEpisodeIds.flatMap((podcastEpisodeId) => rowById.get(podcastEpisodeId) ?? [])
}

// the podcast episodes' cards from their summaries, in their rows' order, each with its topic's page and image
function toPodcastEpisodeCards(
	podcastEpisodeSummaries: PodcastEpisodeSummary[],
	podcastEpisodeCardRows: PodcastEpisodeCardRow[],
	reactionSummaryByTarget: Map<string, ReactionSummary>,
): PodcastEpisodeCard[] {
	return podcastEpisodeSummaries.map((podcastEpisode, index) => {
		const topic = podcastEpisodeCardRows[index]?.topic
		const reactionSummary = reactionSummaryByTarget.get(
			toSocialTargetKey({ kind: "podcastEpisode", id: podcastEpisode.id }),
		)
		return {
			podcastEpisode,
			reactionCount: reactionSummary ? toReactionCount(reactionSummary) : 0,
			topic: {
				id: topic?.id ?? "",
				name: topic?.name ?? "",
				path: topic ? toTopicPath(topic) : "",
				image: topic ? toTopicImageUrlsOrNull(topic.id, topic.imageHash) : null,
			},
		}
	})
}

// the home's cards by the ids that the home lists, and the user's topic rows if the user is signed in
type LoadHomeCardsOptions = {
	homeTopicIds: string[]
	yourTopicRows: TopicCardRow[]
	podcastEpisodeIds: string[]
	topicPostIds: string[]
	userId: string | null
}

// the home's topic cards, the user's topic cards, the podcast episode cards, and the Topic Post cards, each in its ids'
// or rows' order
type HomeCards = {
	homeTopics: TopicCard[]
	yourTopicCards: TopicCard[]
	podcastEpisodeCards: PodcastEpisodeCard[]
	topicPostCards: TopicPostCard[]
}

/**
 * Returns every card the home shows, with one read of each kind's rows, one read of every card's reactions, one read
 * of the topics' owners, and one read of the podcast episodes' chapter counts and films.
 */
export async function loadHomeCards({
	homeTopicIds,
	yourTopicRows,
	podcastEpisodeIds,
	topicPostIds,
	userId,
}: LoadHomeCardsOptions): Promise<HomeCards> {
	// the cards' rows, the topics' owners, and every card's reactions, which the ids already name, read together
	const topicIds = [...new Set([...homeTopicIds, ...yourTopicRows.map((topicRow) => topicRow.id)])]
	const reactionTargets = [
		...topicIds.map(toTopicTarget),
		...podcastEpisodeIds.map((id) => ({ kind: "podcastEpisode" as const, id })),
		...topicPostIds.map(toTopicPostTarget),
	]
	const [homeTopicRows, podcastEpisodeCardRows, topicPostCardRows, topicOwners, reactionSummaryByTarget] =
		await Promise.all([
			loadTopicCardRows(homeTopicIds),
			loadPodcastEpisodeCardRows(podcastEpisodeIds),
			loadTopicPostCardRowsById(topicPostIds),
			loadTopicOwners(topicIds, userId),
			loadReactionSummaries({ userId, targets: reactionTargets }),
		])

	// each topic's latest podcast episode that the user may listen to, then one read of every podcast episode's chapter
	// count and film, the latest ones first
	const latestPodcastEpisodeRowTopics = await loadLatestPodcastEpisodeRowTopics(
		[...homeTopicRows, ...yourTopicRows],
		userId,
	)
	const podcastEpisodeSummaries = await loadPodcastEpisodeSummaries([
		...latestPodcastEpisodeRowTopics,
		...podcastEpisodeCardRows,
	])
	const latestPodcastEpisodeCount = latestPodcastEpisodeRowTopics.length
	const latestPodcastEpisodeByTopicId = new Map(
		latestPodcastEpisodeRowTopics.map(({ topic }, i) => [
			topic.id,
			podcastEpisodeSummaries[i] as PodcastEpisodeSummary,
		]),
	)

	// every card from its row and what the cards read
	const topicCardReads = { topicOwners, reactionSummaryByTarget, latestPodcastEpisodeByTopicId }
	return {
		homeTopics: toTopicCardList(homeTopicRows, topicCardReads),
		yourTopicCards: toTopicCardList(yourTopicRows, topicCardReads),
		podcastEpisodeCards: toPodcastEpisodeCards(
			podcastEpisodeSummaries.slice(latestPodcastEpisodeCount),
			podcastEpisodeCardRows,
			reactionSummaryByTarget,
		),
		topicPostCards: toTopicPostCardList(topicPostCardRows, reactionSummaryByTarget),
	}
}

// a topic as the social target its reactions hang on
function toTopicTarget(topicId: string): SocialTarget {
	return { kind: "topic", id: topicId }
}

// a podcast episode card's row as the social target its reactions hang on
function toPodcastEpisodeCardTarget({ podcastEpisodeRow }: PodcastEpisodeCardRow): SocialTarget {
	return { kind: "podcastEpisode", id: podcastEpisodeRow.id }
}

/**
 * Returns the cards of a list's podcast episodes in the ids' order, from cards read for every list at once. An id with
 * no card among them is left out.
 */
export function toPodcastEpisodeCardList(
	podcastEpisodeCards: PodcastEpisodeCard[],
	podcastEpisodeIds: string[],
): PodcastEpisodeCard[] {
	const podcastEpisodeCardById = new Map(
		podcastEpisodeCards.map((podcastEpisodeCard) => [podcastEpisodeCard.podcastEpisode.id, podcastEpisodeCard]),
	)
	return podcastEpisodeIds.flatMap((podcastEpisodeId) => podcastEpisodeCardById.get(podcastEpisodeId) ?? [])
}
