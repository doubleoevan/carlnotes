// the images a podcast episode's chapter preview can show
import { toTopicVideoChapterImageUrl } from "@carlnotes/contracts/topicImages"

// Carl and Vienna's podcast card, the illustration that a chapter with no image of its own shows
const PODCAST_CARD_IMAGE_PATH = "/podcast-cover-placeholder.jpg"

// a chapter preview image's kind and url
export type PodcastEpisodeChapterImage = {
	kind: "linkPreview" | "generated" | "podcastCard"
	url: string
}

// the urls of the chapters' own images that failed to load, kept for the life of the page
const failedImageUrls = new Set<string>()

// the chapter and which preview images it can have
type ToPodcastEpisodeChapterImagesOptions = {
	podcastEpisodeId: string
	chapterPosition: number
	linkPreviewImagePath: string | null
	hasVideo: boolean
}

/**
 * Returns the chapter's link preview image, its generated image if the episode has a film, and the podcast card.
 * Skips images that already failed to load on this page.
 */
export function toPodcastEpisodeChapterImages({
	podcastEpisodeId,
	chapterPosition,
	linkPreviewImagePath,
	hasVideo,
}: ToPodcastEpisodeChapterImagesOptions): PodcastEpisodeChapterImage[] {
	// prefer the Finding's image, then try the film's generated image before the podcast card
	const chapterImages: PodcastEpisodeChapterImage[] = []
	if (linkPreviewImagePath) {
		chapterImages.push({ kind: "linkPreview", url: linkPreviewImagePath })
	}
	if (hasVideo) {
		chapterImages.push({ kind: "generated", url: toTopicVideoChapterImageUrl(podcastEpisodeId, chapterPosition) })
	}
	chapterImages.push({ kind: "podcastCard", url: PODCAST_CARD_IMAGE_PATH })
	return chapterImages.filter((chapterImage) => !failedImageUrls.has(chapterImage.url))
}

/**
 * Remembers a failed chapter image for the life of the page. Each preview tries the shared podcast card fallback.
 */
export function rememberFailedPodcastEpisodeChapterImage(chapterImage: PodcastEpisodeChapterImage): void {
	if (chapterImage.kind !== "podcastCard") {
		failedImageUrls.add(chapterImage.url)
	}
}
