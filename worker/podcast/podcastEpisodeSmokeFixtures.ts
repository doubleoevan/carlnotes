// the podcast episode smoke's seeded rows: a free user's topic, scans, findings, resources, and earlier episodes,
// and the read of an episode's vector rows
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema/podcast"
import { EMBED_DIMENSIONS, EMBED_MODEL_NAME, findings, resources, scans } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { podcastEpisodeVectors } from "../../db/schema/vectors"

// two Findings worth a short Podcast Episode, each with its Resource's title and snippet and its relevance explanation
const SEEDED_FINDINGS = [
	{
		title: "A quieter burr set for home grinders",
		snippet: "A grinder maker released a burr set that runs at 62 decibels, about a third quieter than its last one.",
		relevanceExplanation:
			"The reader grinds before the house is awake, so a quieter grinder is the upgrade they asked about.",
	},
	{
		title: "Hard water and sour espresso",
		snippet: "A water lab measured extraction at three hardness levels and found that very hard water mutes acidity.",
		relevanceExplanation: "The reader's shots turned sour after a move, and the new city's water is much softer.",
	},
]

// a unit vector of the embedding's width along the given axis
function toSmokeEmbedding(axis: number): number[] {
	return Array.from({ length: EMBED_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0))
}

// the ids of the seeded rows that the checks read and the cleanup deletes
export type SeededRowIds = {
	userId: string
	topicId: string
	scanId: string
	resourceIds: string[]
	// a second succeeded Scan, and the Topic's earlier published short and full Podcast Episodes
	secondScanId: string
	earlierShortPodcastEpisodeId: string
	earlierFullPodcastEpisodeId: string
}

/**
 * Seeds a free user with a Topic, two succeeded Scans, two Findings on Resources that only this run uses, and the
 * Topic's earlier short and full Podcast Episodes, and returns the seeded rows' ids.
 */
export async function seedTestData(): Promise<SeededRowIds> {
	const runId = crypto.randomUUID().slice(0, 8)
	const [user] = await db
		.insert(users)
		.values({
			name: "episode-smoke",
			email: `delivered+episode-smoke-${runId}@resend.dev`,
			username: `episode-smoke-${runId}`,
			usernameNormalized: `episodesmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// the Topic and the Scan that the Podcast Episode is planned for
	const topicValues = { ownerId: user.id, name: "Home espresso", prompt: "Gear and technique for espresso at home." }
	const [topic] = await db.insert(topics).values(topicValues).returning()
	const scanValues = { topicId: topic?.id, ownerId: user.id, status: "succeeded" as const, finishedAt: new Date() }
	const [scan, secondScan] = await db.insert(scans).values([scanValues, scanValues]).returning()
	if (!topic || !scan || !secondScan) {
		throw new Error("failed to seed the topic or its scans")
	}

	// one Resource and one Finding for each seeded Finding, the first scored higher
	const resourceRows = await db
		.insert(resources)
		.values(
			SEEDED_FINDINGS.map(({ title, snippet }, i) => ({
				url: `https://episode-smoke.example/${runId}/${i}`,
				kind: "read" as const,
				title,
				snippet,
				embedding: toSmokeEmbedding(i),
				embeddingModel: EMBED_MODEL_NAME,
			})),
		)
		.returning({ id: resources.id })
	await db.insert(findings).values(
		resourceRows.map((resourceRow, i) => ({
			topicId: topic.id,
			resourceId: resourceRow.id,
			scanId: scan.id,
			relevanceScore: 0.9 - i * 0.1,
			relevanceExplanation: SEEDED_FINDINGS[i]?.relevanceExplanation ?? "",
		})),
	)

	// the Topic's earlier published short and full Podcast Episodes, numbers 1 and 2 this season
	const earlierPodcastEpisodeValues = { topicId: topic.id, ownerId: user.id, status: "published" as const }
	const season = new Date().getUTCFullYear()
	const [earlierShortPodcastEpisode, earlierFullPodcastEpisode] = await db
		.insert(podcastEpisodes)
		.values([
			{ ...earlierPodcastEpisodeValues, isShort: true, season, episodeNumber: 1, title: "Earlier short episode" },
			{ ...earlierPodcastEpisodeValues, isShort: false, season, episodeNumber: 2, title: "Earlier full episode" },
		])
		.returning({ id: podcastEpisodes.id })
	if (!earlierShortPodcastEpisode || !earlierFullPodcastEpisode) {
		throw new Error("failed to seed the earlier episodes")
	}

	// a Resource that only the earlier short Podcast Episode narrated, and no seeded Finding has
	const earlierNarratedUrl = `https://episode-smoke.example/${runId}/earlier`
	const [earlierNarratedResourceRow] = await db
		.insert(resources)
		.values({ url: earlierNarratedUrl, kind: "read", title: "An earlier finding" })
		.returning({ id: resources.id })
	if (!earlierNarratedResourceRow) {
		throw new Error("failed to seed the earlier episode's resource")
	}

	// the earlier short Podcast Episode's chapter, which narrated that Resource
	await db.insert(podcastEpisodeChapters).values({
		podcastEpisodeId: earlierShortPodcastEpisode.id,
		position: 0,
		resourceId: earlierNarratedResourceRow.id,
		title: "An earlier finding",
		sourceUrl: earlierNarratedUrl,
		startSeconds: 0,
		endSeconds: 60,
	})

	// the earlier short Podcast Episode's vector
	await db.insert(podcastEpisodeVectors).values({
		podcastEpisodeId: earlierShortPodcastEpisode.id,
		topicId: topic.id,
		embedding: toSmokeEmbedding(0),
		embeddingModel: EMBED_MODEL_NAME,
	})
	return {
		userId: user.id,
		topicId: topic.id,
		scanId: scan.id,
		secondScanId: secondScan.id,
		resourceIds: [...resourceRows.map((resourceRow) => resourceRow.id), earlierNarratedResourceRow.id],
		earlierShortPodcastEpisodeId: earlierShortPodcastEpisode.id,
		earlierFullPodcastEpisodeId: earlierFullPodcastEpisode.id,
	}
}

/**
 * Loads a Podcast Episode's vector rows, one or none, each with whether its topic is public and shown.
 */
export async function loadPodcastEpisodeVectorRows(
	podcastEpisodeId: string,
): Promise<{ isTopicPublicAndShown: boolean }[]> {
	return db
		.select({ isTopicPublicAndShown: podcastEpisodeVectors.isTopicPublicAndShown })
		.from(podcastEpisodeVectors)
		.where(eq(podcastEpisodeVectors.podcastEpisodeId, podcastEpisodeId))
}
