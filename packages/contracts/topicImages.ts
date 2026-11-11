// a topic image's sizes, the files derived at each, and the urls that serve them
import { z } from "zod"
import { type TopicImageSize, topicImageRenderStatuses, topicImageSizes } from "./enums"

// the pixel size of every original, generated at 3:2 or cropped to it
export const TOPIC_IMAGE_ORIGINAL_WIDTH = 1264
export const TOPIC_IMAGE_ORIGINAL_HEIGHT = 848

// the 1x pixel size of each derived size. the 2x file doubles both
export const TOPIC_IMAGE_PIXELS: Record<TopicImageSize, { width: number; height: number }> = {
	page: { width: 360, height: 240 },
	list: { width: 120, height: 80 },
	thumbnail: { width: 48, height: 32 },
}

// the densities every size is derived at
export const TOPIC_IMAGE_DENSITIES = [1, 2] as const
export type TopicImageDensity = (typeof TOPIC_IMAGE_DENSITIES)[number]

// how long an owner's image prompt may run
export const TOPIC_IMAGE_PROMPT_CHARS = 500

// what an upload may be: its largest size in bytes and its content types
export const MAX_TOPIC_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
export const TOPIC_IMAGE_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

// one size's files: the 1x url and the 2x url
const topicImageSizeUrls = z.object({ url: z.string(), url2x: z.string() })

// a topic image's files at every size
export const topicImageUrls = z.object({
	page: topicImageSizeUrls,
	list: topicImageSizeUrls,
	thumbnail: topicImageSizeUrls,
})

export type TopicImageUrls = z.infer<typeof topicImageUrls>

// the body that regenerates a topic's image: an optional image prompt, which the image model draws from alone
export const regenerateTopicImagePayload = z.object({
	imagePrompt: z.string().trim().max(TOPIC_IMAGE_PROMPT_CHARS).optional(),
})

// what a regeneration returns: the render row that is under way
export const regenerateTopicImageResponse = z.object({ renderId: z.string() })

// a render as the editor polls it: where it stands, and the topic's image once it succeeded. a film's render leaves
// the film's poster url instead, which is optional, so a released app reads a render without it
export const topicImageRenderResponse = z.object({
	status: z.enum(topicImageRenderStatuses),
	image: topicImageUrls.nullable(),
	posterUrl: z.string().nullable().optional(),
})

export type TopicImageRenderResponse = z.infer<typeof topicImageRenderResponse>

// what an upload returns: the topic's image as uploaded
export const uploadTopicImageResponse = z.object({ image: topicImageUrls })

// what a film image's upload returns: the film's poster url
export const uploadTopicPodcastEpisodeVideoImageResponse = z.object({ posterUrl: z.string() })

// how many regenerations the editor has used this month and how many the plan allows
export const imageRegenerationQuota = z.object({ used: z.number().int(), limit: z.number().int() })

export type ImageRegenerationQuota = z.infer<typeof imageRegenerationQuota>

/**
 * Returns the file name of one derived file, such as `page@2x.webp` or `thumbnail.webp`.
 */
export function toTopicImageFileName(size: TopicImageSize, density: TopicImageDensity): string {
	return density === 1 ? `${size}.webp` : `${size}@${density}x.webp`
}

/**
 * Returns a topic image's urls at every size and density, from the topic's id and its current content hash.
 */
export function toTopicImageUrls(topicId: string, hash: string): TopicImageUrls {
	return toImageUrls(toTopicImageFolderPath(topicId, hash))
}

/**
 * Returns a topic image's urls from its current content hash, or null for a topic with no image yet.
 */
export function toTopicImageUrlsOrNull(topicId: string, hash: string | null): TopicImageUrls | null {
	return hash ? toTopicImageUrls(topicId, hash) : null
}

/**
 * Returns image urls with the site's origin before each path, for a client outside the site.
 */
export function toAbsoluteTopicImageUrls(image: TopicImageUrls, siteUrl: string): TopicImageUrls {
	return mapImageUrls(image, (url) => `${siteUrl}${url}`)
}

/**
 * Returns every size of a podcast episode's image as its 1x and 2x paths, in the topic image's sizes.
 */
export function toPodcastEpisodeImageUrls(podcastEpisodeId: string, hash: string): TopicImageUrls {
	return toImageUrls(`/api/podcast-episode-images/${podcastEpisodeId}/${hash}`)
}

/**
 * Returns every size of a Topic Post's image as its 1x and 2x paths, in the topic image's sizes.
 */
export function toTopicPostImageUrls(topicPostId: string, hash: string): TopicImageUrls {
	return toImageUrls(`/api/topic-post-images/${topicPostId}/${hash}`)
}

// the file name a film's own image is served under
export const TOPIC_PODCAST_EPISODE_VIDEO_POSTER_FILE_NAME = "poster.jpg"

/**
 * Returns the path of a film's poster, its own image at the film's size, from its podcast episode's id and the image's
 * content hash.
 */
export function toTopicPodcastEpisodeVideoPosterUrl(podcastEpisodeId: string, hash: string): string {
	return `/api/topic-podcast-episode-video-images/${podcastEpisodeId}/${hash}/${TOPIC_PODCAST_EPISODE_VIDEO_POSTER_FILE_NAME}`
}

/**
 * Returns the path of the imagined image of one chapter of a film, from its podcast episode's id and the chapter's
 * position. The path is not found for a chapter with no imagined image.
 */
export function toTopicPodcastEpisodeVideoChapterImageUrl(podcastEpisodeId: string, position: number): string {
	return `/api/topic-podcast-episode-video-images/${podcastEpisodeId}/chapters/${position}/image.jpg`
}

/**
 * Returns a film's poster as an image's urls, its one file at every size, for an image block or a card that shows it.
 */
export function toTopicPodcastEpisodeVideoImageUrls(posterUrl: string): TopicImageUrls {
	return Object.fromEntries(
		topicImageSizes.map((size) => [size, { url: posterUrl, url2x: posterUrl }]),
	) as TopicImageUrls
}

// the api path a topic image's files are served after: the topic's id, then the image's content hash
function toTopicImageFolderPath(topicId: string, hash: string): string {
	return `/api/topic-images/${topicId}/${hash}`
}

// an image's urls at every size: its 1x and 2x file after the api path that serves the image's files
function toImageUrls(imageFolderPath: string): TopicImageUrls {
	return Object.fromEntries(
		topicImageSizes.map((size) => [
			size,
			{
				url: `${imageFolderPath}/${toTopicImageFileName(size, 1)}`,
				url2x: `${imageFolderPath}/${toTopicImageFileName(size, 2)}`,
			},
		]),
	) as TopicImageUrls
}

// an image's urls with every url rewritten by the function
function mapImageUrls(image: TopicImageUrls, toUrl: (url: string) => string): TopicImageUrls {
	return Object.fromEntries(
		topicImageSizes.map((size) => [size, { url: toUrl(image[size].url), url2x: toUrl(image[size].url2x) }]),
	) as TopicImageUrls
}

/**
 * Returns the size and density a derived file name holds, or null for a name that matches no size and density.
 */
export function fromTopicImageFileName(fileName: string): { size: TopicImageSize; density: TopicImageDensity } | null {
	// match `<size>.webp` or `<size>@2x.webp` against the sizes and densities
	const match = /^([a-z]+)(?:@(\d)x)?\.webp$/.exec(fileName)
	const size = topicImageSizes.find((topicImageSize) => topicImageSize === match?.[1])
	const density = TOPIC_IMAGE_DENSITIES.find((topicImageDensity) => topicImageDensity === Number(match?.[2] ?? 1))
	return size && density ? { size, density } : null
}
