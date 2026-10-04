// the link-preview card that a pasted podcast episode url renders as
import type { PodcastEpisodeRow } from "../podcast/helpers"
import { PODCAST_COVER_TEMPLATE_VERSION, toCachedPodcastCoverJpeg } from "./podcastCover"
import { CARD_MUTED_COLOR, type CardElement, PREVIEW_TEMPLATE_VERSION, toBrandIcon, toCardPng } from "./previewImage"

// how wide and tall the cover is on the card, which is the card's height inside its padding
const CARD_COVER_SIZE = 502

// the podcast episode's id, title, season, episode number, length, and topic name that its preview card shows
export type PodcastEpisodePreview = {
	podcastEpisodeId: string
	title: string
	topicName: string
	season: number
	episodeNumber: number
	durationSeconds: number
}

// the fields of a podcast episode's row that its card shows
type PodcastEpisodeCardRow = Pick<PodcastEpisodeRow, "id" | "title" | "season" | "episodeNumber" | "durationSeconds">

/**
 * Builds a podcast episode's preview card fields from its row, with its topic's name for a missing title.
 */
export function toPodcastEpisodePreview(
	podcastEpisodeRow: PodcastEpisodeCardRow,
	topicName: string,
): PodcastEpisodePreview {
	return {
		podcastEpisodeId: podcastEpisodeRow.id,
		title: podcastEpisodeRow.title ?? topicName,
		topicName,
		season: podcastEpisodeRow.season ?? 0,
		episodeNumber: podcastEpisodeRow.episodeNumber ?? 0,
		durationSeconds: podcastEpisodeRow.durationSeconds ?? 0,
	}
}

/**
 * The stored object key for a podcast episode preview card.
 *
 * It holds the template version and a hash of everything drawn, so changing a field generates a new preview url.
 */
export function toPodcastEpisodePreviewKey(podcastEpisodePreview: PodcastEpisodePreview): string {
	// hash the drawn fields and the cover's template version into the object key
	const { podcastEpisodeId, title, topicName } = podcastEpisodePreview
	const podcastEpisodeDetails = toPodcastEpisodeDetails(podcastEpisodePreview)
	const previewImage = `${title}|${topicName}|${podcastEpisodeDetails}|${PODCAST_COVER_TEMPLATE_VERSION}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/episodes/${podcastEpisodeId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Renders a podcast episode's preview card to PNG bytes, with its cover on the left and its text on the right.
 */
export async function toPodcastEpisodePreviewPng(podcastEpisodePreview: PodcastEpisodePreview): Promise<Uint8Array> {
	// the podcast episode's cover at its small size, as bytes that satori can draw
	const { podcastEpisodeId, title } = podcastEpisodePreview
	const coverJpeg = await toCachedPodcastCoverJpeg({ kind: "episode", id: podcastEpisodeId, title }, 600)
	const coverDataUri = `data:image/jpeg;base64,${Buffer.from(coverJpeg).toString("base64")}`

	// the cover beside the column of text
	const coverElement: CardElement = {
		type: "img",
		props: { src: coverDataUri, width: CARD_COVER_SIZE, height: CARD_COVER_SIZE, style: { borderRadius: 24 } },
	}
	const coverAndTextElement: CardElement = {
		type: "div",
		props: {
			style: { display: "flex", gap: "48px", height: "100%" },
			children: [coverElement, toPodcastEpisodeText(podcastEpisodePreview)],
		},
	}
	return toCardPng([coverAndTextElement])
}

// the column beside the cover, with the brand icon, the podcast episode's title, and its topic's name over its details
function toPodcastEpisodeText(podcastEpisodePreview: PodcastEpisodePreview): CardElement {
	// the title wraps and stops at four lines with an ellipsis
	const titleElement: CardElement = {
		type: "div",
		props: {
			style: { display: "block", lineClamp: 4, fontSize: 54, lineHeight: 1.15 },
			children: podcastEpisodePreview.title,
		},
	}

	// the topic's name on one line, over the podcast episode's season, episode number, and length
	const footerElement: CardElement = {
		type: "div",
		props: {
			style: { display: "flex", flexDirection: "column", gap: "8px", fontSize: 30 },
			children: [
				{
					type: "div",
					props: { style: { display: "block", lineClamp: 1 }, children: podcastEpisodePreview.topicName },
				},
				{
					type: "div",
					props: {
						style: { display: "flex", color: CARD_MUTED_COLOR },
						children: toPodcastEpisodeDetails(podcastEpisodePreview),
					},
				},
			],
		},
	}
	return {
		type: "div",
		props: {
			style: { display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 },
			children: [toBrandIcon(), titleElement, footerElement],
		},
	}
}

// the podcast episode's season, episode number, and length in whole minutes, such as "2026 · E14 · 19 min"
function toPodcastEpisodeDetails({ season, episodeNumber, durationSeconds }: PodcastEpisodePreview): string {
	return `${season} · E${episodeNumber} · ${Math.max(1, Math.round(durationSeconds / 60))} min`
}
