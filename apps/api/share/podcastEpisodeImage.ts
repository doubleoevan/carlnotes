// the link-preview card that a pasted podcast episode url renders as
import type { Visibility } from "@carlnotes/contracts/enums"
import { toSeasonEpisodeLabel } from "@carlnotes/contracts/podcastEpisodes"
import {
	toPodcastEpisodeImageOriginalKey,
	toTopicImageOriginalKey,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import type { PodcastEpisodeRow } from "../podcast/podcastEpisodeRows"
import {
	CARD_MUTED_COLOR,
	type CardElement,
	loadCardImageBandDataUri,
	PREVIEW_TEMPLATE_VERSION,
	toBrandIcon,
	toCardPng,
	toImageOverTextCardPng,
} from "./previewImage"

// the podcast episode's id, title, season, episode number, length, and topic name that its preview card shows
export type PodcastEpisodePreview = {
	podcastEpisodeId: string
	title: string
	topicName: string
	season: number
	episodeNumber: number
	durationSeconds: number
	// the topic, its image's hash, and the episode's own image's hash, each null until it is drawn
	topicId: string
	topicImageHash: string | null
	podcastEpisodeImageHash: string | null
}

// the topic a podcast episode's preview is built with. only a public topic's images are drawn
export type PodcastEpisodePreviewTopic = { id: string; name: string; visibility: Visibility; imageHash: string | null }

// the fields of a podcast episode's row that its card shows
type PodcastEpisodeCardRow = Pick<
	PodcastEpisodeRow,
	"id" | "title" | "season" | "episodeNumber" | "durationSeconds" | "imageHash"
>

/**
 * Builds a podcast episode's preview card fields from its row, with its topic's name for a missing title.
 */
export function toPodcastEpisodePreview(
	podcastEpisodeRow: PodcastEpisodeCardRow,
	topic: PodcastEpisodePreviewTopic,
): PodcastEpisodePreview {
	return {
		podcastEpisodeId: podcastEpisodeRow.id,
		title: podcastEpisodeRow.title ?? topic.name,
		topicName: topic.name,
		season: podcastEpisodeRow.season ?? 0,
		episodeNumber: podcastEpisodeRow.episodeNumber ?? 0,
		durationSeconds: podcastEpisodeRow.durationSeconds ?? 0,
		topicId: topic.id,
		topicImageHash: topic.visibility === "public" ? topic.imageHash : null,
		podcastEpisodeImageHash: topic.visibility === "public" ? podcastEpisodeRow.imageHash : null,
	}
}

/**
 * The stored object key for a podcast episode preview card.
 *
 * It holds the template version and a hash of everything drawn, so changing a field generates a new preview url.
 */
export function toPodcastEpisodePreviewKey(podcastEpisodePreview: PodcastEpisodePreview): string {
	// hash the drawn fields into the object key
	const { podcastEpisodeId, title, topicName, topicImageHash, podcastEpisodeImageHash } = podcastEpisodePreview
	const podcastEpisodeDetails = toPodcastEpisodeDetails(podcastEpisodePreview)
	const imageHashes = `${topicImageHash ?? ""}|${podcastEpisodeImageHash ?? ""}`
	const previewImage = `${title}|${topicName}|${podcastEpisodeDetails}|${imageHashes}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/episodes/${podcastEpisodeId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Renders a podcast episode's preview card to PNG bytes: the episode's own image across the top, or its topic's until
 * the episode has one, with the title and the episode's details on the card under it.
 */
export async function toPodcastEpisodePreviewPng(podcastEpisodePreview: PodcastEpisodePreview): Promise<Uint8Array> {
	// the stored original the card crops, the episode's own first
	const { podcastEpisodeId, topicId, title, topicImageHash, podcastEpisodeImageHash } = podcastEpisodePreview
	const originalKey = podcastEpisodeImageHash
		? toPodcastEpisodeImageOriginalKey(podcastEpisodeId, podcastEpisodeImageHash)
		: topicImageHash
			? toTopicImageOriginalKey(topicId, topicImageHash)
			: null

	// the text card with no image, or the image across the top
	const footer = toPodcastEpisodeFooter(podcastEpisodePreview)
	if (!originalKey) {
		return toCardPng([toBrandIcon(), toPodcastEpisodeTitle(title), footer])
	}
	return toImageOverTextCardPng({ imageDataUri: await loadCardImageBandDataUri(originalKey), title, footer })
}

// the episode's title as the card title, across the card with no image over it
function toPodcastEpisodeTitle(title: string): CardElement {
	return {
		type: "div",
		props: { style: { display: "block", lineClamp: 3, fontSize: 64, lineHeight: 1.1 }, children: title },
	}
}

// the topic's name on one line, over the podcast episode's season, episode number, and length
function toPodcastEpisodeFooter(podcastEpisodePreview: PodcastEpisodePreview): CardElement {
	return {
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
}

// the podcast episode's season, episode number, and length in whole minutes, such as "2026 · E14 · 19 min"
function toPodcastEpisodeDetails(podcastEpisodePreview: PodcastEpisodePreview): string {
	const minuteCount = Math.max(1, Math.round(podcastEpisodePreview.durationSeconds / 60))
	return `${toSeasonEpisodeLabel(podcastEpisodePreview)} · ${minuteCount} min`
}
