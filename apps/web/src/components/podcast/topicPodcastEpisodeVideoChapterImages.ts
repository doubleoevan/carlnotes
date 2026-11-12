// the images that a chapter's tooltip on the film's seek bar tries, in the order the film picks a chapter's still
import { toTopicPodcastEpisodeVideoChapterImageUrl } from "@carlnotes/contracts/topicImages"

// Carl and Vienna's podcast card, the illustration that a chapter with no image of its own shows
const PODCAST_CARD_IMAGE_PATH = "/podcast-cover-placeholder.jpg"

// one image a chapter's tooltip may show: which of the film's choices it is, and its url on this site
export type TopicPodcastEpisodeVideoChapterImage = {
	kind: "linkPreview" | "generated" | "podcastCard"
	url: string
}

// the urls of the chapters' own images that failed to load, kept for the life of the page
const failedImageUrls = new Set<string>()

// the film's podcast episode, the chapter's position, and the path of its Finding's link preview image, null if the
// Finding has none
type ToTopicPodcastEpisodeVideoChapterImagesOptions = {
	podcastEpisodeId: string
	chapterPosition: number
	linkPreviewImagePath: string | null
}

/**
 * Returns the images a chapter's tooltip tries, each after the one before it fails to load: the Finding's link preview
 * image, then the chapter's generated image, which is not found for a chapter with none, then the podcast card. An
 * image that already failed to load on this page is left out.
 */
export function toTopicPodcastEpisodeVideoChapterImages({
	podcastEpisodeId,
	chapterPosition,
	linkPreviewImagePath,
}: ToTopicPodcastEpisodeVideoChapterImagesOptions): TopicPodcastEpisodeVideoChapterImage[] {
	// the two images every chapter may fall back to
	const fallbackImages: TopicPodcastEpisodeVideoChapterImage[] = [
		{ kind: "generated", url: toTopicPodcastEpisodeVideoChapterImageUrl(podcastEpisodeId, chapterPosition) },
		{ kind: "podcastCard", url: PODCAST_CARD_IMAGE_PATH },
	]

	// the link preview image leads if the Finding has one
	const chapterImages: TopicPodcastEpisodeVideoChapterImage[] = linkPreviewImagePath
		? [{ kind: "linkPreview", url: linkPreviewImagePath }, ...fallbackImages]
		: fallbackImages
	return chapterImages.filter((chapterImage) => !failedImageUrls.has(chapterImage.url))
}

/**
 * Remembers a chapter's own image that failed to load, so that no tooltip on this page asks for its url again. The
 * podcast card is the site's own file, and every tooltip tries it.
 */
export function rememberFailedTopicPodcastEpisodeVideoChapterImage(
	chapterImage: TopicPodcastEpisodeVideoChapterImage,
): void {
	if (chapterImage.kind !== "podcastCard") {
		failedImageUrls.add(chapterImage.url)
	}
}
