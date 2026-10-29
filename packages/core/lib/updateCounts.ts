// the update count: one number summing unread chat mentions, note changes, and topic invitations, the labels a
// screen reader hears, and the groups a tooltip or a long-press sheet lists, chats, then notes, then invitations
import type { ChatMention } from "@carlnotes/contracts/chat"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import type { NoteBadge } from "@carlnotes/contracts/notes"
import { toCountNoun } from "./labels"
import { toNoteChangeLabel } from "./noteBadges"

// how many lines a group lists before folding the rest into a count
export const LISTED_UPDATE_LINE_COUNT = 4

// a run of text in an update line, keyed by where it starts. a label names a user, topic, team, or note and draws bold
export type UpdateLinePart = { key: string; text: string; isLabel: boolean }
// one line of a group, keyed by the thing it names
export type UpdateLine = { key: string; parts: UpdateLinePart[] }
// one waiting group: its heading and its lines
export type UpdateSection = { heading: string; lines: UpdateLine[] }

// the three groups a badge sums
export type UpdateBadges = {
	chatMentions: ChatMention[]
	noteBadges: NoteBadge[]
	invites: TopicInviteBadge[]
}

/**
 * Sums the chat mentions, the note changes, and the topic invitations into the badge's one count.
 */
export function toUpdateCount({ chatMentions, noteBadges, invites }: UpdateBadges): number {
	return chatMentions.length + toNoteCount(noteBadges) + invites.length
}

/**
 * Labels a topic invitation badge.
 */
export function toTopicInviteLabel(inviteCount: number): string {
	return inviteCount === 1 ? "1 topic invitation" : `${inviteCount} topic invitations`
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
 * Lists the waiting groups under their own headings, chats, then notes, then invitations, skipping an empty group.
 */
export function toUpdateSections({ chatMentions, noteBadges, invites }: UpdateBadges): UpdateSection[] {
	const sections = [
		chatMentions.length > 0 && { heading: toChatLabel(chatMentions), lines: toChatMentionLines(chatMentions) },
		noteBadges.length > 0 && { heading: toNoteLabel(toNoteCount(noteBadges)), lines: toNoteLines(noteBadges) },
		invites.length > 0 && { heading: toTopicInviteLabel(invites.length), lines: toTopicInviteLines(invites) },
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

// the two numbers of every note in the set, summed
function toNoteCount(noteBadges: NoteBadge[]): number {
	return noteBadges.reduce((total, noteBadge) => total + noteBadge.unreadEdits + noteBadge.unreadComments, 0)
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
