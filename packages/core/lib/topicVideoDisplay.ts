// what a film section shows for a podcast episode: the film player, the card that says the film is rendering, or
// nothing, and a podcast episode's Video pill
import type { PodcastEpisode, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { TopicVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import type { PodcastEpisodeVideoButtonProps } from "../components/PodcastEpisodeVideoButton"

// the film player for a ready film, the rendering card while the film renders, and null for no film
export type TopicVideoDisplay = "player" | "rendering" | null

/**
 * Returns what a film section shows for a podcast episode: the film player for a ready film, the rendering card while
 * its film renders, and null for a podcast episode with no film or a failed one.
 */
export function toTopicVideoDisplay(
	podcastEpisode: Pick<PodcastEpisode, "video" | "isVideoRendering">,
): TopicVideoDisplay {
	if (podcastEpisode.video) {
		return "player"
	}
	return podcastEpisode.isVideoRendering ? "rendering" : null
}

/**
 * Returns the Video button of a podcast episode with a ready film, as a pill beside its play pill, or null for a
 * podcast episode with no film.
 */
export function toPodcastEpisodeVideoPill(
	podcastEpisode: PodcastEpisodeSummary | null | undefined,
	surface: TopicVideoDialogSurface,
): PodcastEpisodeVideoButtonProps | null {
	if (!podcastEpisode?.hasVideo) {
		return null
	}
	return { podcastEpisode, label: "Video", surface, size: "pill" }
}
