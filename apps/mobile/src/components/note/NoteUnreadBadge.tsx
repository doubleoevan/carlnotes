import {
	type NoteUnreadBadgeElements,
	type NoteUnreadBadgeProps,
	NoteUnreadBadge as SharedNoteUnreadBadge,
} from "@carlnotes/core/components/NoteUnreadBadge"
import { toNoteBadgeDetails } from "@carlnotes/core/lib/noteBadges"
import { useNoteBadge, usePageNoteBadges } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Alert, Pressable } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

// expose hover-only web details through both a tap and a long press
const ELEMENTS: NoteUnreadBadgeElements = {
	Container: ({ children, label, details }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={toTouchTargetHitSlop(24)}
			className="min-h-6 min-w-6 items-center justify-center"
			onPress={() => Alert.alert("Tasting Notes", details.join("\n"))}
			onLongPress={() => Alert.alert("Tasting Notes", details.join("\n"))}
		>
			{children}
		</Pressable>
	),
	Count: ({ children, isOutline }) => (
		<Text
			className={cn(
				"min-w-4 rounded-full px-1 text-center text-[10px] font-semibold",
				isOutline ? "border border-primary text-link" : "bg-primary text-primary-foreground",
			)}
		>
			{children}
		</Text>
	),
}

/**
 * Shows the shared count and complete edit/comment explanation using native controls.
 */
export function NoteUnreadBadge(props: NoteUnreadBadgeProps) {
	return <SharedNoteUnreadBadge {...props} elements={ELEMENTS} />
}

/**
 * Reads one note's unread edit and comment count.
 */
export function NoteRowBadge({ noteId }: { noteId: string }) {
	return <NoteUnreadBadge {...useNoteBadge(noteId)} />
}

/**
 * Combines the current Topic's note changes while retaining every named note in the explanation.
 */
export function PageNoteBadge({
	page,
	isOutline = false,
}: {
	page: { pageType: "topic" | "team"; pageId: string }
	isOutline?: boolean
}) {
	const badges = usePageNoteBadges(
		page.pageType === "topic" ? page.pageId : null,
		page.pageType === "team" ? page.pageId : undefined,
	)
	const counts = badges.reduce(
		(sum, badge) => ({
			unreadEdits: sum.unreadEdits + badge.unreadEdits,
			unreadComments: sum.unreadComments + badge.unreadComments,
		}),
		{ unreadEdits: 0, unreadComments: 0 },
	)
	return <NoteUnreadBadge {...counts} details={toNoteBadgeDetails(badges)} isOutline={isOutline} />
}
