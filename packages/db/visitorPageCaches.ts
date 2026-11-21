// the Redis copies of the page reads that every visitor shares: their keys, how long each lives, the read-through load
// that fills one, and the deletes that clear them
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "./index"
import { cacheJson, deleteRedisKeys } from "./redis"
import { podcastEpisodes } from "./schema/podcast"
import { teamTopics } from "./schema/teamTopics"
import { topicPosts } from "./schema/topicPosts"
import { topics } from "./schema/topics"

// the pages whose visitor read has a copy
type VisitorPageKind = "profile" | "team" | "home" | "dashboard" | "topic" | "podcastEpisode" | "topicPost"

// how long each page's copy lives: a minute for the profile, the team page, the home, and a Dashboard page, and half a
// minute for the topic page, the podcast episode page, and the Topic Post page
const VISITOR_PAGE_TTL_MS: Record<VisitorPageKind, number> = {
	profile: 60_000,
	team: 60_000,
	home: 60_000,
	dashboard: 60_000,
	topic: 30_000,
	podcastEpisode: 30_000,
	topicPost: 30_000,
}

// the prefix of every visitor page copy's key
const VISITOR_PAGE_KEY_PREFIX = "visitor-page"

// a page read's copy key, its page's kind for the lifetime, the load that builds the visitor's read, and whether a
// built read is the page every visitor shares
type ReadVisitorPageOptions<PageRead> = {
	key: string
	pageKind: VisitorPageKind
	load: () => Promise<PageRead>
	isShared: (pageRead: PageRead) => boolean
}

/**
 * Returns a visitor's page read from its copy, or builds it on a miss and stores it for its page's lifetime if it is
 * shared. A missing or gated page is returned and never stored. While Redis is unreachable each read builds its own.
 */
export function readVisitorPage<PageRead>({
	key,
	pageKind,
	load,
	isShared,
}: ReadVisitorPageOptions<PageRead>): Promise<PageRead> {
	return cacheJson({ key, ttlMs: VISITOR_PAGE_TTL_MS[pageKind], load, isStorable: isShared })
}

/**
 * Returns the key of a person's profile copy.
 */
export function toVisitorProfilePageKey(profileUserId: string): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:profile:${profileUserId}`
}

/**
 * Returns the key of a team page's copy.
 */
export function toVisitorTeamPageKey(teamId: string): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:team:${teamId}`
}

/**
 * Returns the key of the home's copy.
 */
export function toVisitorHomePageKey(): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:home`
}

/**
 * Returns the key of a Dashboard page's copy.
 */
export function toVisitorDashboardPageKey({ dashboardKind, subjectId }: DashboardSubject): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:dashboard:${dashboardKind}:${subjectId}`
}

/**
 * Returns the key of a topic page's copy.
 */
export function toVisitorTopicPageKey(topicId: string): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:topic:${topicId}`
}

// a published podcast episode by its topic, its season, and its number in the season
export type PodcastEpisodePageAddress = { topicId: string; season: number; episodeNumber: number }

/**
 * Returns the key of a podcast episode page's copy.
 */
export function toVisitorPodcastEpisodePageKey({ topicId, season, episodeNumber }: PodcastEpisodePageAddress): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:podcast-episode:${topicId}:${season}:${episodeNumber}`
}

/**
 * Returns the key of a Topic Post page's copy.
 */
export function toVisitorTopicPostPageKey(topicPostId: string): string {
	return `${VISITOR_PAGE_KEY_PREFIX}:topic-post:${topicPostId}`
}

// the keys of the copies of every page that shows a topic, and the people and teams whose pages show it
export type VisitorPagesOfTopic = { pageKeys: string[]; profileUserIds: string[]; teamIds: string[] }

/**
 * Deletes the copies of every page that shows the topics: each topic's page, its podcast episode pages, its Topic Post
 * pages, its owner's profile, its Topic Posts' authors' profiles, and the page of each team that holds it, in one
 * delete.
 */
export async function clearVisitorPagesOfTopic(...topicIds: string[]): Promise<void> {
	const visitorPagesOfTopics = await loadVisitorPagesOfTopics(topicIds)
	await deleteRedisKeys(...new Set(visitorPagesOfTopics.flatMap((visitorPagesOfTopic) => visitorPagesOfTopic.pageKeys)))
}

/**
 * Deletes the copies of the profiles of the people.
 */
export async function clearVisitorProfilePages(...profileUserIds: string[]): Promise<void> {
	await deleteRedisKeys(...profileUserIds.map(toVisitorProfilePageKey))
}

/**
 * Deletes the copies of the teams' pages.
 */
export async function clearVisitorTeamPages(...teamIds: string[]): Promise<void> {
	await deleteRedisKeys(...teamIds.map(toVisitorTeamPageKey))
}

/**
 * Deletes the copies of the Topic Posts' pages.
 */
export async function clearVisitorTopicPostPages(...topicPostIds: string[]): Promise<void> {
	await deleteRedisKeys(...topicPostIds.map(toVisitorTopicPostPageKey))
}

/**
 * Deletes the copies of the Dashboards' pages.
 */
export async function clearVisitorDashboardPages(...dashboardSubjects: DashboardSubject[]): Promise<void> {
	await deleteRedisKeys(...dashboardSubjects.map(toVisitorDashboardPageKey))
}

/**
 * Returns the keys of the copies of every page that shows a topic, and the people and teams whose pages show it, read
 * in one statement. A delete reads them before its rows go, because a topic that is gone keeps only its own page's key.
 */
export async function loadVisitorPagesOfTopic(topicId: string): Promise<VisitorPagesOfTopic> {
	const [topicPageRow] = await loadTopicPageRows([topicId])
	return toVisitorPagesOfTopic(topicId, topicPageRow)
}

/**
 * Returns each topic's page copy keys with the people and teams whose pages show it, for every topic in one statement.
 */
async function loadVisitorPagesOfTopics(topicIds: string[]): Promise<VisitorPagesOfTopic[]> {
	// one row a topic, in one statement, and the keys of each topic's page copies
	const uniqueTopicIds = [...new Set(topicIds)]
	if (uniqueTopicIds.length === 0) {
		return []
	}
	const topicPageRows = await loadTopicPageRows(uniqueTopicIds)
	const topicPageRowById = new Map(topicPageRows.map((topicPageRow) => [topicPageRow.topicId, topicPageRow]))
	return uniqueTopicIds.map((topicId) => toVisitorPagesOfTopic(topicId, topicPageRowById.get(topicId)))
}

/**
 * Returns each topic's owner, holding teams, published podcast episodes' numbers, and published Topic Posts with their
 * authors.
 */
function loadTopicPageRows(topicIds: string[]): Promise<TopicPageRow[]> {
	return db
		.select({
			topicId: topics.id,
			ownerId: topics.ownerId,
			teamId: topics.teamId,
			sharedTeamIds: sql<
				string[] | null
			>`(select array_agg(${teamTopics.teamId}) from ${teamTopics} where ${teamTopics.topicId} = ${topics.id})`,
			podcastEpisodeNumbers: sql<
				{ season: number; episodeNumber: number }[] | null
			>`(select json_agg(json_build_object('season', ${podcastEpisodes.season}, 'episodeNumber', ${podcastEpisodes.episodeNumber})) from ${podcastEpisodes} where ${and(eq(podcastEpisodes.topicId, topics.id), isNotNull(podcastEpisodes.season), isNotNull(podcastEpisodes.episodeNumber))})`,
			topicPosts: sql<
				{ id: string; authorUserId: string }[] | null
			>`(select json_agg(json_build_object('id', ${topicPosts.id}, 'authorUserId', ${topicPosts.authorUserId})) from ${topicPosts} where ${and(eq(topicPosts.topicId, topics.id), isNotNull(topicPosts.publishedAt))})`,
		})
		.from(topics)
		.where(inArray(topics.id, topicIds))
}

// one topic's row as the page copy keys read it. a topic with none of a kind reads null for it
type TopicPageRow = {
	topicId: string
	ownerId: string
	teamId: string | null
	sharedTeamIds: string[] | null
	podcastEpisodeNumbers: { season: number; episodeNumber: number }[] | null
	topicPosts: { id: string; authorUserId: string }[] | null
}

/**
 * Returns the keys of one topic's page copies from its row, or its own page's key alone for a topic that is gone.
 */
function toVisitorPagesOfTopic(topicId: string, topicPageRow: TopicPageRow | undefined): VisitorPagesOfTopic {
	if (!topicPageRow) {
		return { pageKeys: [toVisitorTopicPageKey(topicId)], profileUserIds: [], teamIds: [] }
	}

	// the topic's own page and its podcast episode pages, by season and number. a topic with none of a kind reads null for it
	const podcastEpisodeNumbers = topicPageRow.podcastEpisodeNumbers ?? []
	const topicPostRows = topicPageRow.topicPosts ?? []
	const podcastEpisodePageKeys = podcastEpisodeNumbers.map(({ season, episodeNumber }) =>
		toVisitorPodcastEpisodePageKey({ topicId, season, episodeNumber }),
	)

	// the Topic Posts' pages, then the profiles and team pages that list the topic or its Topic Posts
	const topicPostPageKeys = topicPostRows.map((topicPost) => toVisitorTopicPostPageKey(topicPost.id))
	const profileUserIds = [
		...new Set([topicPageRow.ownerId, ...topicPostRows.map((topicPost) => topicPost.authorUserId)]),
	]
	const teamIds = [topicPageRow.teamId, ...(topicPageRow.sharedTeamIds ?? [])].filter((teamId) => teamId !== null)
	const pageKeys = [
		toVisitorTopicPageKey(topicId),
		...podcastEpisodePageKeys,
		...topicPostPageKeys,
		...profileUserIds.map(toVisitorProfilePageKey),
		...teamIds.map(toVisitorTeamPageKey),
	]
	return { pageKeys, profileUserIds, teamIds }
}
