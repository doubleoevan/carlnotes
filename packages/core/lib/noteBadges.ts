import type { NoteBadge } from "@carlnotes/contracts/notes"

/**
 * Abbreviates a visible count while leaving its accessible explanation unabridged.
 */
export function toCountBadgeLabel(count: number): string {
	return count > 9 ? "9+" : String(count)
}

/**
 * Names unread edits and comments separately in the web's existing order.
 */
export function toUnreadLabels(unreadEdits: number, unreadComments: number): string[] {
	const labels: string[] = []
	if (unreadEdits > 0) {
		labels.push(unreadEdits === 1 ? "1 unread edit" : `${unreadEdits} unread edits`)
	}
	if (unreadComments > 0) {
		labels.push(unreadComments === 1 ? "1 unread comment" : `${unreadComments} unread comments`)
	}
	return labels
}

/**
 * Lists the same named note changes for hover, screen readers and native press explanations.
 */
export function toNoteBadgeDetails(badges: NoteBadge[]): string[] {
	return badges.map((badge) => `${badge.noteName} in ${badge.pageName}: ${toNoteChangeLabel(badge)}`)
}

/**
 * Names a note's edit and new comments in a page badge's explanation.
 */
export function toNoteChangeLabel(badge: Pick<NoteBadge, "unreadEdits" | "unreadComments">): string {
	const comments = badge.unreadComments === 1 ? "1 new comment" : `${badge.unreadComments} new comments`
	if (badge.unreadEdits === 0) {
		return comments
	}
	return badge.unreadComments === 0 ? "edited" : `edited, ${comments}`
}
