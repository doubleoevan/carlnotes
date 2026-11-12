// the object keys of a podcast episode film's stored files: its parts by image and render version, its captions, its
// own image and that image's larger original, and each chapter's generated images

import { toStoredObjectKeys } from "./store"

// a podcast episode film's parts that are drawn from its image, so each image gets its own key
type TopicPodcastEpisodeVideoImagePart = "intro" | "sign-off" | "film"

// the podcast episode, the part, the content hash of the image that the part was drawn from, and the render version
// the part was rendered at
type ToTopicPodcastEpisodeVideoImagePartKeyOptions = {
	podcastEpisodeId: string
	part: TopicPodcastEpisodeVideoImagePart
	imageHash: string
	renderVersion: number
}

/**
 * Returns the object key of a film part drawn from one image at one render version. A new image and a new render
 * version each give the part a new key.
 */
export function toTopicPodcastEpisodeVideoImagePartKey({
	podcastEpisodeId,
	part,
	imageHash,
	renderVersion,
}: ToTopicPodcastEpisodeVideoImagePartKeyOptions): string {
	return `episodes/${podcastEpisodeId}/video/${part}-${imageHash}${toRenderVersionSuffix(renderVersion)}.mp4`
}

/**
 * Returns the object key of a film's chapters part at one render version, which a rebuild keeps.
 */
export function toTopicPodcastEpisodeVideoChaptersKey(podcastEpisodeId: string, renderVersion: number): string {
	return `episodes/${podcastEpisodeId}/video/chapters${toRenderVersionSuffix(renderVersion)}.mp4`
}

/**
 * Returns the object key of a film's WebVTT captions at one render version.
 */
export function toTopicPodcastEpisodeVideoCaptionsKey(podcastEpisodeId: string, renderVersion: number): string {
	return `episodes/${podcastEpisodeId}/video/captions${toRenderVersionSuffix(renderVersion)}.vtt`
}

// the part of a film key that names its render version. version 1 has none
function toRenderVersionSuffix(renderVersion: number): string {
	return renderVersion > 1 ? `-v${renderVersion}` : ""
}

/**
 * Returns the object key of a film's own image, a jpeg at the film's size. A new image gets a new key.
 */
export function toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId: string, imageHash: string): string {
	return `episodes/${podcastEpisodeId}/video/image-${imageHash}.jpg`
}

/**
 * Returns the object key of the original of a film's own image, a larger jpeg that the intro and the sign-off zoom
 * into, named by the hash of the image at the film's size.
 */
export function toTopicPodcastEpisodeVideoImageLargeOriginalKey(podcastEpisodeId: string, imageHash: string): string {
	return `episodes/${podcastEpisodeId}/video/image-${imageHash}-original.jpg`
}

// how many generated images one chapter of a film may have
export const GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER = 12

/**
 * Returns the object key of the first generated image of one chapter of a film, a jpeg at the film's size.
 */
export function toTopicPodcastEpisodeVideoChapterImageKey(podcastEpisodeId: string, position: number): string {
	return `episodes/${podcastEpisodeId}/video/chapter-${position}-image.jpg`
}

/**
 * Returns the object keys of every generated image one chapter of a film may have, in the order they are drawn. The
 * first is the chapter's first generated image, and each further one is numbered from 1.
 */
export function toTopicPodcastEpisodeVideoChapterImageKeys(podcastEpisodeId: string, position: number): string[] {
	const numberedKeys = Array.from(
		{ length: GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER - 1 },
		(_, i) => `episodes/${podcastEpisodeId}/video/chapter-${position}-image-${i + 1}.jpg`,
	)
	return [toTopicPodcastEpisodeVideoChapterImageKey(podcastEpisodeId, position), ...numberedKeys]
}

// a film row's object keys, any of them null until it is uploaded
type TopicPodcastEpisodeVideoKeyColumns = {
	introKey: string | null
	chaptersKey: string | null
	signOffKey: string | null
	filmKey: string | null
	captionsKey: string | null
	// the film's podcast episode and the hash of the film's own image, which name the image's key. the hash is null
	// for a film with no image of its own
	podcastEpisodeId: string | null
	imageHash: string | null
	// how many chapters the film's podcast episode has. any of them may have generated images
	chapterCount: number
}

/**
 * Returns every stored object key of a film row, its own image and that image's original among them, without the keys
 * not yet uploaded, and the keys of every generated image each chapter may have, whether or not the chapter has them.
 */
export function toTopicPodcastEpisodeVideoKeys(topicPodcastEpisodeVideo: TopicPodcastEpisodeVideoKeyColumns): string[] {
	// the keys of the film's own image and of its original, if the film has an image
	const { podcastEpisodeId, imageHash, chapterCount } = topicPodcastEpisodeVideo
	const imageKeys =
		podcastEpisodeId && imageHash
			? [
					toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, imageHash),
					toTopicPodcastEpisodeVideoImageLargeOriginalKey(podcastEpisodeId, imageHash),
				]
			: []

	// the parts, the film, the captions, and the image
	const { introKey, chaptersKey, signOffKey, filmKey, captionsKey } = topicPodcastEpisodeVideo
	const storedKeys = toStoredObjectKeys(
		[introKey, chaptersKey, signOffKey, filmKey, captionsKey, ...imageKeys].map((objectKey) => ({ objectKey })),
	)

	// a podcast episode with no film row has no chapter images
	if (!podcastEpisodeId) {
		return storedKeys
	}
	// ponytail: lists every key a chapter may have. store each chapter's count if a removal gets slow
	const chapterImageKeys = Array.from({ length: chapterCount }, (_, position) =>
		toTopicPodcastEpisodeVideoChapterImageKeys(podcastEpisodeId, position),
	).flat()
	return [...storedKeys, ...chapterImageKeys]
}
