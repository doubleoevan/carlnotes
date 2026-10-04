// a Topic's podcast feed as RSS 2.0 with the iTunes and Podcasting 2.0 namespaces, a podcast episode's chapters file,
// and its transcript. every value from a Topic or a podcast episode is user or model text and is escaped
import type { PodcastEpisodeChapter, PodcastEpisodeScript, PodcastEpisodeTranscriptBlock } from "@shared/contracts"
import {
	AI_VOICES_NOTE,
	PODCAST_EPISODE_SPEAKER_NAMES,
	PODCAST_SHOW_NAME,
	toPodcastCoverPath,
	toTranscriptText,
} from "@shared/podcastEpisodes"
import { toPodcastEpisodePath, toTopicPath } from "@shared/seo"
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
}

// what a feed is built from. the podcast episode files' base url is the public url or the listener's own token path
export type ToPodcastFeedXmlOptions = {
	appUrl: string
	topic: { id: string; name: string; prompt: string; visibility: "public" | "invite" | "private" }
	feedUrl: string
	podcastEpisodeFilesBaseUrl: string
	// a listener's own feed is blocked from podcast directories
	isBlockedFromPodcastDirectories: boolean
	podcastEpisodes: PodcastFeedEpisode[]
}

/**
 * Builds a Topic's podcast feed xml, with a channel for the Topic and an item for each podcast episode.
 */
export function toPodcastFeedXml({
	appUrl,
	topic,
	feedUrl,
	podcastEpisodeFilesBaseUrl,
	isBlockedFromPodcastDirectories,
	podcastEpisodes,
}: ToPodcastFeedXmlOptions): string {
	// the show's page, title, cover, and description
	const topicUrl = `${appUrl}${toTopicPath(topic)}`
	const showTitle = `${topic.name}: ${PODCAST_SHOW_NAME}`
	const showCoverUrl = `${appUrl}${toPodcastCoverPath({ kind: "show", id: topic.id, title: topic.name }, 3000)}`
	const showDescription = `${topic.prompt || `What Carl found for ${topic.name}.`} ${AI_VOICES_NOTE}.`

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
		"<itunes:author>Carl and Vienna</itunes:author>",
		`<itunes:image href="${toXmlText(showCoverUrl)}"/>`,
		`<image>${showImageTags}</image>`,
		'<itunes:category text="News"/>',
		"<itunes:explicit>false</itunes:explicit>",
		"<itunes:type>episodic</itunes:type>",
		// the Podcasting 2.0 tags for the feed's own guid and both hosts
		`<podcast:guid>${Bun.randomUUIDv5(feedUrl.replace(/^https?:\/\//, ""), PODCAST_GUID_NAMESPACE)}</podcast:guid>`,
		'<podcast:person role="host">Carl</podcast:person>',
		'<podcast:person role="host">Vienna</podcast:person>',
		// the tag that blocks a listener's own feed from podcast directories
		isBlockedFromPodcastDirectories ? "<itunes:block>Yes</itunes:block>" : "",
	].filter(Boolean)

	// the items, newest first, then the document around the channel's tags and the items
	const feedItems = podcastEpisodes
		.map((podcastEpisode) => toPodcastFeedItem({ appUrl, topic, podcastEpisodeFilesBaseUrl }, podcastEpisode))
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
	const bodyHtml = `<h1>${Bun.escapeHTML(podcastEpisodeTitle)}</h1>\n<p>${AI_VOICES_NOTE}.</p>\n${transcriptBlocksHtml}`
	return `<!doctype html>\n<html lang="en">\n<head>\n${headHtml}\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>`
}

// a podcast episode's feed item. its guid is the podcast episode's id, which a new title never changes
function toPodcastFeedItem(
	{
		appUrl,
		topic,
		podcastEpisodeFilesBaseUrl,
	}: Pick<ToPodcastFeedXmlOptions, "appUrl" | "topic" | "podcastEpisodeFilesBaseUrl">,
	podcastEpisode: PodcastFeedEpisode,
): string {
	// the podcast episode's own page on a public Topic, and the topic page opened at the episode otherwise
	const podcastEpisodeUrl =
		topic.visibility === "public"
			? `${appUrl}${toPodcastEpisodePath(topic, podcastEpisode)}`
			: `${appUrl}${toTopicPath(topic)}?episode=${podcastEpisode.id}`

	// the podcast episode's audio, chapters, and transcript urls, and its cover's path
	const podcastEpisodeFilesUrl = `${podcastEpisodeFilesBaseUrl}/${podcastEpisode.id}`
	const audioUrl = toXmlText(`${podcastEpisodeFilesUrl}/audio.mp3`)
	const chaptersUrl = toXmlText(`${podcastEpisodeFilesUrl}/chapters.json`)
	const transcriptUrl = toXmlText(`${podcastEpisodeFilesUrl}/transcript.html`)
	const coverPath = toPodcastCoverPath({ kind: "episode", id: podcastEpisode.id, title: podcastEpisode.title }, 3000)

	// wrap the item's details, audio, iTunes tags, and Podcasting 2.0 files in an item tag
	const itemTags = [
		`<title>${toXmlText(podcastEpisode.title)}</title>`,
		`<description>${toXmlText(`${podcastEpisode.description} ${AI_VOICES_NOTE}.`)}</description>`,
		`<link>${toXmlText(podcastEpisodeUrl)}</link>`,
		`<guid isPermaLink="false">${toXmlText(podcastEpisode.id)}</guid>`,
		`<pubDate>${podcastEpisode.publishedAt.toUTCString()}</pubDate>`,
		// the stable audio url, which redirects to a short-lived url
		`<enclosure url="${audioUrl}" length="${podcastEpisode.audioByteSize}" type="audio/mpeg"/>`,
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

/**
 * Returns a podcast episode's script as transcript blocks in the order heard, leaving out a block with no turns.
 */
export function toTranscriptBlocks(podcastEpisodeScript: PodcastEpisodeScript): PodcastEpisodeTranscriptBlock[] {
	// each turn under its speaker's name, without the vocal tags that the speech model reads
	const toTranscriptBlock = (
		heading: string | null,
		turns: PodcastEpisodeScript["coldOpen"],
	): PodcastEpisodeTranscriptBlock => ({
		heading,
		turns: turns.map((turn) => ({
			speakerName: PODCAST_EPISODE_SPEAKER_NAMES[turn.speaker],
			text: toTranscriptText(turn.text),
		})),
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
