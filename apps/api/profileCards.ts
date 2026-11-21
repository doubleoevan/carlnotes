// the cards a profile's and a team's card sections draw: the topics, their published podcast episodes, and a profile's
// films, the featured ones first in their order and then the rest in the home's order, and every published Topic Post
// of the person or of the team's topics, the featured ones first in their order and then the rest newest first

import type { PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"
import type {
	ProfilePodcastEpisodeCard,
	ProfileTopicCard,
	ProfileTopicPostCard,
} from "@carlnotes/contracts/profilePage"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { isReadyFilmOfPodcastEpisode } from "./home/homeCardIds"
import { loadPodcastEpisodeCards, toPodcastEpisodeCardList, toTopicCards } from "./home/topicCards"
import { type ProfileReader, toOwnTopicFilter } from "./profileReader"
import { toMemberTeamIdsQuery, toTeamTopicFilter } from "./team/memberTeamTopics"
import { loadProfileOrderTopicPostRows, toTopicPostCards } from "./topicPost/topicPosts"

// how many of a person's published podcast episodes the read takes before keeping the featured ones and one per topic
// ponytail: limits a long-running podcast. rank one per topic in sql past it
const PODCAST_EPISODE_CANDIDATE_LIMIT = 500

// whose profile it is, and who reads it
type LoadProfileTopicRowsOptions = { profileUserId: string; profileReader: ProfileReader }

// the topics that the profile's cards show, in the profile's order, whose profile it is, and who reads them
type LoadProfileCardsOptions = {
	topicRows: (typeof topics.$inferSelect)[]
	profileUserId: string
	userId: string | null
}

// the cards of a profile's topic, film, and podcast episode sections, each with how many of its first cards are featured
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
export async function loadProfileCards({
	topicRows,
	profileUserId,
	userId,
}: LoadProfileCardsOptions): Promise<ProfileCards> {
	// the ids of the topics' podcast episodes and of their films that the sections show, read together. only the
	// person's own featured items lead
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [profilePodcastEpisodeIds, profileFilmIds] = await Promise.all([
		loadProfilePodcastEpisodeIds(topicIds, profileUserId),
		loadProfileTopicVideoIds(topicIds, profileUserId),
	])

	// the topics' cards, beside one read of the cards of both sections' podcast episodes, each podcast episode once
	const sectionPodcastEpisodeIds = [...profileFilmIds.podcastEpisodeIds, ...profilePodcastEpisodeIds.podcastEpisodeIds]
	const [topicCards, podcastEpisodeCards] = await Promise.all([
		toTopicCards(topicRows, userId),
		loadPodcastEpisodeCards([...new Set(sectionPodcastEpisodeIds)]),
	])

	// each section's cards in its ids' order, each with whether its topic is public and whether the person owns it
	const publicTopicIds = new Set(
		topicRows.filter((topicRow) => topicRow.visibility === "public").map((topicRow) => topicRow.id),
	)
	const ownedTopicIds = new Set(
		topicRows.filter((topicRow) => topicRow.ownerId === profileUserId).map((topicRow) => topicRow.id),
	)
	const toProfilePodcastEpisodeCards = (podcastEpisodeIds: string[]): ProfilePodcastEpisodeCard[] =>
		toPodcastEpisodeCardList(podcastEpisodeCards, podcastEpisodeIds).map((podcastEpisodeCard) => ({
			...podcastEpisodeCard,
			isTopicPublic: publicTopicIds.has(podcastEpisodeCard.topic.id),
			isTopicOwned: ownedTopicIds.has(podcastEpisodeCard.topic.id),
		}))

	return {
		profileTopics: topicCards.map((topicCard) => ({
			...topicCard,
			isPublic: publicTopicIds.has(topicCard.id),
			isOwned: ownedTopicIds.has(topicCard.id),
		})),
		pinnedTopicCount: topicRows.filter((topicRow) => toOwnFeaturePosition(topicRow, profileUserId) !== null).length,
		// the film cards, right before the podcast episode cards
		profileTopicPodcastEpisodeVideos: toProfilePodcastEpisodeCards(profileFilmIds.podcastEpisodeIds),
		pinnedTopicPodcastEpisodeVideoCount: profileFilmIds.pinnedTopicPodcastEpisodeVideoCount,
		profilePodcastEpisodes: toProfilePodcastEpisodeCards(profilePodcastEpisodeIds.podcastEpisodeIds),
		pinnedPodcastEpisodeCount: profilePodcastEpisodeIds.pinnedPodcastEpisodeCount,
	}
}

// the cards of a team's topic, podcast episode, film, and Topic Post sections
type TeamCards = {
	topicCards: TopicCard[]
	podcastEpisodeCards: PodcastEpisodeCard[]
	topicVideoCards: PodcastEpisodeCard[]
	topicPostCards: TopicPostCard[]
}

/**
 * Loads the cards of a team's topic, podcast episode, film, and Topic Post sections from its topic rows that the reader
 * may open. The topics that their owners featured lead in their profile order, the newer first where two owners
 * featured at one position, and the rest follow in the home's trending order. The podcast episodes and the films of
 * those topics follow the same rule, both read as cards at once. Every published Topic Post of those topics is listed,
 * the ones that their authors featured first in their profile order, then the rest newest first.
 */
export async function loadTeamCards(
	topicRows: (typeof topics.$inferSelect)[],
	userId: string | null,
): Promise<TeamCards> {
	if (topicRows.length === 0) {
		return { topicCards: [], podcastEpisodeCards: [], topicVideoCards: [], topicPostCards: [] }
	}

	// the topics' cards in their profile order, the ids of their podcast episodes and films, and their Topic Posts' cards
	const profileOrderTopicRows = topicRows.toSorted(compareTeamTopicProfileOrder)
	const topicIds = profileOrderTopicRows.map((topicRow) => topicRow.id)
	const [topicCards, profilePodcastEpisodeIds, profileFilmIds, topicPostCards] = await Promise.all([
		toTopicCards(profileOrderTopicRows, userId),
		loadProfilePodcastEpisodeIds(topicIds),
		loadProfileTopicVideoIds(topicIds),
		loadProfileOrderTopicPostRows(inArray(topicPosts.topicId, topicIds)).then(toTopicPostCards),
	])

	// one read of both sections' podcast episodes as cards, each podcast episode once
	const { podcastEpisodeIds } = profilePodcastEpisodeIds
	const filmPodcastEpisodeIds = profileFilmIds.podcastEpisodeIds
	const podcastEpisodeCards = await loadPodcastEpisodeCards([
		...new Set([...podcastEpisodeIds, ...filmPodcastEpisodeIds]),
	])
	return {
		topicCards,
		podcastEpisodeCards: toPodcastEpisodeCardList(podcastEpisodeCards, podcastEpisodeIds),
		topicVideoCards: toPodcastEpisodeCardList(podcastEpisodeCards, filmPodcastEpisodeIds),
		topicPostCards,
	}
}

/**
 * Compares two of a team's topics in their profile order, as the profile order's sql sorts them: each owner's
 * featured topics first by position, then the rest most viewed, then most followed, and the newest first last.
 */
export function compareTeamTopicProfileOrder(
	topicRowA: Pick<typeof topics.$inferSelect, "profileOrder" | "viewerCount" | "subscriberCount" | "createdAt">,
	topicRowB: Pick<typeof topics.$inferSelect, "profileOrder" | "viewerCount" | "subscriberCount" | "createdAt">,
): number {
	// a featured topic leads, by its position
	const [positionA, positionB] = [topicRowA.profileOrder, topicRowB.profileOrder]
	if ((positionA === null) !== (positionB === null)) {
		return positionA === null ? 1 : -1
	}
	if (positionA !== null && positionB !== null && positionA !== positionB) {
		return positionA - positionB
	}

	// an unfeatured topic by its views, then its followers
	if (positionA === null) {
		const trendingDifference =
			Number(topicRowB.viewerCount) - Number(topicRowA.viewerCount) ||
			topicRowB.subscriberCount - topicRowA.subscriberCount
		if (trendingDifference !== 0) {
			return trendingDifference
		}
	}

	// the newer first among the rest
	return topicRowB.createdAt.getTime() - topicRowA.createdAt.getTime()
}

// the Topic Post cards of a profile, with how many of the first are featured
type ProfileTopicPostCards = { profileTopicPosts: ProfileTopicPostCard[]; pinnedTopicPostCount: number }

/**
 * Loads the cards of every published Topic Post of a person: the featured ones in their order, then the rest newest
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

	// each card with whether its topic is public, and how many of the rows are featured
	return {
		profileTopicPosts: topicPostCards.map((topicPostCard, index) => ({
			...topicPostCard,
			isTopicPublic: topicPostRows[index]?.topic.visibility === "public",
		})),
		pinnedTopicPostCount: topicPostRows.filter(({ topicPost }) => topicPost.profileOrder !== null).length,
	}
}

// the profile order of topics by a featured position: the featured ones by their position, the newest first among those at
// one position, then the home's trending order, most viewed, then most followed, then newest
function toProfileTopicOrder(featurePosition: SQL | AnyPgColumn): SQL[] {
	return [
		sql`${featurePosition} is null`,
		sql`${featurePosition} asc`,
		sql`case when ${featurePosition} is null then ${topics.viewerCount} end desc`,
		sql`case when ${featurePosition} is null then ${topics.subscriberCount} end desc`,
		desc(topics.createdAt),
	]
}

// a topic's featured position on a profile, which counts only on a topic that the person owns
function toOwnFeaturePosition(topicRow: typeof topics.$inferSelect, profileUserId: string): number | null {
	return topicRow.ownerId === profileUserId ? topicRow.profileOrder : null
}

/**
 * Loads the topics of a person's card sections in their profile's order: the topics they own, and the topics held by
 * the teams they lead. A reader who sees only public topics gets the public ones alone, and a team's only if the team
 * is public and shows the person's membership. A private topic another member owns stays out until its Personal
 * sources text is converted. The person's own featured items lead in their order, then the home's trending order, most viewed,
 * then most followed, then newest.
 */
export function loadProfileTopicRows({
	profileUserId,
	profileReader,
}: LoadProfileTopicRowsOptions): Promise<(typeof topics.$inferSelect)[]> {
	const isPublicOnly = profileReader === "visitor"
	const ledTeamIds = toMemberTeamIdsQuery({ profileUserId, isLeaderOnly: true, isPublicOnly })
	return loadTopicRowsInProfileOrder({
		profileUserId,
		topicFilter: or(
			toOwnTopicFilter(profileUserId, profileReader),
			toTeamTopicFilter({ teamIds: ledTeamIds, isPublicOnly }),
		),
	})
}

/**
 * Loads the topics of the All Topics table on the person's own profile: every topic they own, and every topic held
 * by a team they are an active member of, at every visibility, each once. A private topic another member owns stays
 * out until its Personal sources text is converted.
 */
export function loadProfileTableTopicRows(profileUserId: string): Promise<(typeof topics.$inferSelect)[]> {
	const memberTeamIds = toMemberTeamIdsQuery({ profileUserId, isLeaderOnly: false, isPublicOnly: false })
	return loadTopicRowsInProfileOrder({
		profileUserId,
		topicFilter: or(
			eq(topics.ownerId, profileUserId),
			toTeamTopicFilter({ teamIds: memberTeamIds, isPublicOnly: false }),
		),
	})
}

// the topics that match a filter, each once, with the person's own featured items leading and the rest in the trending order
function loadTopicRowsInProfileOrder({
	profileUserId,
	topicFilter,
}: {
	profileUserId: string
	topicFilter: SQL | undefined
}): Promise<(typeof topics.$inferSelect)[]> {
	// only the person's own topics keep their featured position
	const ownFeaturePosition = sql`case when ${topics.ownerId} = ${profileUserId} then ${topics.profileOrder} end`
	return db
		.select()
		.from(topics)
		.where(topicFilter)
		.orderBy(...toProfileTopicOrder(ownFeaturePosition))
}

/**
 * Loads the ids of the published podcast episodes of the topics that a profile or a team shows: the featured ones in
 * their order, the newest first among those at one position, then the most listened one of each topic with none shown
 * yet, newest first among ties. A profile passes its person, whose featured items alone count.
 */
export async function loadProfilePodcastEpisodeIds(
	topicIds: string[],
	featureOwnerUserId?: string,
): Promise<{ podcastEpisodeIds: string[]; pinnedPodcastEpisodeCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedPodcastEpisodeCount: 0 }
	}

	// the topics' published podcast episodes, the featured ones first, then the most listened
	const featurePosition = toFeaturePosition(podcastEpisodes.profileOrder, featureOwnerUserId)
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId, profileOrder: featurePosition })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(featurePosition))
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// keep every featured one, then the first read of each other topic
	const { rowIds, featuredCount } = toProfileSectionRowIds(podcastEpisodeRows)
	return { podcastEpisodeIds: rowIds, pinnedPodcastEpisodeCount: featuredCount }
}

/**
 * Loads the ids of the published podcast episodes whose ready films a profile shows, from the topics that its reader
 * may open: the featured films in their order, then the most listened one of each topic with none shown yet, newest
 * first among ties. A profile passes its person, whose featured items alone count.
 */
export async function loadProfileTopicVideoIds(
	topicIds: string[],
	featureOwnerUserId?: string,
): Promise<{ podcastEpisodeIds: string[]; pinnedTopicPodcastEpisodeVideoCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedTopicPodcastEpisodeVideoCount: 0 }
	}

	// on a profile, a film's featured position counts only on a topic that the person owns
	const featurePosition = toFeaturePosition(topicVideos.profileOrder, featureOwnerUserId)

	// the topics' published podcast episodes that have a ready film, the featured films first, then the most listened
	const filmRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId, profileOrder: featurePosition })
		.from(podcastEpisodes)
		.innerJoin(topicVideos, isReadyFilmOfPodcastEpisode)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(featurePosition))
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// keep every featured one, then the first read of each other topic
	const { rowIds, featuredCount } = toProfileSectionRowIds(filmRows)
	return { podcastEpisodeIds: rowIds, pinnedTopicPodcastEpisodeVideoCount: featuredCount }
}

// the filter for the published podcast episodes of some topics
function toPublishedPodcastEpisodeFilter(topicIds: string[]): SQL | undefined {
	return and(
		inArray(podcastEpisodes.topicId, topicIds),
		eq(podcastEpisodes.status, "published"),
		isNotNull(podcastEpisodes.publishedAt),
	)
}

// a podcast episode's or a film's featured position, which on a profile counts only on a topic that the person owns
function toFeaturePosition(
	profileOrderColumn: AnyPgColumn,
	featureOwnerUserId: string | undefined,
): SQL<number | null> {
	return featureOwnerUserId
		? sql<number | null>`case when ${topics.ownerId} = ${featureOwnerUserId} then ${profileOrderColumn} end`
		: sql<number | null>`${profileOrderColumn}`
}

// the profile order of podcast episodes by their own featured positions or by their films' featured positions: the
// featured ones by their position, then the most listened, newest first among ties
function toProfilePodcastEpisodeOrder(profileOrderColumn: SQL): SQL[] {
	return [
		sql`${profileOrderColumn} is null`,
		asc(profileOrderColumn),
		sql`case when ${profileOrderColumn} is null then ${podcastEpisodes.listenerCount} end desc`,
		desc(podcastEpisodes.publishedAt),
	]
}

// a published podcast episode or film of a topic, with its profile order if it is featured
type ProfileSectionRow = { id: string; topicId: string | null; profileOrder: number | null }

/**
 * Returns the podcast episodes or the films a card section shows from rows in the section's order: every featured one,
 * then the first one read of each topic that has none shown yet.
 */
export function toProfileSectionRowIds(profileSectionRows: ProfileSectionRow[]): {
	rowIds: string[]
	featuredCount: number
} {
	// the topics with a row shown, the ids kept, and how many of them are featured
	const shownTopicIds = new Set<string>()
	const rowIds: string[] = []
	let featuredCount = 0
	for (const { id, topicId, profileOrder } of profileSectionRows) {
		// a featured row always shows, and any other shows only as its topic's first
		const isFeatured = profileOrder !== null
		if (!topicId || (!isFeatured && shownTopicIds.has(topicId))) {
			continue
		}

		// keep the row and mark its topic as shown
		shownTopicIds.add(topicId)
		rowIds.push(id)
		featuredCount += isFeatured ? 1 : 0
	}
	return { rowIds, featuredCount }
}
