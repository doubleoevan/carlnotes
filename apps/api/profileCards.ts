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
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, desc, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { isReadyFilmOfPodcastEpisode } from "./home/homeCardIds"
import { loadPodcastEpisodeCards, toPodcastEpisodeCardList, toTopicCards } from "./home/topicCards"
import { loadProfileOrderTopicPostRows, toTopicPostCards } from "./topicPost/topicPosts"

// how many of a person's published podcast episodes the read takes before keeping the pinned ones and one per topic
// ponytail: limits a long-running podcast. rank one per topic in sql past it
const PODCAST_EPISODE_CANDIDATE_LIMIT = 500

// whose profile it is, and whether its reader sees the person's topics that are not public
type LoadProfileTopicRowsOptions = { profileUserId: string; includesNonPublicTopics: boolean }

// the topics that the profile's cards show, in the profile's order, whose profile it is, and who reads them
type LoadProfileCardsOptions = {
	topicRows: (typeof topics.$inferSelect)[]
	profileUserId: string
	userId: string | null
}

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
export async function loadProfileCards({
	topicRows,
	profileUserId,
	userId,
}: LoadProfileCardsOptions): Promise<ProfileCards> {
	// the ids of the topics' podcast episodes and of their films that the sections show, read together. only the
	// person's own pins lead
	const topicIds = topicRows.map((topicRow) => topicRow.id)
	const [profilePodcastEpisodeIds, profileFilmIds] = await Promise.all([
		loadProfilePodcastEpisodeIds(topicIds, profileUserId),
		loadProfileTopicPodcastEpisodeVideoIds(topicIds, profileUserId),
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
		pinnedTopicCount: topicRows.filter((topicRow) => toOwnPinPosition(topicRow, profileUserId) !== null).length,
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

// the profile order of topics by a pin position: the pinned ones by their position, the newest first among those at
// one position, then the home's trending order, most viewed, then most followed, then newest
function toProfileTopicOrder(pinPosition: SQL | AnyPgColumn): SQL[] {
	return [
		sql`${pinPosition} is null`,
		sql`${pinPosition} asc`,
		sql`case when ${pinPosition} is null then ${topics.viewerCount} end desc`,
		sql`case when ${pinPosition} is null then ${topics.subscriberCount} end desc`,
		desc(topics.createdAt),
	]
}

// the profile order of a team's topics, where each owner's pins count
const PROFILE_TOPIC_ORDER = toProfileTopicOrder(topics.profileOrder)

// a topic's pin position on a profile, which counts only on a topic that the person owns
function toOwnPinPosition(topicRow: typeof topics.$inferSelect, profileUserId: string): number | null {
	return topicRow.ownerId === profileUserId ? topicRow.profileOrder : null
}

/**
 * Loads the topics of a person's card sections in their profile's order: the topics they own, and the topics held by
 * the teams they lead. A reader who sees only public topics gets the public ones alone, and a team's only if the team
 * is public. The person's own pins lead in their order, then the home's trending order, most viewed, then most
 * followed, then newest.
 */
export function loadProfileTopicRows({
	profileUserId,
	includesNonPublicTopics,
}: LoadProfileTopicRowsOptions): Promise<(typeof topics.$inferSelect)[]> {
	const ledTeamIds = toProfileTeamIdsQuery({
		profileUserId,
		isLeaderOnly: true,
		isPublicOnly: !includesNonPublicTopics,
	})
	return loadTopicRowsInProfileOrder({
		profileUserId,
		topicFilter: and(
			or(eq(topics.ownerId, profileUserId), toHeldTopicFilter(ledTeamIds)),
			includesNonPublicTopics ? undefined : eq(topics.visibility, "public"),
		),
	})
}

/**
 * Loads the topics of the All Topics table on the person's own profile: every topic they own, and every topic held
 * by a team they are an active member of, at every visibility, each once.
 */
export function loadProfileTableTopicRows(profileUserId: string): Promise<(typeof topics.$inferSelect)[]> {
	const memberTeamIds = toProfileTeamIdsQuery({ profileUserId, isLeaderOnly: false, isPublicOnly: false })
	return loadTopicRowsInProfileOrder({
		profileUserId,
		topicFilter: or(eq(topics.ownerId, profileUserId), toHeldTopicFilter(memberTeamIds)),
	})
}

// the topics that match a filter, each once, with the person's own pins leading and the rest in the trending order
function loadTopicRowsInProfileOrder({
	profileUserId,
	topicFilter,
}: {
	profileUserId: string
	topicFilter: SQL | undefined
}): Promise<(typeof topics.$inferSelect)[]> {
	// only the person's own topics keep their pin position
	const ownPinPosition = sql`case when ${topics.ownerId} = ${profileUserId} then ${topics.profileOrder} end`
	return db
		.select()
		.from(topics)
		.where(topicFilter)
		.orderBy(...toProfileTopicOrder(ownPinPosition))
}

// the ids of the teams the person is an active member of, the led ones alone or the public ones alone if asked
// biome-ignore lint/nursery/useExplicitReturnType: drizzle infers the select builder's type, which has no name to write here
function toProfileTeamIdsQuery({
	profileUserId,
	isLeaderOnly,
	isPublicOnly,
}: {
	profileUserId: string
	isLeaderOnly: boolean
	isPublicOnly: boolean
}) {
	// the person's active memberships, narrowed to the led or public teams if asked
	return db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, profileUserId),
				eq(teamMembers.isActive, true),
				isLeaderOnly ? eq(teamMembers.role, "leader") : undefined,
				isPublicOnly ? eq(teams.isPublic, true) : undefined,
			),
		)
}

// the topics that the teams hold: the ones they own, and the ones shared into them
function toHeldTopicFilter(teamIds: ReturnType<typeof toProfileTeamIdsQuery>): SQL | undefined {
	// a topic a team owns, or one shared into it
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, teamIds))
	return or(inArray(topics.teamId, teamIds), inArray(topics.id, sharedTopicIds))
}

/**
 * Loads the ids of the published podcast episodes of the topics that a profile or a team shows: the pinned ones in
 * their order, the newest first among those at one position, then the most listened one of each topic with none shown
 * yet, newest first among ties. A profile passes its person, whose pins alone count.
 */
export async function loadProfilePodcastEpisodeIds(
	topicIds: string[],
	pinOwnerUserId?: string,
): Promise<{ podcastEpisodeIds: string[]; pinnedPodcastEpisodeCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedPodcastEpisodeCount: 0 }
	}

	// the topics' published podcast episodes, the pinned ones first, then the most listened
	const pinPosition = toPinPosition(podcastEpisodes.profileOrder, pinOwnerUserId)
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId, profileOrder: pinPosition })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(pinPosition))
		.limit(PODCAST_EPISODE_CANDIDATE_LIMIT)

	// keep every pinned one, then the first read of each other topic
	const { rowIds, pinnedCount } = toProfileSectionRowIds(podcastEpisodeRows)
	return { podcastEpisodeIds: rowIds, pinnedPodcastEpisodeCount: pinnedCount }
}

/**
 * Loads the ids of the published podcast episodes whose ready films a profile shows, from the topics that its reader
 * may open: the pinned films in their order, then the most listened one of each topic with none shown yet, newest
 * first among ties. A profile passes its person, whose pins alone count.
 */
export async function loadProfileTopicPodcastEpisodeVideoIds(
	topicIds: string[],
	pinOwnerUserId?: string,
): Promise<{ podcastEpisodeIds: string[]; pinnedTopicPodcastEpisodeVideoCount: number }> {
	if (topicIds.length === 0) {
		return { podcastEpisodeIds: [], pinnedTopicPodcastEpisodeVideoCount: 0 }
	}

	// on a profile, a film's pin counts only on a topic that the person owns
	const pinPosition = toPinPosition(topicPodcastEpisodeVideos.profileOrder, pinOwnerUserId)

	// the topics' published podcast episodes that have a ready film, the pinned films first, then the most listened
	const filmRows = await db
		.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId, profileOrder: pinPosition })
		.from(podcastEpisodes)
		.innerJoin(topicPodcastEpisodeVideos, isReadyFilmOfPodcastEpisode)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(toPublishedPodcastEpisodeFilter(topicIds))
		.orderBy(...toProfilePodcastEpisodeOrder(pinPosition))
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

// a podcast episode's or a film's pin position, which on a profile counts only on a topic that the person owns
function toPinPosition(profileOrderColumn: AnyPgColumn, pinOwnerUserId: string | undefined): SQL<number | null> {
	return pinOwnerUserId
		? sql<number | null>`case when ${topics.ownerId} = ${pinOwnerUserId} then ${profileOrderColumn} end`
		: sql<number | null>`${profileOrderColumn}`
}

// the profile order of podcast episodes by their own pins or by their films' pins: the pinned ones by their position,
// then the most listened, newest first among ties
function toProfilePodcastEpisodeOrder(profileOrderColumn: SQL): SQL[] {
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
