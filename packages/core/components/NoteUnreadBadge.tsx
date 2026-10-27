import type { ComponentType, PropsWithChildren } from "react"
import { toCountBadgeLabel, toUnreadLabels } from "../lib/noteBadges"

export type NoteUnreadBadgeProps = {
	unreadEdits: number
	unreadComments: number
	details?: string[]
	isOutline?: boolean
}
export type NoteUnreadBadgeElements = {
	Container: ComponentType<PropsWithChildren<{ label: string; details: string[]; isOutline: boolean }>>
	Count: ComponentType<PropsWithChildren<{ isOutline: boolean }>>
}

/**
 * Shares visibility, actual-count explanations and compact count content across both clients.
 */
export function NoteUnreadBadge({
	unreadEdits,
	unreadComments,
	details,
	isOutline = false,
	elements: { Container, Count },
}: NoteUnreadBadgeProps & { elements: NoteUnreadBadgeElements }) {
	const total = unreadEdits + unreadComments
	if (total <= 0) {
		return null
	}
	const labels = toUnreadLabels(unreadEdits, unreadComments)
	return (
		<Container label={labels.join(", ")} details={details ?? labels} isOutline={isOutline}>
			<Count isOutline={isOutline}>{toCountBadgeLabel(total)}</Count>
		</Container>
	)
}
