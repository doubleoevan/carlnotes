// A retry reads the images the episode owns, independently of today's generation limit.
import { getAttachmentBytes, listStoredObjectKeys } from "@carlnotes/db/store"
import { GENERATED_CHAPTER_IMAGE_STYLE_VERSION, toTopicVideoChapterImageKeys } from "@carlnotes/db/topicVideoKeys"

/** Loads the stored images in chapter and image-number order. A missing listed object fails the retry. */
export async function loadStoredChapterImages(
	episode: string,
	positions: number[],
	priorVersion?: number,
): Promise<Map<number, Uint8Array[]>> {
	const stored = new Set(await listStoredObjectKeys(`episodes/${episode}/video/chapter-`))
	const result = new Map<number, Uint8Array[]>()
	for (const position of positions) {
		// A selected upgrade must preserve the style of its published film. Later retries can reuse either style.
		const style = priorVersion && priorVersion < 3 ? 1 : GENERATED_CHAPTER_IMAGE_STYLE_VERSION
		let keys = toTopicVideoChapterImageKeys(episode, position, style).filter((key) => stored.has(key))
		if (!keys.length && (!priorVersion || priorVersion === 4)) {
			keys = toTopicVideoChapterImageKeys(episode, position, 1).filter((key) => stored.has(key))
		}
		const images: Uint8Array[] = []
		for (const key of keys) {
			images.push(await getAttachmentBytes(key))
		}
		result.set(position, images)
	}
	return result
}
