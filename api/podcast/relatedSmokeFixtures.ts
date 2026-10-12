// the related smoke section's fixtures: eight topics around the dev database's centroid with their findings, podcast
// episodes, and vectors, an invite topic's subscriber, and a team member whose team holds the private topic
import { HOUR_MS } from "@shared/time"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodes } from "../../db/schema/podcast"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, findings, resources, scans } from "../../db/schema/scans"
import { teamMembers, teams, teamTopics } from "../../db/schema/teams"
import { subscriptions, topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { podcastEpisodeVectors, topicVectors } from "../../db/schema/vectors"
import { loadEmbeddingCentroid } from "../topic/relatedness"
import { ownerId, runId, subscriberId } from "./podcastEpisodeSmokeFixtures"

// the related fixtures' topics: the page's topic, a near one with an episode, a farther one with none, one past the
// score's limit that two shared tags bring within it, one far past it, and three whose vectors are nearest of all but
// which a visitor never sees: a public topic not yet shown, an invite topic, and a private one. the owner owns them all,
// the subscriber subscribes to the invite topic alone, the team member's team holds the private topic alone, and the
// paid owner reaches none of them
export const relatedTopicIds = {
	page: `${runId}-related-page`,
	near: `${runId}-related-near`,
	noEpisode: `${runId}-related-no-episode`,
	tagged: `${runId}-related-tagged`,
	far: `${runId}-related-far`,
	publicNotShown: `${runId}-related-public-not-shown`,
	invite: `${runId}-related-invite`,
	private: `${runId}-related-private`,
}

// the resources that the fixtures' findings name
const relatedResourceIds = [0, 1, 2].map((i) => `${runId}-related-resource-${i}`)

// the team member, and the team that holds the private topic through a share
export const teamMemberId = `${runId}-related-team-member`
const teamId = `${runId}-related-team`

// the page's tags, and the tagged topic's, which match them once lowercased with their punctuation left out
const PAGE_TOPIC_TAGS = ["AI & Engineering", "Coffee"]
const TAGGED_TOPIC_TAGS = ["ai-engineering", "coffee"]

// a vector of the embedding's width: the centroid plus the given weight on each axis, so the related score compares
// the weights alone
function toFixtureVector(embeddingCentroid: number[], weightByAxis: Record<number, number>): number[] {
	return Array.from({ length: EMBED_DIMENSIONS }, (_, i) => (embeddingCentroid[i] ?? 0) + (weightByAxis[i] ?? 0))
}

// each topic's vector. the near and the farther topics lean a little off the page's, the tagged one is 0.9 from it
// before its tags take 0.2 off, the far one points away from it, and the three hidden topics share the page's own
function toTopicVectorByTopicId(embeddingCentroid: number[]): Record<string, number[]> {
	const pageTopicVector = toFixtureVector(embeddingCentroid, { 0: 1 })
	return {
		[relatedTopicIds.page]: pageTopicVector,
		[relatedTopicIds.near]: toFixtureVector(embeddingCentroid, { 0: 1, 1: 0.3 }),
		[relatedTopicIds.noEpisode]: toFixtureVector(embeddingCentroid, { 0: 1, 2: 0.5 }),
		[relatedTopicIds.tagged]: toFixtureVector(embeddingCentroid, { 0: 0.1, 3: Math.sqrt(1 - 0.1 * 0.1) }),
		[relatedTopicIds.far]: toFixtureVector(embeddingCentroid, { 0: -1 }),
		[relatedTopicIds.publicNotShown]: pageTopicVector,
		[relatedTopicIds.invite]: pageTopicVector,
		[relatedTopicIds.private]: pageTopicVector,
	}
}

// a podcast episode to seed: its topic, its number, and its status
type RelatedPodcastEpisodeSeed = {
	topicId: string
	episodeNumber: number
	status: (typeof podcastEpisodes.$inferInsert)["status"]
}

// the page's topic has two published episodes, a recording one, a failed one, and a removed one. the near topic has one
// of each kind, the invite topic has two published an hour apart, and the tagged, the far, and each other hidden topic
// have one published episode
const relatedPodcastEpisodeSeeds: RelatedPodcastEpisodeSeed[] = [
	{ topicId: relatedTopicIds.page, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.page, episodeNumber: 2, status: "published" },
	{ topicId: relatedTopicIds.page, episodeNumber: 3, status: "recording" },
	{ topicId: relatedTopicIds.page, episodeNumber: 4, status: "removed" },
	{ topicId: relatedTopicIds.page, episodeNumber: 5, status: "failed" },
	{ topicId: relatedTopicIds.near, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.near, episodeNumber: 2, status: "recording" },
	{ topicId: relatedTopicIds.near, episodeNumber: 3, status: "removed" },
	{ topicId: relatedTopicIds.near, episodeNumber: 4, status: "failed" },
	{ topicId: relatedTopicIds.tagged, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.far, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.publicNotShown, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.invite, episodeNumber: 1, status: "published" },
	{ topicId: relatedTopicIds.invite, episodeNumber: 2, status: "published" },
	{ topicId: relatedTopicIds.private, episodeNumber: 1, status: "published" },
]

// a seeded podcast episode's id
function toRelatedPodcastEpisodeId({ topicId, episodeNumber }: RelatedPodcastEpisodeSeed): string {
	return `${topicId}-episode-${episodeNumber}`
}

/**
 * Seeds the eight related topics with their scans, findings, podcast episodes, and vectors around the dev database's
 * centroid, the invite topic's subscriber, and the team member's team that holds the private topic.
 */
export async function seedRelatedFixtures(): Promise<void> {
	// the vectors, placed around the centroid that the related reads take out
	const embeddingCentroid = await loadEmbeddingCentroid()
	if (!embeddingCentroid) {
		throw new Error("related fixtures: the database has no embedded resources to average")
	}
	const topicVectorByTopicId = toTopicVectorByTopicId(embeddingCentroid)

	// the topics, all public but the invite and the private one, with the page's and the tagged topic's tags
	const hiddenVisibilityByTopicId: Record<string, "invite" | "private"> = {
		[relatedTopicIds.invite]: "invite",
		[relatedTopicIds.private]: "private",
	}
	const tagsByTopicId: Record<string, string[]> = {
		[relatedTopicIds.page]: PAGE_TOPIC_TAGS,
		[relatedTopicIds.tagged]: TAGGED_TOPIC_TAGS,
	}
	const topicIds = Object.values(relatedTopicIds)
	await db.insert(topics).values(
		topicIds.map((topicId) => ({
			id: topicId,
			ownerId,
			name: `${runId} ${topicId.split("-related-")[1]}`,
			visibility: hiddenVisibilityByTopicId[topicId] ?? ("public" as const),
			tags: tagsByTopicId[topicId] ?? [],
		})),
	)

	// one scan per topic, and three resources
	await db.insert(scans).values(topicIds.map((topicId) => ({ id: `${topicId}-scan`, topicId, ownerId })))
	await db
		.insert(resources)
		.values(relatedResourceIds.map((id) => ({ id, url: `https://related-smoke.example/${id}`, kind: "read" as const })))

	// the findings: one for the public topic not yet shown, and three for each of the others
	await db
		.insert(findings)
		.values(
			topicIds.flatMap((topicId) =>
				relatedResourceIds
					.slice(0, topicId === relatedTopicIds.publicNotShown ? 1 : 3)
					.map((resourceId) => ({ topicId, resourceId, scanId: `${topicId}-scan`, relevanceScore: 0.8 })),
			),
		)

	// the podcast episodes, each an hour older than its next number
	await db.insert(podcastEpisodes).values(
		relatedPodcastEpisodeSeeds.map((podcastEpisodeSeed) => ({
			id: toRelatedPodcastEpisodeId(podcastEpisodeSeed),
			topicId: podcastEpisodeSeed.topicId,
			ownerId,
			status: podcastEpisodeSeed.status,
			title: `Episode ${podcastEpisodeSeed.episodeNumber} of ${podcastEpisodeSeed.topicId}`,
			description: "A related episode.",
			season: 2026,
			episodeNumber: podcastEpisodeSeed.episodeNumber,
			publishedAt: new Date(Date.now() - (10 - podcastEpisodeSeed.episodeNumber) * HOUR_MS),
		})),
	)

	// a vector for every topic and every podcast episode, the recording, failed, and removed ones too, so the filters
	// are tested. the topic vectors are saved as public and shown for every topic but the private one, so the public
	// read's check of each topic keeps out the invite one and the public one not yet shown, whose flags are out of date
	await db.insert(topicVectors).values(
		topicIds.map((topicId) => ({
			topicId,
			embedding: topicVectorByTopicId[topicId] ?? [],
			embeddingModel: EMBED_MODEL_NAME,
			isPublicAndShown: topicId !== relatedTopicIds.private,
		})),
	)
	await db.insert(podcastEpisodeVectors).values(
		relatedPodcastEpisodeSeeds.map((podcastEpisodeSeed) => ({
			podcastEpisodeId: toRelatedPodcastEpisodeId(podcastEpisodeSeed),
			topicId: podcastEpisodeSeed.topicId,
			embedding: topicVectorByTopicId[podcastEpisodeSeed.topicId] ?? [],
			embeddingModel: EMBED_MODEL_NAME,
			// the same flags as the topic vectors
			isTopicPublicAndShown: podcastEpisodeSeed.topicId !== relatedTopicIds.private,
		})),
	)

	// the subscriber subscribes to the invite topic between its two episodes, so only the later one is theirs
	await db.insert(subscriptions).values({
		topicId: relatedTopicIds.invite,
		subscriberUserId: subscriberId,
		createdAt: new Date(Date.now() - 8.5 * HOUR_MS),
	})

	// the team member's team holds the private topic through a share
	await db.insert(users).values({
		id: teamMemberId,
		name: teamMemberId,
		email: `${teamMemberId}@example.com`,
		username: teamMemberId,
		usernameNormalized: teamMemberId,
	})
	await db.insert(teams).values({ id: teamId, name: `${runId} related team` })
	await db.insert(teamMembers).values({ teamId, userId: teamMemberId })
	await db.insert(teamTopics).values({ teamId, topicId: relatedTopicIds.private })
}

/**
 * Deletes what the owner's delete in the smoke's cleanup does not reach: the resources, the team, and the team member.
 */
export async function deleteRelatedFixtures(): Promise<void> {
	// the resources belong to no user and their delete cascades to their findings, the team's delete cascades to its
	// member and its share, and the team member owns nothing
	await db.delete(resources).where(inArray(resources.id, relatedResourceIds))
	await db.delete(teams).where(eq(teams.id, teamId))
	await db.delete(users).where(eq(users.id, teamMemberId))
}
