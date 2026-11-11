// the cards a profile's and a team's card sections draw: the topics, their published podcast episodes, and a profile's
// films, the pinned ones first in their order and then the rest in the home's order, and every published Topic Post
// of the person or of the team's topics, the pinned ones first in their order and then the rest newest first

import type { PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"
import type {
	ProfilePodcastEpisodeCard,
	ProfileTopicCard,
	ProfileTopicPostCard,
} from "@carlnotes/contracts/profilePage"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { isReadyFilmOfPodcastEpisode } from "./home/homeCardIds"
import { loadPodcastEpisodeCards, toPodcastEpisodeCardList, toTopicCards } from "./home/topicCards"
import { loadProfileOrderTopicPostRows, toTopicPostCards } from "./topicPost/topicPosts"

// how many of a person's published podcast episodes the read takes before keeping the pinned ones and one per topic
// ponytail: limits a long-running podcast. rank one per topic in sql past it
const PODCAST_EPISODE_CANDIDATE_LIMIT = 500

// whose profile it is, and whether its reader sees the person's topics that are not public
type LoadProfileTopicRowsOptions = { profileUserId: string; includesNonPublicTopics: boolean }

// the person's topics that the reader sees, in the profile's order, and who reads them
type LoadProfileCardsOptions = { topicRows: (typeof topics.$inferSelect)[]; userId: string | null }

// the cards of a profile's topic, film, and podcast episode sections, each with how many of its first cards are pinned
type ProfileCards = {
	profileTopics: ProfileTopicCard[]
	pinnedTopicCount: number
	profileTopicPodcastEpisodeVideos: ProfilePodcastEpisodeCard[]
	pinnedTopicPodcastEpisodeVideoCount: number
	profilePodcastEpisodes: ProfilePodcastEpisodeCard[]
	pinnedPodcastEpisodeCount: number
}

/**
 * Loads the cards of a profile's topic, film, and podcast episode sections for the user or a visitor, from the
 * person's topics that the reader sees, in the profile's order.
 */
export async function loadProfileCards({ topicRows, userId }: LoadProfileCardsOptions): Promise<ProfileCards> {
	// the ids of the topics' podcast episodes and of their films that the sections show, read together
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [profilePodcastEpisodeIds, profileFilmIds] = await Promise.all([
		loadProfilePodcastEpisodeIds(topicIds),
		loadProfileTopicPodcastEpisodeVideoIds(topicIds),
	])

	// the topics' cards, beside one read of the cards of both sections' podcast episodes, each podcast episode once
	const sectionPodcastEpisodeIds = [...profileFilmIds.podcastEpisodeIds, ...profilePodcastEpisodeIds.podcastEpisodeIds]
	const [topicCards, podcastEpisodeCards] = await Promise.all([
		toTopicCards(topicRows, userId),
		loadPodcastEpisodeCards([...new Set(sectionPodcastEpisodeIds)]),
	])

	// each section's cards in its ids' order, each with whether its topic is public
	const publicTopicIds = new Set(
		topicRows.filter((topicRow) => topicRow.visibility === "public").map((topicRow) => topicRow.id),
	)
	const toProfilePodcastEpisodeCards = (podcastEpisodeIds: string[]): ProfilePodcastEpisodeCard[] =>
		toPodcastEpisodeCardList(podcastEpisodeCards, podcastEpisodeIds).map((podcastEpisodeCard) => ({
			...podcastEpisodeCard,
			isTopicPublic: publicTopicIds.has(podcastEpisodeCard.topic.id),
		}))

	return {
		profileTopics: topicCards.map((topicCard) => ({ ...topicCard, isPublic: publicTopicIds.has(topicCard.id) })),
		pinnedTopicCount: topicRows.filter((topicRow) => topicRow.profileOrder !== null).length,
		// the film cards, right before the podcast episode cards
		profileTopicPodcastEpisodeVideos: toProfilePodcastEpisodeCards(profileFilmIds.podcastEpisodeIds),
		pinnedTopicPodcastEpisodeVideoCount: profileFilmIds.pinnedTopicPodcastEpisodeVideoCount,
		profilePodcastEpisodes: toProfilePodcastEpisodeCards(profilePodcastEpisodeIds.podcastEpisodeIds),
		pinnedPodcastEpisodeCount: profilePodcastEpisodeIds.pinnedPodcastEpisodeCount,
	}
}

// the cards of topics in their profile order, and of the podcast episodes of those topics that a section shows
type ProfileOrderCards = {
	topicCards: TopicCard[]
	podcastEpisodeCards: PodcastEpisodeCard[]
	pinnedPodcastEpisodeCount: number
}

// the cards of topic rows already in their profile order, and of the podcast episodes of those topics
async function loadProfileOrderCards(
	topicRows: (typeof topics.$inferSelect)[],
	userId: string | null,
): Promise<ProfileOrderCards> {
	const { podcastEpisodeIds, pinnedPodcastEpisodeCount } = await loadProfilePodcastEpisodeIds(
		topicRows.map((topicRow) => topicRow.id),
	)
	const [topicCards, podcastEpisodeCards] = await Promise.all([
		toTopicCards(topicRows, userId),
		loadPodcastEpisodeCards(podcastEpisodeIds),
	])
	return { topicCards, podcastEpisodeCards, pinnedPodcastEpisodeCount }
}

// the cards of a team's topic, podcast episode, and Topic Post sections
type TeamCards = Omit<ProfileOrderCards, "pinnedPodcastEpisodeCount"> & { topicPostCards: TopicPostCard[] }

/**
 * Loads the cards of a team's topic, podcast episode, and Topic Post sections from the ids of its topics that the
 * reader may open. The topics that their owners pinned lead in their profile order, the newer first where two owners
 * pinned at one position, and the rest follow in the home's trending order. The podcast episodes of those topics
 * follow the same rule. Every published Topic Post of those topics is listed, the ones that their authors pinned
 * first in their profile order, then the rest newest first.
 */
export async function loadTeamCards(topicIds: string[], userId: string | null): Promise<TeamCards> {
	if (topicIds.length === 0) {
		return { topicCards: [], podcastEpisodeCards: [], topicPostCards: [] }
	}

	// the topics in their profile order as cards with their podcast episodes' cards, beside one read of the topics'
	// published Topic Posts as cards
	const [{ topicCards, podcastEpisodeCards }, topicPostCards] = await Promise.all([
		db
			.select()
			.from(topics)
			.where(inArray(topics.id, topicIds))
			.orderBy(...PROFILE_TOPIC_ORDER)
			.then((topicRows) => loadProfileOrderCards(topicRows, userId)),
		loadProfileOrderTopicPostRows(inArray(topicPosts.topicId, topicIds)).then(toTopicPostCards),
	])
	return { topicCards, podcastEpisodeCards, topicPostCards }
}

// the Topic Post cards of a profile, with how many of the first are pinned
type ProfileTopicPostCards = { profileTopicPosts: ProfileTopicPostCard[]; pinnedTopicPostCount: number }

/**
 * Loads the cards of every published Topic Post of a person: the pinned ones in their order, then the rest newest
 * first. The person reads every post, and anyone else the posts of public topics alone.
 */
export async function loadProfileTopicPostCards(
	authorUserId: string,
	isAuthor: boolean,
): Promise<ProfileTopicPostCards> {
	// ponytail: one read of every post of the person, which the page lists whole. page on the server past hundreds
	const topicPostRows = await loadProfileOrderTopicPostRows(
		and(eq(topicPosts.authorUserId, authorUserId), isAuthor ? undefined : eq(topics.visibility, "public")),
	)
	const topicPostCards = await toTopicPostCards(topicPostRows)

	// each card with whether its topic is public, and how many of the rows are pinned
	return {
		profileTopicPosts: topicPostCards.map((topicPostCard, index) => ({
			...topicPostCard,
			isTopicPublic: topicPostRows[index]?.topic.visibility === "public",
		})),
		pinnedTopicPostCount: topicPostRows.filter(({ topicPost }) => topicPost.profileOrder !== null).length,
	}
}

// the profile order of topics: the pinned ones by their position, the newest first among those at one position, then
// the home's trending order, most viewed, then most followed, then newest
const PROFILE_TOPIC_ORDER = [
	sql`${topics.profileOrder} is null`,
	asc(topics.profileOrder),
	sql`case when ${topics.profileOrder} is null then ${topics.viewerCount} end desc`,
	sql`case when ${topics.profileOrder} is null then ${topics.subscriberCount} end desc`,
	desc(topics.createdAt),
]

/**
 * Loads a person's topics in their profile's order: the pinned ones in their order, then the home's trending order,
 * most viewed, then most followed, then newest. A reader who sees only public topics gets those alone.
 */
export function loadProfileTopicRows({
	profileUserId,
	includesNonPublicTopics,
}: LoadProfileTopicRowsOptions): Promise<(typeof topics.$inferSelect)[]> {
	const visibleTopicsFilter = includesNonPublicTopics
		? eq(topics.ownerId, profileUserId)
		: and(eq(topics.ownerId, profileUserId), eq(topics.visibility, "public"))

	// the pinned topics lead in their order, and the rest follow in the home's trending order
	return db
		.select()
		.from(topics)
		.where(visibleTopicsFilter)
		.orderBy(...PROFILE_TOPIC_ORDER)
}

/**
 * Loads the ids of the published podcast episodes of the topics that a profile or a team shows: the pinned ones in
 * their order, the newest first among those at one position, then the most listened one of each topic with none shown
 * yet, newest first among ties.
 */
export async function loadProfilePodcastEpisodeIds(
	topicIds: string[],
): Promise<{ podcastEpisodeIds: string[]; pinnedPodcastEpisodeCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedPodcastEpisodeCount: 0 }
	}

	// the topics' published podcast episodes, the pinned ones first, then the most listened
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId, profileOrder: podcastEpisodes.profileOrder })
		.from(podcastEpisodes)
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(podcastEpisodes.profileOrder))
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// keep every pinned one, then the first read of each other topic
	const { rowIds, pinnedCount } = toProfileSectionRowIds(podcastEpisodeRows)
	return { podcastEpisodeIds: rowIds, pinnedPodcastEpisodeCount: pinnedCount }
}

/**
 * Loads the ids of the published podcast episodes whose ready films a profile shows, from the topics that its reader
 * may open: the pinned films in their order, then the most listened one of each topic with none shown yet, newest
 * first among ties.
 */
export async function loadProfileTopicPodcastEpisodeVideoIds(
	topicIds: string[],
): Promise<{ podcastEpisodeIds: string[]; pinnedTopicPodcastEpisodeVideoCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedTopicPodcastEpisodeVideoCount: 0 }
	}

	// the topics' published podcast episodes that have a ready film, the pinned films first, then the most listened
	const filmRows = await db
		.select({
			id: podcastEpisodes.id,
			topicId: podcastEpisodes.topicId,
			profileOrder: topicPodcastEpisodeVideos.profileOrder,
		})
		.from(podcastEpisodes)
		.innerJoin(topicPodcastEpisodeVideos, isReadyFilmOfPodcastEpisode)
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(topicPodcastEpisodeVideos.profileOrder))
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// keep every pinned one, then the first read of each other topic
	const { rowIds, pinnedCount } = toProfileSectionRowIds(filmRows)
	return { podcastEpisodeIds: rowIds, pinnedTopicPodcastEpisodeVideoCount: pinnedCount }
}

// the filter for the published podcast episodes of some topics
function toPublishedPodcastEpisodeFilter(topicIds: string[]): SQL | undefined {
	return and(
		inArray(podcastEpisodes.topicId, topicIds),
		eq(podcastEpisodes.status, "published"),
		isNotNull(podcastEpisodes.publishedAt),
	)
}

// the profile order of podcast episodes by their own pins or by their films' pins: the pinned ones by their position,
// then the most listened, newest first among ties
function toProfilePodcastEpisodeOrder(profileOrderColumn: AnyPgColumn): SQL[] {
	return [
		sql`${profileOrderColumn} is null`,
		asc(profileOrderColumn),
		sql`case when ${profileOrderColumn} is null then ${podcastEpisodes.listenerCount} end desc`,
		desc(podcastEpisodes.publishedAt),
	]
}

// a published podcast episode or film of a topic, with its profile order if it is pinned
type ProfileSectionRow = { id: string; topicId: string | null; profileOrder: number | null }

/**
 * Returns the podcast episodes or the films a card section shows from rows in the section's order: every pinned one,
 * then the first one read of each topic that has none shown yet.
 */
export function toProfileSectionRowIds(profileSectionRows: ProfileSectionRow[]): {
	rowIds: string[]
	pinnedCount: number
} {
	// the topics with a row shown, the ids kept, and how many of them are pinned
	const shownTopicIds = new Set<string>()
	const rowIds: string[] = []
	let pinnedCount = 0
	for (const { id, topicId, profileOrder } of profileSectionRows) {
		// a pinned row always shows, and any other shows only as its topic's first
		const isPinned = profileOrder !== null
		if (!topicId || (!isPinned && shownTopicIds.has(topicId))) {
			continue
		}

		// keep the row and mark its topic as shown
		shownTopicIds.add(topicId)
		rowIds.push(id)
		pinnedCount += isPinned ? 1 : 0
	}
	return { rowIds, pinnedCount }
}
