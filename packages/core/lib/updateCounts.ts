// the update count: one number summing unread chat mentions, unseen Comment Mentions, note changes, topic invitations,
// and an admin's open reports, the labels a screen reader hears, and the groups a tooltip or a long-press sheet lists
// in that order
import type { ChatMention } from "@carlnotes/contracts/chat"
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import { type NoteBadge, toNoteCount } from "@carlnotes/contracts/notes"
import { toCountLabel, toCountNoun } from "@carlnotes/contracts/text"
import { toNoteChangeLabel } from "./noteBadges"
import { CARL_NAME } from "./socialLabels"

// how many lines a group lists before folding the rest into a count
const LISTED_UPDATE_LINE_COUNT = 4

// a run of text in an update line, keyed by where it starts. a label names a user, topic, team, or note and draws bold
type UpdateLinePart = { key: string; text: string; isLabel: boolean }
// one line of a group, keyed by the thing it names
export type UpdateLine = { key: string; parts: UpdateLinePart[] }
// one waiting group: its heading and its lines
export type UpdateSection = { heading: string; lines: UpdateLine[] }

// the groups a badge sums. only an admin has open reports, and a badge with no thread counts no Comment Mention
export type UpdateBadges = {
	chatMentions: ChatMention[]
	commentMentions?: UnseenCommentMention[]
	noteBadges: NoteBadge[]
	invites: TopicInviteBadge[]
	openReportCount?: number
}

/**
 * Sums the chat mentions, the Comment Mentions, the note changes, the topic invitations, and the open reports into
 * the badge's one count.
 */
export function toUpdateCount({
	chatMentions,
	commentMentions = [],
	noteBadges,
	invites,
	openReportCount = 0,
}: UpdateBadges): number {
	return chatMentions.length + commentMentions.length + toNoteCount(noteBadges) + invites.length + openReportCount
}

/**
 * Labels a Comment Mention badge.
 */
export function toCommentMentionLabel(commentMentionCount: number): string {
	return commentMentionCount === 1 ? "1 hot take mention" : `${commentMentionCount} hot take mentions`
}

/**
 * Labels a topic invitation badge.
 */
export function toTopicInviteLabel(inviteCount: number): string {
	return inviteCount === 1 ? "1 topic invite" : `${inviteCount} topic invites`
}

/**
 * Labels a summed badge with each waiting group's own heading, in the order the groups are listed.
 */
export function toUpdateLabel(updateBadges: UpdateBadges): string {
	return toUpdateSections(updateBadges)
		.map((section) => section.heading)
		.join(", ")
}

/**
 * Returns what a screen reader hears on a badge: the shown count, then each waiting group's own label.
 */
export function toUpdateAccessibleLabel(updateBadges: UpdateBadges): string {
	return ` ${toCountNoun(toUpdateCount(updateBadges), "update")}, ${toUpdateLabel(updateBadges)}`
}

/**
 * Returns a menu trigger's accessible name: its own name, then each waiting group's label.
 */
export function toMenuTriggerLabel(name: string, updateBadges: UpdateBadges): string {
	return [name, toUpdateLabel(updateBadges)].filter(Boolean).join(", ")
}

/**
 * Lists the waiting groups under their own headings, chats, then Comment Mentions, then notes, then invitations, then
 * open reports, skipping an empty group. Open reports are a heading with no lines.
 */
export function toUpdateSections({
	chatMentions,
	commentMentions = [],
	noteBadges,
	invites,
	openReportCount = 0,
}: UpdateBadges): UpdateSection[] {
	const sections = [
		chatMentions.length > 0 && { heading: toChatLabel(chatMentions), lines: toChatMentionLines(chatMentions) },
		commentMentions.length > 0 && {
			heading: toCommentMentionLabel(commentMentions.length),
			lines: toCommentMentionLines(commentMentions),
		},
		noteBadges.length > 0 && { heading: toNoteLabel(toNoteCount(noteBadges)), lines: toNoteLines(noteBadges) },
		invites.length > 0 && { heading: toTopicInviteLabel(invites.length), lines: toTopicInviteLines(invites) },
		openReportCount > 0 && { heading: toCountLabel(openReportCount, "open report"), lines: [] },
	]
	return sections.filter((section) => section !== false)
}

/**
 * Splits a group's lines into the first listed ones and the label counting the rest, or null if every line is listed.
 */
export function toListedLines<Line>(
	lines: Line[],
	listedLineCount = LISTED_UPDATE_LINE_COUNT,
): { listedLines: Line[]; moreLinesLabel: string | null } {
	const hiddenLineCount = lines.length - listedLineCount
	return {
		listedLines: lines.slice(0, listedLineCount),
		moreLinesLabel: hiddenLineCount > 0 ? `and ${hiddenLineCount} more` : null,
	}
}

/**
 * Lists the topic invitations as lines, who invited the user to subscribe to what.
 */
export function toTopicInviteLines(topicInviteBadges: TopicInviteBadge[]): UpdateLine[] {
	return topicInviteBadges.map((topicInviteBadge) =>
		toUpdateLine(topicInviteBadge.inviteId, [
			toLabelPart(topicInviteBadge.inviterUsername),
			toTextPart(" invited you to subscribe to "),
			toLabelPart(topicInviteBadge.topicName),
		]),
	)
}

// the Comment Mention lines: who mentioned the user, on which page, and the Comment's first line
function toCommentMentionLines(commentMentions: UnseenCommentMention[]): UpdateLine[] {
	return commentMentions.map((commentMention) =>
		toUpdateLine(commentMention.commentId, [
			toLabelPart(commentMention.author?.username ?? CARL_NAME),
			toTextPart(" mentioned you on "),
			toLabelPart(commentMention.page.name),
			toTextPart(`: ${commentMention.text}`),
		]),
	)
}

// the chat mention lines: who wrote each chat mention and how it starts
function toChatMentionLines(chatMentions: ChatMention[]): UpdateLine[] {
	return chatMentions.map((chatMention) =>
		toUpdateLine(`${chatMention.teamId}-${chatMention.chatMessageId}`, [
			toLabelPart(chatMention.authorUsername),
			toTextPart(chatMention.isReply ? " replied to you: " : " mentioned you: "),
			toTextPart(chatMention.excerpt),
		]),
	)
}

// the note lines: each note, the page holding it, and what changed
function toNoteLines(noteBadges: NoteBadge[]): UpdateLine[] {
	return noteBadges.map((noteBadge) =>
		toUpdateLine(noteBadge.noteId, [
			toLabelPart(noteBadge.noteName),
			toTextPart(" in "),
			toLabelPart(noteBadge.pageName),
			toTextPart(`: ${toNoteChangeLabel(noteBadge)}`),
		]),
	)
}

// the chat and note groups' headings
function toChatLabel(chatMentions: ChatMention[]): string {
	return chatMentions.length === 1 ? "1 chat for you" : `${chatMentions.length} chats for you`
}
function toNoteLabel(noteCount: number): string {
	return noteCount === 1 ? "1 unread note change" : `${noteCount} unread note changes`
}

// a line from its parts, each part keyed by where it starts in the line, which tells apart two labels with one text
function toUpdateLine(key: string, parts: Omit<UpdateLinePart, "key">[]): UpdateLine {
	let offset = 0
	const keyedParts = parts.map((part) => {
		const keyedPart = { ...part, key: `${key}-${offset}` }
		offset += part.text.length
		return keyedPart
	})

	// the line under the key the badge lists it by
	return { key, parts: keyedParts }
}

// a named thing in a line, and the plain text around it
function toLabelPart(text: string): Omit<UpdateLinePart, "key"> {
	return { text, isLabel: true }
}
function toTextPart(text: string): Omit<UpdateLinePart, "key"> {
	return { text, isLabel: false }
}
