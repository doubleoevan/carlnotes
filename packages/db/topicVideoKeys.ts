// the object keys of a podcast episode film's stored files: its parts by image and render version, its captions, its
// own image and that image's larger original, and each chapter's generated images

import { toStoredObjectKeys } from "./store"

// a podcast episode film's parts that are drawn from its image, so each image gets its own key
type TopicVideoImagePart = "intro" | "sign-off" | "film"

// the podcast episode, the part, the content hash of the image that the part was drawn from, and the render version
// the part was rendered at
type ToTopicVideoImagePartKeyOptions = {
	podcastEpisodeId: string
	part: TopicVideoImagePart
	imageHash: string
	renderVersion: number
}

/** Keeps each render attempt’s uploads separate until the replacement film is published. */
export function toTopicVideoRenderAttemptUploadKey(key: string, renderAttemptId: string | undefined): string {
	return renderAttemptId ? key.replace(/(\.[^.]+)$/u, `-${renderAttemptId}$1`) : key
}

/**
 * Returns the object key of a film part drawn from one image at one render version. A new image and a new render
 * version each give the part a new key.
 */
export function toTopicVideoImagePartKey({
	podcastEpisodeId,
	part,
	imageHash,
	renderVersion,
}: ToTopicVideoImagePartKeyOptions): string {
	return `episodes/${podcastEpisodeId}/video/${part}-${imageHash}${toRenderVersionSuffix(renderVersion)}.mp4`
}

/**
 * Returns the object key of a film's chapters part at one render version, which a rebuild keeps.
 */
export function toTopicVideoChaptersKey(
	podcastEpisodeId: string,
	renderVersion: number,
	scenePlansHash?: string,
): string {
	const plansSuffix = scenePlansHash ? `-plans-${scenePlansHash}` : ""
	return `episodes/${podcastEpisodeId}/video/chapters${toRenderVersionSuffix(renderVersion)}${plansSuffix}.mp4`
}

/**
 * Reads the scene plans hash from the episode's immutable chapters part, or null for an older upload.
 */
export function readTopicVideoScenePlansHash(podcastEpisodeId: string, chaptersKey: string): string | null {
	const match = /-plans-([a-f0-9]{64})-([a-f0-9-]{36})\.mp4$/u.exec(chaptersKey)
	if (!match) {
		return null
	}

	// require the complete episode key and render attempt before trusting its hash
	const [, hash, attempt] = match
	const expected = toTopicVideoRenderAttemptUploadKey(toTopicVideoChaptersKey(podcastEpisodeId, 4, hash), attempt)
	return expected === chaptersKey ? (hash ?? null) : null
}

/**
 * Returns the object key of a film's WebVTT captions at one render version.
 */
export function toTopicVideoCaptionsKey(podcastEpisodeId: string, renderVersion: number): string {
	return `episodes/${podcastEpisodeId}/video/captions${toRenderVersionSuffix(renderVersion)}.vtt`
}

// the part of a film key that names its render version. version 1 has none
function toRenderVersionSuffix(renderVersion: number): string {
	return renderVersion > 1 ? `-v${renderVersion}` : ""
}

/**
 * Returns the object key of a film's own image, a jpeg at the film's size. A new image gets a new key.
 */
export function toTopicVideoImageKey(podcastEpisodeId: string, imageHash: string): string {
	return `episodes/${podcastEpisodeId}/video/image-${imageHash}.jpg`
}

/**
 * Returns the object key of the original of a film's own image, a larger jpeg that the intro and the sign-off zoom
 * into, named by the hash of the image at the film's size.
 */
export function toTopicVideoImageLargeOriginalKey(podcastEpisodeId: string, imageHash: string): string {
	return `episodes/${podcastEpisodeId}/video/image-${imageHash}-original.jpg`
}

/** Returns the private plan slot for this episode and chapter, also used when deleting the episode. */
export function toTopicVideoScenePlanKey(episode: string, position: number): string {
	return `episodes/${episode}/video/chapter-${position}-scene-plan.json`
}

/** Returns the reservation and silent animation owned by a film. */
export function toTopicVideoAnimationKeys(episode: string) {
	const prefix = `episodes/${episode}/video/picture-motion`
	return { decision: `${prefix}.json`, video: `${prefix}.mkv` }
}

// how many generated images one chapter of a film may have
export const GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER = 12

// the version of the film house style that a chapter's generated images are drawn in. each style version has its own
// keys
export const GENERATED_CHAPTER_IMAGE_STYLE_VERSION = 2

/**
 * Returns the object key of the first generated image of one chapter of a film, a jpeg at the film's size, drawn in a
 * style version, the current one unless given. Style version 1's keys have no style suffix.
 */
export function toTopicVideoChapterImageKey(
	podcastEpisodeId: string,
	position: number,
	styleVersion = GENERATED_CHAPTER_IMAGE_STYLE_VERSION,
): string {
	return `episodes/${podcastEpisodeId}/video/chapter-${position}-image${toStyleVersionSuffix(styleVersion)}.jpg`
}

/**
 * Returns the object keys of every generated image one chapter of a film may have in a style version, the current one
 * unless given, in the order they are drawn. The first is the chapter's first generated image, and each further one is
 * numbered from 1.
 */
export function toTopicVideoChapterImageKeys(
	podcastEpisodeId: string,
	position: number,
	styleVersion = GENERATED_CHAPTER_IMAGE_STYLE_VERSION,
): string[] {
	const styleVersionSuffix = toStyleVersionSuffix(styleVersion)
	const numberedKeys = Array.from(
		{ length: GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER - 1 },
		(_, i) => `episodes/${podcastEpisodeId}/video/chapter-${position}-image${styleVersionSuffix}-${i + 1}.jpg`,
	)
	return [toTopicVideoChapterImageKey(podcastEpisodeId, position, styleVersion), ...numberedKeys]
}

/**
 * Returns the object keys of every generated image that a film's chapters at the positions given may have, in each
 * style version from 1 through the one given, the current one unless given.
 */
export function toTopicVideoChapterImageKeysThroughStyle(
	podcastEpisodeId: string,
	positions: number[],
	lastStyleVersion = GENERATED_CHAPTER_IMAGE_STYLE_VERSION,
): string[] {
	const styleVersions = Array.from({ length: lastStyleVersion }, (_, i) => i + 1)
	return styleVersions.flatMap((styleVersion) =>
		positions.flatMap((position) => toTopicVideoChapterImageKeys(podcastEpisodeId, position, styleVersion)),
	)
}

// the part of a generated image's key that names its style version. version 1 has none
function toStyleVersionSuffix(styleVersion: number): string {
	return styleVersion === 1 ? "" : `-s${styleVersion}`
}

// a film row's object keys, any of them null until it is uploaded
type TopicVideoKeyColumns = {
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
 * not yet uploaded, and the keys of every generated image each chapter may have in every style, whether or not the
 * chapter has them.
 */
export function toTopicVideoKeys(topicVideo: TopicVideoKeyColumns): string[] {
	// the keys of the film's own image and of its original, if the film has an image
	const { podcastEpisodeId, imageHash, chapterCount } = topicVideo
	const imageKeys =
		podcastEpisodeId && imageHash
			? [
					toTopicVideoImageKey(podcastEpisodeId, imageHash),
					toTopicVideoImageLargeOriginalKey(podcastEpisodeId, imageHash),
				]
			: []

	// the parts, the film, the captions, and the image
	const { introKey, chaptersKey, signOffKey, filmKey, captionsKey } = topicVideo
	const storedKeys = toStoredObjectKeys(
		[introKey, chaptersKey, signOffKey, filmKey, captionsKey, ...imageKeys].map((objectKey) => ({ objectKey })),
	)

	// a podcast episode with no film row has no chapter images
	if (!podcastEpisodeId) {
		return storedKeys
	}
	// ponytail: lists every key a chapter may have in every style. store each chapter's count if a removal gets slow
	const positions = Array.from({ length: chapterCount }, (_, position) => position)
	const chapterImageKeys = toTopicVideoChapterImageKeysThroughStyle(podcastEpisodeId, positions)
	return [
		...storedKeys,
		...chapterImageKeys,
		...positions.map((position) => toTopicVideoScenePlanKey(podcastEpisodeId, position)),
		...(chapterCount > 0 ? Object.values(toTopicVideoAnimationKeys(podcastEpisodeId)) : []),
	]
}
