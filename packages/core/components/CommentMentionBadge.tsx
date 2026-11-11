import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import type { CommentMentionBadgePlace, UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import { type ComponentType, type ReactNode, useState } from "react"
import { toCommentMentionLabel } from "../lib/updateCounts"
import { CommentMentionList, type CommentMentionListElements } from "./CommentMentionList"

// the platform elements of a mention badge: the count with the list it opens, a popover on the web and a sheet in the
// app, and the list's own elements
export type CommentMentionBadgeElements = {
	Frame: ComponentType<{
		count: number
		label: string
		isOpen: boolean
		onOpenChange: (isOpen: boolean) => void
		children: ReactNode
	}>
	list: CommentMentionListElements
}

// the mentions the badge counts, where it sits, what choosing a mention does, how the app sends a visit event, and
// the platform's elements
type CommentMentionBadgeProps = {
	commentMentions: UnseenCommentMention[]
	place: CommentMentionBadgePlace
	onChoose?: (commentMention: UnseenCommentMention) => void
	captureVisitEvent: (event: VisitAnalyticsEvent, properties: AnalyticsEventProperties) => void
	elements: CommentMentionBadgeElements
}

/**
 * Counts the unseen Comment Mentions of one place, a thread or a page, and opens the list of every unseen mention on
 * a press. A place with none shows nothing. An open reports the badge's place and no text.
 */
export function CommentMentionBadge({
	commentMentions,
	place,
	onChoose,
	captureVisitEvent,
	elements: { Frame, list },
}: CommentMentionBadgeProps) {
	const [isOpen, setIsOpen] = useState(false)
	if (commentMentions.length === 0) {
		return null
	}

	// report each open of the list by the badge's place
	const handleOpenChange = (isListOpen: boolean): void => {
		if (isListOpen) {
			captureVisitEvent("social_mention_badge_open", { place })
		}
		setIsOpen(isListOpen)
	}
	return (
		<Frame
			count={commentMentions.length}
			label={toCommentMentionLabel(commentMentions.length)}
			isOpen={isOpen}
			onOpenChange={handleOpenChange}
		>
			<CommentMentionList
				onChoose={(commentMention) => {
					setIsOpen(false)
					onChoose?.(commentMention)
				}}
				elements={list}
			/>
		</Frame>
	)
}
