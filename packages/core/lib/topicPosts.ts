// a Topic Post's copy and the values both apps read from it: the editor's labels, the word count, the date line, and
// what its share options share
import type { Visibility } from "@carlnotes/contracts/enums"
import { isModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { READING_WORDS_PER_MINUTE, toCountLabel, toDotSeparatedText, toHtmlText } from "@carlnotes/contracts/text"
import { toTopicPostBodyImageIds } from "@carlnotes/contracts/topicPostBodyImages"
import {
	TOPIC_POST_MIN_WORDS,
	type TopicPostCard,
	type TopicPostResponse,
	type TopicPostWriteFailure,
	toWordCount,
} from "@carlnotes/contracts/topicPosts"
import type { EditableImage } from "../components/TopicImageEditor"
import { toCountDetails } from "./detailsLine"
import { IMAGE_UPLOAD_FAILED_TEXT, UNREADABLE_IMAGE_TEXT, UNSUPPORTED_IMAGE_TYPE_TEXT } from "./imageUpload"

// what the editor, the page, and the section say
export const TOPIC_POST_LABELS = {
	newPost: "Post",
	draft: "Draft",
	untitled: "Untitled post",
	empty: "No one stepped up to the mic yet.",
	writtenBy: "Written by",
	edited: "edited",
	titleLabel: "Post title",
	titlePlaceholder: "Title",
	bodyPlaceholder: "The mic is yours…",
	publish: "Publish",
	publishing: "Publishing…",
	done: "Done",
	edit: "Edit post",
	delete: "Delete post",
	missing: "Carl couldn't find this post. He checked under the mic stand.",
	info: "About this post",
	infoUnavailable: "Carl couldn't open this post's note.",
	topic: "Topic",
	share: "Share",
	shareTitle: "Share post",
	notes: "Carl's Notes",
	noNotes: "No notes yet.",
	loading: "Warming up the mic…",
	loadError: "Carl couldn't open that post. Try again in a moment.",
	createError: "Carl couldn't start that post. Try again in a moment.",
	saveError: "That post didn't save. Carl kept your words — try again in a moment.",
	publishError: "That post didn't publish. Carl kept your draft — try again in a moment.",
	incompleteError: `A post needs a title and ${TOPIC_POST_MIN_WORDS} words before it goes out.`,
	deleteError: "Carl couldn't toss that post. Try again in a moment.",
	conflict: "This post changed in another tab or on another device. Try again in a moment.",
	addImage: "Add image",
	imageUploading: "Uploading image…",
	imageAlt: "Alt text",
	imageAltPlaceholder: "Describe the image",
	codeBlockLanguage: "Code language",
}

// what a rejected body image upload shows, by the api's rejection
const TOPIC_POST_BODY_IMAGE_REJECTIONS: Record<string, string> = {
	"too-large": "That image is over your plan's size limit.",
	"unsupported-type": UNSUPPORTED_IMAGE_TYPE_TEXT,
	unreadable: UNREADABLE_IMAGE_TEXT,
	"image-limit-reached": "This post holds as many images as your plan allows.",
	"moderation-unavailable": "Carl couldn't check that image just now. Try again in a moment.",
	"rate limited": "That's a lot of images at once. Give it a minute.",
}

/**
 * Returns what a rejected body image upload shows: the rule it broke, Carl's rejection of an image others may not see,
 * or the fallback text.
 */
export function toTopicPostBodyImageRejectionText(rejection: string): string {
	return (
		TOPIC_POST_BODY_IMAGE_REJECTIONS[rejection] ??
		(isModerationRejectionMessage(rejection) ? rejection : IMAGE_UPLOAD_FAILED_TEXT)
	)
}

// both apps confirm a delete of the post and its thread
export const TOPIC_POST_DELETE = { title: "Delete this post?", confirmLabel: "Delete post", cancelLabel: "Keep it" }

/**
 * Names the Topic Post and the thread that a delete permanently removes.
 */
export function toTopicPostDeleteDescription(title: string): string {
	return `"${title || "This draft"}" and its hot takes go in the compost. Carl can't fish them back out.`
}

/**
 * Words why a Topic Post write changed nothing, with the fallback a failure with no words of its own gets.
 */
export function toTopicPostFailureMessage(topicPostWriteFailure: TopicPostWriteFailure, fallback: string): string {
	switch (topicPostWriteFailure.status) {
		// a newer version
		case "conflict":
			return TOPIC_POST_LABELS.conflict

		// a post short of a title or of words, and any other failure by its own words
		case "incomplete":
			return TOPIC_POST_LABELS.incompleteError
		case "failed":
			return topicPostWriteFailure.message ?? fallback
	}
}

/**
 * Returns a Topic Post's title, or the line a draft with no title yet shows.
 */
export function toTopicPostTitle({ title }: Pick<TopicPostCard, "title">): string {
	return title || TOPIC_POST_LABELS.untitled
}

/**
 * Counts the words of a body's readable text, as the server counts them at a save.
 */
export function toTopicPostWordCount(html: string): number {
	return toWordCount(toHtmlText(html))
}

/**
 * Labels a body's word count: against the minimum until the body reaches it, and alone after.
 */
export function toTopicPostWordCountLabel(wordCount: number): string {
	return wordCount < TOPIC_POST_MIN_WORDS
		? `${wordCount} of ${TOPIC_POST_MIN_WORDS} words`
		: toCountLabel(wordCount, "word")
}

// when a Topic Post was published, in the local time zone, such as Nov 10, 2026. a draft reads Draft
function toTopicPostDateLabel({ publishedAt }: Pick<TopicPostCard, "publishedAt">): string {
	return publishedAt
		? new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
		: TOPIC_POST_LABELS.draft
}

// how long a Topic Post takes to read, such as "3 min read". the label is at least one minute
function toTopicPostReadingTimeLabel(wordCount: number): string {
	return `${Math.max(1, Math.round(wordCount / READING_WORDS_PER_MINUTE))} min read`
}

// what a Topic Post's details read: when it was published, its length, and when its author edited it
type TopicPostDetailsFields = Pick<TopicPostCard, "publishedAt" | "wordCount"> & { editedAt?: string | null }

/**
 * Returns a Topic Post's details in order, for the details line under its page's byline: when it was published, how
 * long a published post takes to read, how many comments and replies its thread holds if a count above zero is
 * given, and that its author edited it since.
 */
export function toTopicPostDetails(topicPost: TopicPostDetailsFields, commentCount?: number | null): string[] {
	return [
		toTopicPostDateLabel(topicPost),
		...(topicPost.publishedAt ? [toTopicPostReadingTimeLabel(topicPost.wordCount)] : []),
		...toCountDetails([{ count: commentCount, noun: "hot take" }]),
		...(topicPost.editedAt ? [TOPIC_POST_LABELS.edited] : []),
	]
}

/**
 * Returns a Topic Post's details as its card's one line, joined by middle dots.
 */
export function toTopicPostDetailsText(topicPost: TopicPostDetailsFields): string {
	return toDotSeparatedText(toTopicPostDetails(topicPost))
}

/**
 * Whether a Topic Post shows its editor: a draft always does, and a published post does while its author is editing
 * it.
 */
export function isTopicPostEditorShown(
	topicPost: Pick<TopicPostCard, "publishedAt"> & { isAuthor: boolean },
	isEditing: boolean,
): boolean {
	return !topicPost.publishedAt || (isEditing && topicPost.isAuthor)
}

/**
 * Whether a Topic Post takes a pin: a published one of a public topic. Its author pins it to their own profile from
 * its page, and an admin pins it to the home.
 */
export function isTopicPostPinnable(topicPost: Pick<TopicPostResponse, "publishedAt" | "isTopicPublic">): boolean {
	return Boolean(topicPost.publishedAt) && topicPost.isTopicPublic
}

// the Topic Post a topic's share options share in the topic's place: its page, its card, and an invite that opens it
export type SharedTopicPost = { id: string; title: string; path: string }

// the topic and the Topic Post of it that a post's share options take
export type TopicPostShare = {
	topic: { id: string; name: string; visibility: Visibility; isTopicOwner: boolean }
	topicPost: SharedTopicPost
}

/**
 * Returns what a published Topic Post's share options take: its topic, as the topic's own share options read it, and
 * the post they share in the topic's place.
 */
export function toTopicPostShare(topicPost: TopicPostResponse): TopicPostShare {
	// an api older than the visibility field tells only public from not, which shares a post as a private topic's
	const visibility = topicPost.topicVisibility ?? (topicPost.isTopicPublic ? "public" : "private")
	return {
		topic: { id: topicPost.topicId, name: topicPost.topicName, visibility, isTopicOwner: topicPost.isTopicOwner },
		topicPost: { id: topicPost.id, title: toTopicPostTitle(topicPost), path: topicPost.path },
	}
}

/**
 * Returns a Topic Post's image as the image block edits it, from its page.
 */
export function toTopicPostEditableImage(topicPost: TopicPostResponse): EditableImage {
	return {
		kind: "topicPost",
		id: topicPost.id,
		name: toTopicPostTitle(topicPost),
		image: topicPost.image,
		imageOrigin: topicPost.imageOrigin,
		imagePrompt: topicPost.imagePrompt,
		imageRegenerationQuota: topicPost.imageRegenerationQuota,
	}
}

/**
 * Returns what a report of a Topic Post's image names: the post, read as the image of its title.
 */
export function toTopicPostImageReport(topicPost: Pick<TopicPostResponse, "id" | "title">): {
	subjectKind: "topicPostImage"
	subjectId: string
	subjectLabel: string
} {
	return { subjectKind: "topicPostImage", subjectId: topicPost.id, subjectLabel: `the image of ${topicPost.title}` }
}

// what a report of one body image names, and the label of the actions menu option that opens it on the phone
export type TopicPostBodyImageReport = {
	imageId: string
	subjectKind: "topicPostBodyImage"
	subjectId: string
	subjectLabel: string
	optionLabel: string
}

/**
 * Returns what a report of each body image in a published Topic Post names, in body order: the image as
 * `<topicPostId>/<imageId>`, read as its place in the post. A visitor, the post's author, and a draft have none.
 */
export function toTopicPostBodyImageReports(
	topicPost: Pick<TopicPostResponse, "id" | "title" | "html" | "publishedAt" | "isAuthor">,
	isSignedIn: boolean,
): TopicPostBodyImageReport[] {
	if (!isSignedIn || !topicPost.publishedAt || topicPost.isAuthor) {
		return []
	}
	return toTopicPostBodyImageIds(topicPost.html, topicPost.id).map((imageId, i) => ({
		imageId,
		subjectKind: "topicPostBodyImage",
		subjectId: `${topicPost.id}/${imageId}`,
		subjectLabel: `image ${i + 1} of ${toTopicPostTitle(topicPost)}`,
		optionLabel: `Report image ${i + 1} in post`,
	}))
}

// the page's url path, the post id the url names, and the post that loaded
type IsTopicPostUrlStaleOptions = {
	pathname: string
	topicPostId: string
	topicPost: Pick<TopicPostResponse, "id" | "path">
}

/**
 * Returns whether a Topic Post page's url should move to the post's current path, whose slug follows its title: the
 * url still names this post, the post it names has loaded, and its path differs. A url that already left for another
 * page is never stale, so a navigation away is not undone while the next page loads.
 */
export function isTopicPostUrlStale({ pathname, topicPostId, topicPost }: IsTopicPostUrlStaleOptions): boolean {
	const isPostUrl = pathname.includes(`/posts/${topicPostId}`)
	return isPostUrl && topicPost.id === topicPostId && topicPost.path !== pathname
}

// a Topic Post's title, its page's path, its summary, and the site origin its link starts with
type TopicPostNotesMarkdownOptions = { title: string; path: string; summary: string | null; origin?: string }

/**
 * Returns a Topic Post's summary as Markdown for an AI: the post's title linked to its page, then the summary once
 * it is written.
 */
export function toTopicPostNotesMarkdown({ title, path, summary, origin = "" }: TopicPostNotesMarkdownOptions): string {
	return [`# [${title}](${origin}${path})`, summary].filter(Boolean).join("\n\n")
}
