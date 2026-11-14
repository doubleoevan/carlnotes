// a podcast episode's own cover: its image across the top two thirds over a panel with its title and detail line, as a
// podcast episode card shows them, and the stored image that the cover is drawn over

import { FULL_PODCAST_COVER_SIZE, type PodcastCover } from "@carlnotes/contracts/podcastEpisodes"
import { getAttachmentBytes } from "@carlnotes/db/store"
import { latte } from "@carlnotes/nightshift/colors"
import type { CardElement } from "@carlnotes/pipeline/cardElementPng"
import {
	toPodcastEpisodeImageOriginalKey,
	toTopicImageOriginalKey,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { toDataUrl } from "@carlnotes/server/dataUrl"

// a podcast episode's cover, the episode kind of a cover
export type PodcastEpisodeCover = Extract<PodcastCover, { kind: "episode" }>

// a podcast episode cover's image across its top two thirds, at the image's own 3:2, and the panel under it
const EPISODE_IMAGE_HEIGHT = (FULL_PODCAST_COVER_SIZE * 2) / 3
const EPISODE_PANEL_PADDING = FULL_PODCAST_COVER_SIZE * 0.06

// the panel's title, which steps down once it is long and stops at two lines, and its detail line on one line
const EPISODE_TITLE_SIZE_STEP = { maxChars: 24, fontSize: 220 }
const LONG_EPISODE_TITLE_FONT_SIZE = 170
const MAX_EPISODE_TITLE_LINES = 2
const EPISODE_DETAILS_FONT_SIZE = 120

/**
 * Returns a podcast episode cover's markup: the image across the top two thirds, and the panel under it with the
 * title and the detail line, as a podcast episode card shows them.
 */
export function toPodcastEpisodeCoverElement(podcastCover: PodcastEpisodeCover, imageDataUri: string): CardElement {
	// the title in the panel, smaller once it is long, wrapped and stopped at two lines with an ellipsis
	const titleFontSize =
		podcastCover.title.length <= EPISODE_TITLE_SIZE_STEP.maxChars
			? EPISODE_TITLE_SIZE_STEP.fontSize
			: LONG_EPISODE_TITLE_FONT_SIZE
	const titleElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "block",
				lineClamp: MAX_EPISODE_TITLE_LINES,
				fontSize: titleFontSize,
				lineHeight: 1.15,
				color: latte.heroForeground,
			},
			children: podcastCover.title,
		},
	}

	// the topic's name with the season and number, on one line
	const detailsElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "block",
				lineClamp: 1,
				marginTop: 50,
				fontSize: EPISODE_DETAILS_FONT_SIZE,
				lineHeight: 1.2,
				color: latte.heroMuted,
			},
			children: podcastCover.details,
		},
	}

	// the image on top and the panel under it, on the hero band's espresso
	const imageElement: CardElement = {
		type: "img",
		props: {
			src: imageDataUri,
			width: FULL_PODCAST_COVER_SIZE,
			height: EPISODE_IMAGE_HEIGHT,
			style: { objectFit: "cover" },
		},
	}
	const panelElement: CardElement = {
		type: "div",
		props: {
			style: {
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				flexGrow: 1,
				padding: EPISODE_PANEL_PADDING,
			},
			children: [titleElement, detailsElement],
		},
	}
	return {
		type: "div",
		props: {
			style: {
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				backgroundColor: latte.hero,
				fontFamily: "Architects Daughter",
			},
			children: [imageElement, panelElement],
		},
	}
}

/**
 * Returns a podcast episode's own image's original as a data uri, or its topic's, or null if neither has been drawn.
 */
export async function loadPodcastEpisodeImageDataUri({
	id,
	topicId,
	topicImageHash,
	podcastEpisodeImageHash,
}: PodcastEpisodeCover): Promise<string | null> {
	// the key of the episode's own original, else its topic's
	const originalKey = podcastEpisodeImageHash
		? toPodcastEpisodeImageOriginalKey(id, podcastEpisodeImageHash)
		: topicImageHash
			? toTopicImageOriginalKey(topicId, topicImageHash)
			: null
	if (!originalKey) {
		return null
	}

	// the original's bytes from storage
	const originalJpeg = await getAttachmentBytes(originalKey)
	return toDataUrl("image/jpeg", originalJpeg)
}
