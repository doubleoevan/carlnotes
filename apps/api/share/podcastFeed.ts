// a Topic's podcast feed or film feed as RSS 2.0 with the iTunes and Podcasting 2.0 namespaces, a podcast episode's chapters file,
// and its transcript. every value from a Topic or a podcast episode is user or model text and is escaped

import type { Visibility } from "@carlnotes/contracts/enums"
import type {
	PodcastEpisodeChapter,
	PodcastEpisodeFormat,
	PodcastEpisodeScript,
	PodcastEpisodeTranscriptBlock,
} from "@carlnotes/contracts/podcast"
import {
	AI_HOSTS_NOTE,
	FULL_PODCAST_COVER_SIZE,
	PODCAST_EPISODE_SPEAKER_NAMES,
	PODCAST_HOSTS_NAME,
	PODCAST_SHOW_NAME,
	PODCAST_THEME_SONG,
	PODCAST_THEME_SONG_DRUMMING_CREDIT,
	PODCAST_THEME_SONG_HEADING,
	PODCAST_THEME_SONG_PERFORMANCE_CREDIT,
	PODCAST_THEME_SONG_PRODUCTION_CREDIT,
	PODCAST_THEME_SONG_WRITING_CREDIT,
	toPodcastEpisodeCover,
	toTranscriptTurn,
} from "@carlnotes/contracts/podcastEpisodes"
import { toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import { toPodcastCoverPath } from "@carlnotes/server/podcastCoverPaths"
import { toXmlText } from "./feed"

// the Podcasting 2.0 namespace that a feed's guid is made in
const PODCAST_GUID_NAMESPACE = "ead4c236-bf58-58c6-a2c6-a6b28d128cb6"

// the namespaces that the feed's tags come from
const RSS_NAMESPACES = [
	'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"',
	'xmlns:podcast="https://podcastindex.org/namespace/1.0"',
	'xmlns:atom="http://www.w3.org/2005/Atom"',
].join(" ")

// one podcast episode as a feed lists it
export type PodcastFeedEpisode = {
	id: string
	title: string
	description: string
	// its season and episode number, its length and audio size, and when it published
	season: number
	episodeNumber: number
	durationSeconds: number
	audioByteSize: number
	publishedAt: Date
	// the hash of its own image, which its cover is drawn over, null until it is drawn
	imageHash: string | null
	// its ready film's size, which a film feed's enclosure names
	videoByteSize?: number
}

// what a feed is built from. the podcast episode files' base url is the public url or the listener's own token path
export type ToPodcastFeedXmlOptions = {
	appUrl: string
	topic: { id: string; name: string; prompt: string; visibility: Visibility; imageHash: string | null }
	feedUrl: string
	podcastEpisodeFilesBaseUrl: string
	// a listener's own feed is blocked from podcast directories
	isBlockedFromPodcastDirectories: boolean
	podcastEpisodes: PodcastFeedEpisode[]
	// the film feed encloses each podcast episode's film, and the podcast feed its audio
	format?: PodcastEpisodeFormat
}

/**
 * Builds a Topic's podcast feed or film feed xml, with a channel for the Topic and an item for each podcast episode.
 */
export function toPodcastFeedXml({
	appUrl,
	topic,
	feedUrl,
	podcastEpisodeFilesBaseUrl,
	isBlockedFromPodcastDirectories,
	podcastEpisodes,
	format = "audio",
}: ToPodcastFeedXmlOptions): string {
	// the show's page, title, cover, and description, which ends with the theme song's credits and its link
	const topicUrl = `${appUrl}${toTopicPath(topic)}`
	const showTitle = `${topic.name}: ${PODCAST_SHOW_NAME}`
	const showCoverPath = toPodcastCoverPath(
		{ kind: "show", id: topic.id, title: topic.name, topicId: topic.id, topicImageHash: topic.imageHash },
		FULL_PODCAST_COVER_SIZE,
	)
	const showCoverUrl = `${appUrl}${showCoverPath}`
	const showDescription = `${topic.prompt || `What Carl found for ${topic.name}.`} ${AI_HOSTS_NOTE}. ${PODCAST_THEME_SONG_HEADING}: ${PODCAST_THEME_SONG.youtubeUrl}. ${PODCAST_THEME_SONG_WRITING_CREDIT}. ${PODCAST_THEME_SONG_PERFORMANCE_CREDIT}. ${PODCAST_THEME_SONG_PRODUCTION_CREDIT}. ${PODCAST_THEME_SONG_DRUMMING_CREDIT}.`

	// the plain rss image tags, with the cover's url, the show's title, and the show's page
	const showImageTags = [
		`<url>${toXmlText(showCoverUrl)}</url>`,
		`<title>${toXmlText(showTitle)}</title>`,
		`<link>${toXmlText(topicUrl)}</link>`,
	].join("")

	// what a podcast app shows about the show
	const channelTags = [
		`<title>${toXmlText(showTitle)}</title>`,
		`<link>${toXmlText(topicUrl)}</link>`,
		`<atom:link href="${toXmlText(feedUrl)}" rel="self" type="application/rss+xml"/>`,
		`<description>${toXmlText(showDescription)}</description>`,
		"<language>en</language>",
		// the iTunes tags that Apple requires, with the cover in both forms
		`<itunes:author>${PODCAST_HOSTS_NAME}</itunes:author>`,
		`<itunes:image href="${toXmlText(showCoverUrl)}"/>`,
		`<image>${showImageTags}</image>`,
		'<itunes:category text="News"/>',
		"<itunes:explicit>false</itunes:explicit>",
		"<itunes:type>episodic</itunes:type>",
		// the Podcasting 2.0 tags for the feed's own guid and both hosts
		`<podcast:guid>${Bun.randomUUIDv5(feedUrl.replace(/^https?:\/\//, ""), PODCAST_GUID_NAMESPACE)}</podcast:guid>`,
		`<podcast:person role="host">${PODCAST_EPISODE_SPEAKER_NAMES.host}</podcast:person>`,
		`<podcast:person role="host">${PODCAST_EPISODE_SPEAKER_NAMES.cohost}</podcast:person>`,
		// the tag that blocks a listener's own feed from podcast directories
		isBlockedFromPodcastDirectories ? "<itunes:block>Yes</itunes:block>" : "",
	].filter(Boolean)

	// the items, newest first, then the document around the channel's tags and the items
	const feedItems = podcastEpisodes
		.map((podcastEpisode) => toPodcastFeedItem({ appUrl, topic, podcastEpisodeFilesBaseUrl, format }, podcastEpisode))
		.join("")
	const openingTags = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" ${RSS_NAMESPACES}>\n<channel>`
	return `${openingTags}\n${channelTags.join("\n")}\n${feedItems}</channel>\n</rss>`
}

/**
 * Builds a podcast episode's Podcasting 2.0 chapters file, each chapter linking its Finding's source.
 */
export function toPodcastEpisodeChaptersJson(
	podcastEpisodeChapters: Pick<PodcastEpisodeChapter, "title" | "sourceUrl" | "startSeconds">[],
): string {
	return JSON.stringify({
		version: "1.2.0",
		chapters: podcastEpisodeChapters.map(({ title, sourceUrl, startSeconds }) => ({
			startTime: startSeconds,
			title,
			url: sourceUrl,
		})),
	})
}

/**
 * Builds a podcast episode's transcript as an HTML page of escaped text from its stored script.
 */
export function toTranscriptHtml(podcastEpisodeTitle: string, podcastEpisodeScript: PodcastEpisodeScript): string {
	// each block's heading, if the block has a heading, then its turns under their speakers' names
	const transcriptBlocksHtml = toTranscriptBlocks(podcastEpisodeScript)
		.map(({ heading, turns }) => {
			const headingHtml = heading ? `<h2>${Bun.escapeHTML(heading)}</h2>\n` : ""
			const turnsHtml = turns.map(({ speakerName, text }) => `<p><b>${speakerName}:</b> ${Bun.escapeHTML(text)}</p>`)
			return `${headingHtml}${turnsHtml.join("\n")}`
		})
		.join("\n")

	// build a plain page that no search engine indexes
	const headTags = [
		'<meta charset="utf-8">',
		'<meta name="robots" content="noindex">',
		`<title>${Bun.escapeHTML(podcastEpisodeTitle)}</title>`,
	]
	const headHtml = headTags.join("\n")
	const bodyHtml = `<h1>${Bun.escapeHTML(podcastEpisodeTitle)}</h1>\n<p>${AI_HOSTS_NOTE}.</p>\n${transcriptBlocksHtml}`
	return `<!doctype html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>`
}

// a podcast episode's feed item. its guid is the podcast episode's id, or the id with a video suffix in the film
// feed, which a new title never changes
function toPodcastFeedItem(
	{
		appUrl,
		topic,
		podcastEpisodeFilesBaseUrl,
		format,
	}: Pick<ToPodcastFeedXmlOptions, "appUrl" | "topic" | "podcastEpisodeFilesBaseUrl" | "format">,
	podcastEpisode: PodcastFeedEpisode,
): string {
	// the podcast episode's own page on a public Topic, and the topic page opened at the episode otherwise
	const podcastEpisodeUrl =
		topic.visibility === "public"
			? `${appUrl}${toPodcastEpisodePath(topic, podcastEpisode)}`
			: `${appUrl}${toTopicPath(topic)}?episode=${podcastEpisode.id}`

	// the podcast episode's chapters and transcript urls, and its cover's path
	const podcastEpisodeFilesUrl = `${podcastEpisodeFilesBaseUrl}/${podcastEpisode.id}`
	const chaptersUrl = toXmlText(`${podcastEpisodeFilesUrl}/chapters.json`)
	const transcriptUrl = toXmlText(`${podcastEpisodeFilesUrl}/transcript.html`)
	const coverPath = toPodcastCoverPath(toPodcastEpisodeCover(podcastEpisode, topic), FULL_PODCAST_COVER_SIZE)

	// wrap the item's details, audio, iTunes tags, and Podcasting 2.0 files in an item tag
	const itemTags = [
		`<title>${toXmlText(podcastEpisode.title)}</title>`,
		`<description>${toXmlText(`${podcastEpisode.description} ${AI_HOSTS_NOTE}.`)}</description>`,
		`<link>${toXmlText(podcastEpisodeUrl)}</link>`,
		`<guid isPermaLink="false">${toXmlText(format === "video" ? `${podcastEpisode.id}-video` : podcastEpisode.id)}</guid>`,
		`<pubDate>${podcastEpisode.publishedAt.toUTCString()}</pubDate>`,
		toEnclosureTag({ podcastEpisodeFilesUrl, podcastEpisode, format }),
		`<itunes:duration>${podcastEpisode.durationSeconds}</itunes:duration>`,
		`<itunes:season>${podcastEpisode.season}</itunes:season>`,
		`<itunes:episode>${podcastEpisode.episodeNumber}</itunes:episode>`,
		"<itunes:episodeType>full</itunes:episodeType>",
		"<itunes:explicit>false</itunes:explicit>",
		`<itunes:image href="${toXmlText(`${appUrl}${coverPath}`)}"/>`,
		// the Podcasting 2.0 files
		`<podcast:chapters url="${chaptersUrl}" type="application/json+chapters"/>`,
		`<podcast:transcript url="${transcriptUrl}" type="text/html"/>`,
	]
	return `<item>\n${itemTags.join("\n")}\n</item>\n`
}

// the podcast episode's files url, the podcast episode, and the feed's format
type ToEnclosureTagOptions = Pick<ToPodcastFeedXmlOptions, "format"> & {
	podcastEpisodeFilesUrl: string
	podcastEpisode: PodcastFeedEpisode
}

// the stable film or audio url, which redirects to a short-lived url, with the file's size and type
function toEnclosureTag({ podcastEpisodeFilesUrl, podcastEpisode, format }: ToEnclosureTagOptions): string {
	if (format === "video") {
		const videoUrl = toXmlText(`${podcastEpisodeFilesUrl}/video.mp4`)
		return `<enclosure url="${videoUrl}" length="${podcastEpisode.videoByteSize ?? 0}" type="video/mp4"/>`
	}
	const audioUrl = toXmlText(`${podcastEpisodeFilesUrl}/audio.mp3`)
	return `<enclosure url="${audioUrl}" length="${podcastEpisode.audioByteSize}" type="audio/mpeg"/>`
}

/**
 * Returns a podcast episode's script as transcript blocks in listening order, leaving out a block with no turns.
 */
export function toTranscriptBlocks(podcastEpisodeScript: PodcastEpisodeScript): PodcastEpisodeTranscriptBlock[] {
	// each turn under its speaker's name, without the vocal tags that the speech model reads
	const toTranscriptBlock = (
		heading: string | null,
		turns: PodcastEpisodeScript["coldOpen"],
	): PodcastEpisodeTranscriptBlock => ({
		heading,
		turns: turns.map(toTranscriptTurn),
	})

	// the cold open, each segment's transition and chapters, and the sign-off, without the blocks that have no turns
	const segmentBlocks = podcastEpisodeScript.segments.flatMap((segment) => [
		toTranscriptBlock(null, segment.transition),
		...segment.chapters.map((chapter) => toTranscriptBlock(chapter.title, chapter.turns)),
	])
	const transcriptBlocks = [
		toTranscriptBlock(null, podcastEpisodeScript.coldOpen),
		...segmentBlocks,
		toTranscriptBlock(null, podcastEpisodeScript.signOff),
	]
	return transcriptBlocks.filter((transcriptBlock) => transcriptBlock.turns.length > 0)
}
