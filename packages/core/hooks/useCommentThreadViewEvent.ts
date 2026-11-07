import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import { type CommentTarget, toCommentEventTarget } from "@carlnotes/contracts/social"
import { useEffect } from "react"

// the thread shown, the Topic it belongs to and whether the user owns it, and how the app sends a visit event
type UseCommentThreadViewEventOptions = {
	target: CommentTarget
	topicId: string
	isTopicOwner: boolean
	captureVisitEvent: (event: VisitAnalyticsEvent, properties: AnalyticsEventProperties) => void
}

/**
 * Sends one view event per showing of a social target's comment thread, with ids and no text.
 */
export function useCommentThreadViewEvent({
	target: { kind, id },
	topicId,
	isTopicOwner,
	captureVisitEvent,
}: UseCommentThreadViewEventOptions): void {
	useEffect(() => {
		captureVisitEvent(`social_${toCommentEventTarget(kind)}_hot_takes_view`, {
			objectId: id,
			topicId,
			isOwner: isTopicOwner,
		})
	}, [kind, id, topicId, isTopicOwner, captureVisitEvent])
}
