// a Topic Post's body images: the files each one keeps, the paths that serve them, the sizes a body may name, and what
// an upload returns
import { z } from "zod"

// the files of one body image: the copy readers load, sized for the reading column. the path names the file, so a later
// size adds a file without changing a saved body
export const TOPIC_POST_BODY_IMAGE_FILES = ["column.webp"] as const
export type TopicPostBodyImageFile = (typeof TOPIC_POST_BODY_IMAGE_FILES)[number]

// the file a body names and readers load
const TOPIC_POST_BODY_IMAGE_COLUMN_FILE: TopicPostBodyImageFile = "column.webp"

// the widest and tallest an img in a body may say it is, in css pixels
export const TOPIC_POST_BODY_IMAGE_MAX_SIDE = 4096

// the longest alt text an img in a body keeps
export const TOPIC_POST_BODY_IMAGE_ALT_MAX_CHARS = 200

// where an img in a body sits, as its data-align says: at the left or the right with the text beside it, or centered.
// an img with none sits on its own line at the left
const TOPIC_POST_ALIGNS = ["left", "center", "right"] as const
export type TopicPostAlign = (typeof TOPIC_POST_ALIGNS)[number]

/**
 * Returns whether a value is one of the alignments a body image may take.
 */
export function isTopicPostAlign(value: unknown): value is TopicPostAlign {
	return TOPIC_POST_ALIGNS.includes(value as TopicPostAlign)
}

// the folder every body image path sits after
export const TOPIC_POST_BODY_IMAGES_PATH = "/api/topic-post-body-images"

// a uuid, as every Topic Post and body image id is
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

// one body image file's path, whole
const TOPIC_POST_BODY_IMAGE_PATH_PATTERN = new RegExp(
	`^${TOPIC_POST_BODY_IMAGES_PATH}/(${UUID_PATTERN})/(${UUID_PATTERN})/(column\\.webp)$`,
)

// one body image file a path names
export type TopicPostBodyImagePath = { topicPostId: string; imageId: string; file: TopicPostBodyImageFile }

/**
 * Returns the path of one file of a Topic Post's body image, the column copy if no file is named.
 */
export function toTopicPostBodyImagePath({
	topicPostId,
	imageId,
	file = TOPIC_POST_BODY_IMAGE_COLUMN_FILE,
}: Omit<TopicPostBodyImagePath, "file"> & { file?: TopicPostBodyImageFile }): string {
	return `${TOPIC_POST_BODY_IMAGES_PATH}/${topicPostId}/${imageId}/${file}`
}

/**
 * Returns the post, the image, and the file a path names, or null for a path that is not exactly one body image file.
 */
export function fromTopicPostBodyImagePath(pathname: string): TopicPostBodyImagePath | null {
	const match = TOPIC_POST_BODY_IMAGE_PATH_PATTERN.exec(pathname)
	if (!match?.[1] || !match[2] || !match[3]) {
		return null
	}
	return { topicPostId: match[1], imageId: match[2], file: match[3] as TopicPostBodyImageFile }
}

// an img's src in a body's html, quoted as the sanitizer writes it, between the markup before and after it
export const IMG_SRC_ATTRIBUTE_PATTERN = /(<img\b[^>]*?\bsrc=")([^"]*)(")/g

/**
 * Returns the ids of the body images a Topic Post's html names, in order, each once, reading each src's path with any
 * query or site origin dropped.
 */
export function toTopicPostBodyImageIds(html: string, topicPostId: string): string[] {
	const imageIds = new Set<string>()
	for (const [, , src = ""] of html.matchAll(IMG_SRC_ATTRIBUTE_PATTERN)) {
		// only the src's path names the image, so a signature's query and a site origin are dropped. a src that is no
		// url names none
		const srcUrl = URL.parse(src, "http://localhost")
		const bodyImagePath = srcUrl ? fromTopicPostBodyImagePath(srcUrl.pathname) : null
		if (bodyImagePath?.topicPostId === topicPostId) {
			imageIds.add(bodyImagePath.imageId)
		}
	}
	return [...imageIds]
}

// what an upload returns: the url the editor inserts, signed if the post is not public, and its css size
export const topicPostBodyImageUploadResponse = z.object({
	url: z.string(),
	width: z.number().int(),
	height: z.number().int(),
})

export type TopicPostBodyImageUploadResponse = z.infer<typeof topicPostBodyImageUploadResponse>
