import {
	type CommentMentionBadgeElements,
	CommentMentionBadge as SharedCommentMentionBadge,
} from "@carlnotes/core/components/CommentMentionBadge"
import { COMMENT_MENTIONS_TITLE } from "@carlnotes/core/lib/socialLabels"
import { useCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import { AtSign } from "lucide-react-native"
import { type ComponentProps, useState } from "react"
import { Pressable } from "react-native"
import { CountBadge } from "@/components/common/CountBadge"
import { Sheet } from "@/components/common/Sheet"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { captureVisitEvent } from "@/visitAnalytics"
import { COMMENT_MENTION_LIST_ELEMENTS, CommentMentionList } from "./CommentMentionList"

// the app's elements: the count opens the list in a sheet. a phone has no anchored popover
const COMMENT_MENTION_BADGE_ELEMENTS: CommentMentionBadgeElements = {
	Frame: ({ count, label, isOpen, onOpenChange, children }) => (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				hitSlop={toTouchTargetHitSlop(24)}
				onPress={() => onOpenChange(true)}
				className="min-h-6 min-w-6 items-center justify-center"
			>
				<CountBadge count={count} />
			</Pressable>
			{isOpen ? (
				<Sheet title={COMMENT_MENTIONS_TITLE} onClose={() => onOpenChange(false)}>
					{children}
				</Sheet>
			) : null}
		</>
	),
	list: COMMENT_MENTION_LIST_ELEMENTS,
}

/**
 * A place's unseen Comment Mentions in the app as one count, whose press opens the list of every unseen mention in
 * a sheet.
 */
export function CommentMentionBadge(
	props: Omit<ComponentProps<typeof SharedCommentMentionBadge>, "elements" | "captureVisitEvent">,
) {
	return (
		<SharedCommentMentionBadge
			{...props}
			captureVisitEvent={captureVisitEvent}
			elements={COMMENT_MENTION_BADGE_ELEMENTS}
		/>
	)
}

/**
 * The user menu's Mentions row, which shows while a mention waits. A press opens the list in a sheet, and choosing a
 * mention closes the menu.
 */
export function CommentMentionMenuRow({ onNavigate }: { onNavigate: () => void }) {
	const commentMentions = useCommentMentions()
	const [isOpen, setIsOpen] = useState(false)
	if (commentMentions.length === 0) {
		return null
	}

	// report each open of the list from the header's menu
	const handleOpen = (): void => {
		captureVisitEvent("social_mention_badge_open", { place: "header" })
		setIsOpen(true)
	}
	return (
		<>
			<Button
				variant="ghost"
				className="min-h-12 justify-start gap-2 px-2"
				accessibilityLabel={`${COMMENT_MENTIONS_TITLE}, ${commentMentions.length}`}
				onPress={handleOpen}
			>
				<Icon as={AtSign} className="size-4 text-foreground" />
				<Text className="flex-1 text-left">{COMMENT_MENTIONS_TITLE}</Text>
				<CountBadge count={commentMentions.length} className="text-xs" />
			</Button>
			{isOpen ? (
				<Sheet title={COMMENT_MENTIONS_TITLE} onClose={() => setIsOpen(false)}>
					<CommentMentionList
						onChoose={() => {
							setIsOpen(false)
							onNavigate()
						}}
					/>
				</Sheet>
			) : null}
		</>
	)
}
