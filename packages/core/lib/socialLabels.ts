import { WRITE_FAILED_TEXT } from "@carlnotes/client/clientWrite"
import { SOCIAL_EDIT_MS } from "@carlnotes/contracts/social"
import type { CommentChapter } from "./socialElements"

// the copy of reactions and comment threads, shared by the web, the mobile app, and the MCP view. customer copy
// calls a comment a hot take

// how long a comment can be edited, in minutes
const SOCIAL_EDIT_MINUTES = SOCIAL_EDIT_MS / 60_000

// the action that opens the report dialog, on a page, a Finding, and a comment
const REPORT_ISSUE_LABEL = "Report issue"

/**
 * Returns the label of a report flag: the report dialog's action, or removing the user's report.
 */
export function toReportLabel(isReported: boolean): string {
	return isReported ? "Remove report" : REPORT_ISSUE_LABEL
}

// the title of the card that holds a page's comment thread, and the thread's heading where it shows without the card
export const SOCIAL_SECTION_HEADING = "Hot takes 🔥"
export const COMMENT_THREAD_HEADING = "Hot takes"

// the label of the owner's switch that lets a topic's podcast episodes read its shared comments
export const PODCAST_COMMENTS_LABEL = "Hot takes for Carl and Vienna"

// how long a comment's body gets before it scrolls inside its own box
export const SCROLLING_COMMENT_CHARS = 1000

/**
 * Returns the label that counts the users a reaction type's list leaves out.
 */
export function toMoreReactionUsersLabel(moreUserCount: number): string {
	return `and ${moreUserCount} more`
}

// what a failed reaction says
export const REACTION_SAVE_ERROR = "That reaction didn't save. Carl suggests trying again."

// the flame toggle's tooltip
export const SHARE_WITH_PODCAST_LABEL = "Share with Carl and Vienna"
export const SHARED_WITH_PODCAST_LABEL = "Shared with Carl and Vienna"
export const UNSHARE_WITH_PODCAST_LABEL = "Don't share with Carl and Vienna"

/**
 * Returns the label of the toggle under a thread with loaded comments not shown yet.
 */
export function toMoreCommentsLabel(hiddenCommentCount: number): string {
	return hiddenCommentCount > 0 ? `+ ${hiddenCommentCount} more ` : COMMENT_THREAD_LABELS.more
}

/**
 * Returns why a share is disabled once the Topic's shared comment slots are full.
 */
export function toSharedCommentSlotsFullLabel(slotCount: number): string {
	return `The next podcast episode already has ${slotCount} hot takes`
}

// the tooltip of the shared count on the card
export const SHARED_COMMENT_SLOTS_TOOLTIP = "Carl and Vienna like to tackle hot takes in the podcast"

/**
 * Returns the count beside the card's heading: how many comments and replies the last seven days added.
 */
export function toWeekCommentsLabel(weekCommentCount: number): string {
	return `${weekCommentCount} this week`
}

/**
 * Returns the count a Topic's editors read on the card: how many comments are shared out of how many may be.
 */
export function toSharedCommentSlotsLabel({ usedCount, slotCount }: { usedCount: number; slotCount: number }): string {
	return `${usedCount} of ${slotCount} for Carl and Vienna`
}

/**
 * Returns the title of the Topic's sources list group that holds the comments shared with the podcast.
 */
export function toSharedCommentsSectionTitle(sharedCommentCount: number): string {
	return `Hot takes · ${sharedCommentCount}`
}

/**
 * Returns the label of the control that loads a comment's later replies.
 */
export function toMoreRepliesLabel(moreReplyCount: number): string {
	return moreReplyCount === 1 ? "Show 1 more reply" : `Show ${moreReplyCount} more replies`
}

// a comment thread's words
export const COMMENT_THREAD_LABELS = {
	compose: "Add a hot take",
	composeButton: "Hot Take",
	editOwn: "Edit your hot take",
	reply: "Reply",
	placeholder: "What's your hot take? @ mentions someone.",
	replyPlaceholder: "Write a reply. @ mentions someone.",
	post: "Post",
	mentionSuggestions: "Mention suggestions",
	more: "Show more",
	retry: "Try again",
	edit: "Edit",
	delete: "Delete",
	chapter: "Chapter",
	noChapter: "The whole podcast episode",
	loadError: "Carl couldn't load the hot takes.",
	postError: "That hot take didn't post. Carl suggests trying again.",
	lockedError: "That hot take can't be changed anymore.",
	editLocked: `Hot takes can only be edited for ${SOCIAL_EDIT_MINUTES} minutes after posting.`,
	deleteError: "Carl couldn't remove that hot take. Try again in a moment.",
	shareError: WRITE_FAILED_TEXT,
} as const

// the select option's value for no chapter
const NO_CHAPTER_VALUE = "any"

/**
 * Returns how a chapter reads on its tag and in the composer's choice of a chapter.
 */
export function toChapterLabel({ position, title }: CommentChapter): string {
	return `Ch ${position + 1} · ${title}`
}

/**
 * Returns the options of the composer's choice of a chapter, with the whole podcast episode first.
 */
export function toChapterOptions(chapters: CommentChapter[]): { value: string; label: string }[] {
	return [
		{ value: NO_CHAPTER_VALUE, label: COMMENT_THREAD_LABELS.noChapter },
		...chapters.map((chapter) => ({ value: String(chapter.position), label: toChapterLabel(chapter) })),
	]
}

/**
 * Returns the select value of a chapter position, or of no chapter.
 */
export function toChapterValue(chapterPosition: number | null): string {
	return chapterPosition === null ? NO_CHAPTER_VALUE : String(chapterPosition)
}

/**
 * Returns the chapter position a select value names, or null for the whole podcast episode.
 */
export function toChapterPosition(chapterValue: string): number | null {
	return chapterValue === NO_CHAPTER_VALUE ? null : Number(chapterValue)
}

// who Carl's own comment is by, shown where a comment has no author
export const CARL_AUTHOR_LABEL = "Carl"

/**
 * Returns the label of a reported comment for the report dialog, naming its author.
 */
export function toReportedCommentLabel(username: string): string {
	return `a hot take by ${username}`
}
