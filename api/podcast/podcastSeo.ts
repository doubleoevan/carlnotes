// a public topic's podcast in search: its published episodes as the sitemap and llms.txt list them,
// and the PodcastSeries and PodcastEpisode structured data
import type { PublicTopic } from "@shared/contracts"
import { isPodcastEpisodeRecordingConfigured, PODCAST_SHOW_NAME, toPodcastCoverPath } from "@shared/podcastEpisodes"
import { toPodcastEpisodePath, toPodcastFeedPath, toTopicPath } from "@shared/seo"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { podcastEpisodes } from "../../db/schema"
import type { TopicPreview } from "../share/topicImage"

// a published podcast episode of a public topic, as the sitemap and llms.txt list it
export type PublicPodcastEpisodeRow = Pick<
	typeof podcastEpisodes.$inferSelect,
	"topicId" | "season" | "episodeNumber" | "publishedAt" | "title" | "description"
>

// a public podcast episode's page, with its title, its description, and when it published
export type PublicPodcastEpisodePage = { url: string; title: string; description: string; publishedAt: Date | null }

// the app's url, the public topics, and their published podcast episodes, newest first
type ToPublicPodcastEpisodePagesOptions = {
	appUrl: string
	publicTopics: PublicTopic[]
	publicPodcastEpisodeRows: PublicPodcastEpisodeRow[]
}

// a Topic's podcast as structured data names it, with its name, description, page, show cover, and feed
export type PodcastSeries = { name: string; description: string; url: string; imageUrl: string; feedUrl: string }

// what a podcast episode page's structured data is built from
type PodcastEpisodeWork = {
	name: string
	description: string
	url: string
	publishedAt: Date
	durationSeconds: number
	// where the podcast episode sits in the series, and its audio
	season: number
	episodeNumber: number
	audioUrl: string
	series: PodcastSeries
}

/**
 * Loads the published podcast episodes of public topics, newest first, or none if episode recording is not configured.
 */
export async function loadPublicPodcastEpisodeRows(publicTopicIds: string[]): Promise<PublicPodcastEpisodeRow[]> {
	if (!isPodcastEpisodeRecordingConfigured() || publicTopicIds.length === 0) {
		return []
	}
	return db
		.select({
			topicId: podcastEpisodes.topicId,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			publishedAt: podcastEpisodes.publishedAt,
			title: podcastEpisodes.title,
			description: podcastEpisodes.description,
		})
		.from(podcastEpisodes)
		.where(and(inArray(podcastEpisodes.topicId, publicTopicIds), eq(podcastEpisodes.status, "published")))
		.orderBy(desc(podcastEpisodes.publishedAt))
}

/**
 * Returns each public podcast episode's page, at a path after its topic's path, if its topic is listed.
 */
export function toPublicPodcastEpisodePages({
	appUrl,
	publicTopics,
	publicPodcastEpisodeRows,
}: ToPublicPodcastEpisodePagesOptions): PublicPodcastEpisodePage[] {
	// each public topic by its id
	const publicTopicById = new Map(publicTopics.map((publicTopic) => [publicTopic.id, publicTopic]))
	return publicPodcastEpisodeRows.flatMap((podcastEpisodeRow) => {
		// a podcast episode whose topic is not listed has no page
		const publicTopic = podcastEpisodeRow.topicId ? publicTopicById.get(podcastEpisodeRow.topicId) : undefined
		if (!publicTopic) {
			return []
		}

		// the page at a path after its topic's path. a podcast episode untitled so far takes its topic's name
		return [
			{
				url: `${appUrl}${toPodcastEpisodePath(publicTopic, podcastEpisodeRow)}`,
				title: podcastEpisodeRow.title ?? publicTopic.name,
				description: podcastEpisodeRow.description ?? "",
				publishedAt: podcastEpisodeRow.publishedAt,
			},
		]
	})
}

/**
 * Returns the PodcastSeries fields of a public Topic's podcast.
 */
export function toPodcastSeries(topicPreview: TopicPreview, appUrl: string): PodcastSeries {
	const showCover = { kind: "show" as const, id: topicPreview.topicId, title: topicPreview.title }
	return {
		name: `${topicPreview.title}: ${PODCAST_SHOW_NAME}`,
		description: topicPreview.description,
		url: `${appUrl}${toTopicPath({ id: topicPreview.topicId, name: topicPreview.title })}`,
		imageUrl: `${appUrl}${toPodcastCoverPath(showCover, 3000)}`,
		feedUrl: `${appUrl}${toPodcastFeedPath(topicPreview.topicId)}`,
	}
}

/**
 * Returns the PodcastSeries schema for a public Topic's podcast.
 */
export function toPodcastSeriesLd({ name, description, url, imageUrl, feedUrl }: PodcastSeries): object {
	return {
		"@context": "https://schema.org",
		"@type": "PodcastSeries",
		name,
		description,
		url,
		image: imageUrl,
		webFeed: feedUrl,
	}
}

/**
 * Returns the PodcastEpisode schema for a public podcast episode page.
 */
export function toPodcastEpisodeLd(work: PodcastEpisodeWork): object {
	// the length as an ISO 8601 duration
	const minutes = Math.floor(work.durationSeconds / 60)
	const seconds = work.durationSeconds % 60
	return {
		"@context": "https://schema.org",
		"@type": "PodcastEpisode",
		name: work.name,
		description: work.description,
		url: work.url,
		datePublished: work.publishedAt.toISOString(),
		duration: `PT${minutes}M${seconds}S`,
		// where the podcast episode sits in the series, and its audio
		episodeNumber: work.episodeNumber,
		partOfSeason: { "@type": "PodcastSeason", seasonNumber: work.season },
		associatedMedia: { "@type": "MediaObject", contentUrl: work.audioUrl, encodingFormat: "audio/mpeg" },
		partOfSeries: toPodcastSeriesLd(work.series),
	}
}
