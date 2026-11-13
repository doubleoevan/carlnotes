// a Topic Post: long-form writing on a Topic by its owner or a member of a team that holds it, a draft until it is
// published. customer copy calls a Topic's section of them Open Mic
import { z } from "zod"
import { topicImageOrigins, visibilities } from "./enums"
import { NOTE_HTML_MAX_CHARS } from "./notes"
import { type PodcastEpisode, podcastEpisodeTranscriptTurn } from "./podcast"
import { profileIdentity } from "./profiles"
import { commentThreadResponse, reactionSummary } from "./social"
import { CONTROL_CHARACTER_PATTERN } from "./socialText"
import { toHtmlText } from "./text"
import { MINUTE_MS } from "./time"
import { imageRegenerationQuota, topicImageUrls } from "./topicImages"
import { topicCounts } from "./viewerCounts"

// the wait from a Topic Post's publish to its first discussion, which reads the text the author settled on in the
// first edits
export const TOPIC_POST_DISCUSSION_WAIT_MS = 15 * MINUTE_MS

// the title of the section that lists Topic Posts, on a Topic's page and on a profile's
export const OPEN_MIC_TITLE = "Open Mic"

// the longest title a Topic Post takes, and the fewest words a published one holds
export const TOPIC_POST_TITLE_MAX_CHARS = 120
export const TOPIC_POST_MIN_WORDS = 300

// the longest summary a model writes of a published Topic Post
export const TOPIC_POST_SUMMARY_MAX_CHARS = 400

// the widest the Topic Post page's reading column draws, in css pixels. a body image's column copy is twice it
export const TOPIC_POST_COLUMN_WIDTH = 960

// the languages a code block's menu offers, by the value its data-language stores. a block that stores none has its
// language guessed for coloring, and Plain text stores its own value
export const CODE_BLOCK_LANGUAGES = [
	{ value: "bash", label: "Bash" },
	{ value: "css", label: "CSS" },
	{ value: "go", label: "Go" },
	{ value: "html", label: "HTML" },
	{ value: "java", label: "Java" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "json", label: "JSON" },
	{ value: "markdown", label: "Markdown" },
	{ value: "python", label: "Python" },
	{ value: "rust", label: "Rust" },
	{ value: "sql", label: "SQL" },
	{ value: "typescript", label: "TypeScript" },
	{ value: "yaml", label: "YAML" },
] as const
export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number]["value"]

// the menu's labels for a code block whose language is guessed, and for one kept as plain text, with the value Plain
// text stores
export const AUTO_LANGUAGE_LABEL = "Auto"
export const PLAIN_TEXT_LABEL = "Plain text"
export const PLAIN_TEXT_LANGUAGE = "plaintext"

/**
 * Returns whether a value is a language a code block may store and color.
 */
export function isCodeBlockLanguage(value: string): value is CodeBlockLanguage {
	return CODE_BLOCK_LANGUAGES.some((language) => language.value === value)
}

/**
 * Returns whether a value is one a code block's data-language may store: a language, or Plain text.
 */
export function isStoredCodeBlockLanguage(value: string): boolean {
	return value === PLAIN_TEXT_LANGUAGE || isCodeBlockLanguage(value)
}

// the largest version a save names, the database's integer limit
const TOPIC_POST_VERSION_MAX = 2_147_483_647

/**
 * Counts the words of a text, which a Topic Post's 300 word minimum reads.
 */
export function toWordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length
}

// where one block of a body ends
const BODY_BLOCK_END_PATTERN = /<\/(?:p|h[1-6]|li|blockquote|codeblock)>/

/**
 * Returns a body's blocks as plain text, in order, with no empty one.
 */
export function toBodyParagraphs(html: string): string[] {
	return html.split(BODY_BLOCK_END_PATTERN).map(toHtmlText).filter(Boolean)
}

/**
 * Returns whether a title and a word count are enough to publish, which an edit of a published Topic Post keeps.
 */
export function isTopicPostComplete(title: string, wordCount: number): boolean {
	return title.trim().length > 0 && wordCount >= TOPIC_POST_MIN_WORDS
}

// one Topic Post as its card shows it: its Topic, its title, who wrote it, when it was published, its word count, its
// image, its summary, how many reactions it has, and its page's path. a draft has no published time and only its
// author reads it
export const topicPostCard = z.object({
	id: z.string(),
	topicId: z.string(),
	topicName: z.string(),
	title: z.string(),
	author: profileIdentity,
	publishedAt: z.string().nullable(),
	wordCount: z.number(),
	// null until the post's image is drawn
	image: topicImageUrls.nullable(),
	// the summary a model writes on publishing, null until it is written
	summary: z.string().nullable(),
	reactionCount: z.number(),
	path: z.string(),
})

export type TopicPostCard = z.infer<typeof topicPostCard>

// a Topic Post as a row of the admin's home rank dialog: its title and its Topic's name
const homeTopicPost = z.object({ id: z.string(), title: z.string(), topicName: z.string() })

// the Topic Posts an admin orders on the home: the pinned ones in their order, and the newest published ones of
// public topics, which a pin may name
export const homeTopicPostsResponse = z.object({
	pinnedTopicPosts: z.array(homeTopicPost),
	candidateTopicPosts: z.array(homeTopicPost),
})

export type HomeTopicPostsResponse = z.infer<typeof homeTopicPostsResponse>

// a Topic's Topic Posts: the caller's own drafts first, then the published ones newest first, and whether the caller
// may write one
export const topicPostsResponse = z.object({ topicPosts: z.array(topicPostCard), canPublish: z.boolean() })

export type TopicPostsResponse = z.infer<typeof topicPostsResponse>

// one Topic Post's page: its card, its body at a version, its reactions, and what the caller may do with it
export const topicPostResponse = topicPostCard.extend({
	html: z.string(),
	version: z.number(),
	// when its author last edited it after publishing
	editedAt: z.string().nullable(),
	// whether its Topic is public, which its share and its page's indexing read
	isTopicPublic: z.boolean(),
	// its Topic's visibility, which its share options read. absent from an api older than the field
	topicVisibility: z.enum(visibilities).optional(),
	// its Topic's image, which its info popup shows beside the Topic's name. null for a Topic with no image yet
	topicImage: topicImageUrls.nullable(),
	// its Topic's viewers and followers, as the Topic's own page counts them, which its info popup shows under the
	// Topic's name. absent from an api older than the field
	topicCounts: topicCounts.optional(),
	reactions: reactionSummary,
	// the first page of a published post's comment thread. absent on a write's response
	commentThread: commentThreadResponse.optional(),
	// whether the caller owns its Topic, wrote it, may delete it, and may publish on its Topic
	isTopicOwner: z.boolean(),
	isAuthor: z.boolean(),
	// the same as isAuthor
	isEditable: z.boolean(),
	canDelete: z.boolean(),
	canPublish: z.boolean(),
	// whether the caller may change its image, and for whoever may, their regenerations this month against the plan's
	// limit, null for an admin, whether the image was generated or uploaded, and the image prompt it was drawn from
	// the newest discussion of it that has audio, by its id, its length, and when it was recorded, and whether a newer
	// one is recording. null for a post with neither
	discussion: z
		.object({
			id: z.string().nullable(),
			durationSeconds: z.number().nullable(),
			publishedAt: z.string().nullable(),
			isRecording: z.boolean(),
			// that recording's script as a transcript reads it, each turn under its speaker's name. absent for a
			// discussion with no recording, and from an api older than the field
			transcript: z.array(podcastEpisodeTranscriptTurn).optional(),
		})
		.nullable(),
	// the caller's discussion regenerations this month against the plan's limit, for whoever may publish on its Topic.
	// null for anyone else
	discussionRegenerationQuota: imageRegenerationQuota.nullable(),
	canEditImage: z.boolean(),
	imageRegenerationQuota: imageRegenerationQuota.nullable(),
	imageOrigin: z.enum(topicImageOrigins).nullable(),
	imagePrompt: z.string().nullable(),
})

export type TopicPostResponse = z.infer<typeof topicPostResponse>

// the longest note a regenerate takes to steer a discussion's hosts
export const TOPIC_POST_DISCUSSION_HINT_MAX_CHARS = 500

// a regenerate of a Topic Post's discussion, with an optional note for the hosts
export const topicPostDiscussionRegeneratePayload = z.object({
	hint: z.string().trim().max(TOPIC_POST_DISCUSSION_HINT_MAX_CHARS).optional(),
})

// what a regenerate returns: the recording that is under way
export const topicPostDiscussionRegenerateResponse = z.object({ discussionId: z.string() })

// a save of a Topic Post's title and body at the version its editor opened at. a title with a control character is
// rejected
export const topicPostSavePayload = z.object({
	title: z
		.string()
		.trim()
		.max(TOPIC_POST_TITLE_MAX_CHARS)
		.refine((title) => !CONTROL_CHARACTER_PATTERN.test(title)),
	html: z.string().max(NOTE_HTML_MAX_CHARS),
	version: z.number().int().positive().max(TOPIC_POST_VERSION_MAX),
})

export type TopicPostSavePayload = z.infer<typeof topicPostSavePayload>

// what a save returns: the stored version
export const topicPostSaveResponse = z.object({ version: z.number() })

// what a save or a publish lost to a newer version returns: the stored version
export const topicPostConflictResponse = z.object({ error: z.string(), version: z.number().optional() })

// why a Topic Post write changed nothing: a newer version holds the post, it is short of a title or of its words, or
// the write failed, with Carl's words if the text was rejected
export type TopicPostWriteFailure =
	| { status: "conflict"; version: number | null }
	| { status: "incomplete" }
	| { status: "failed"; message: string | null }

// how a save ends for its editor, and how a draft's create or a publish ends
export type TopicPostSaveResult = { status: "saved"; version: number } | TopicPostWriteFailure
export type TopicPostWriteResult = { status: "saved"; topicPost: TopicPostResponse } | TopicPostWriteFailure

// what the two hosts' recorded talk about a Topic Post is called, never shortened
export const TOPIC_POST_DISCUSSION_TITLE = "Coffee Break Discussion"

// the id the podcast player holds a Topic Post's discussion under: this prefix, the post's id, and the recording's id
const DISCUSSION_PLAYER_ID_PREFIX = "topic-post-discussion:"

/**
 * Returns the id of the Topic Post whose discussion the podcast player holds under an id, or null for a podcast
 * episode's own id.
 */
export function toDiscussionTopicPostId(podcastEpisodeId: string): string | null {
	if (!podcastEpisodeId.startsWith(DISCUSSION_PLAYER_ID_PREFIX)) {
		return null
	}
	return podcastEpisodeId.slice(DISCUSSION_PLAYER_ID_PREFIX.length).split(":")[0] || null
}

/**
 * Returns the path of a Topic Post's discussion audio, which serves its newest recording.
 */
export function toTopicPostDiscussionAudioPath(topicPostId: string): string {
	return `/api/topic-posts/${encodeURIComponent(topicPostId)}/discussion/audio.mp3`
}

/**
 * Returns a Topic Post's discussion in the shape the podcast player plays: the post's title after the discussion's
 * name, the post's page and image, no chapters, and no saved progress. Null for a post with no recording to play.
 */
export function toTopicPostDiscussionPodcastEpisode(topicPost: TopicPostResponse): PodcastEpisode | null {
	if (!topicPost.discussion?.id) {
		return null
	}
	return {
		// the recording under the post's name, with no season and no number
		id: `${DISCUSSION_PLAYER_ID_PREFIX}${topicPost.id}:${topicPost.discussion.id}`,
		title: `${TOPIC_POST_DISCUSSION_TITLE} · ${topicPost.title}`,
		description: topicPost.summary,
		season: null,
		episodeNumber: null,
		durationSeconds: topicPost.discussion.durationSeconds,
		publishedAt: topicPost.publishedAt,
		// the post's page, its Topic, and its image as the cover
		pagePath: topicPost.path,
		topicId: topicPost.topicId,
		topicVisibility: topicPost.isTopicPublic ? "public" : "private",
		image: topicPost.image,
		coverUrl: topicPost.image?.list.url ?? null,
		smallCoverUrl: topicPost.image?.thumbnail.url ?? null,
		// one recording with no chapters, no saved progress, and no question to the hosts
		status: "published",
		audioUrl: toTopicPostDiscussionAudioPath(topicPost.id),
		chapterCount: 0,
		chapters: [],
		progressSeconds: 0,
		isCompleted: false,
		isVoiceChatConfigured: false,
	}
}
