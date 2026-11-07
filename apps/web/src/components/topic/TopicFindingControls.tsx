import type { TopicFinding } from "@carlnotes/contracts/findings"
import { cn } from "@carlnotes/nightshift/classNames"
import { Bookmark, Check, Circle } from "lucide-react"
import { ACTIVE_ICON_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { TopicFindingRating } from "./TopicFindingRating"

// the text-button style of the bookmark and read toggles and of the finding's flag
export const TOPIC_FINDING_TOGGLE_CLASS =
	"hover:text-link flex min-h-11 items-center gap-2 text-sm hover:underline disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"

/**
 * A signed-in user's rating block over the bookmark and read toggles. If canMarkUnread is false, the read toggle
 * disables once the finding is read.
 */
export function TopicFindingControls({
	resource,
	isRatable,
	isBookmarkable,
	canMarkUnread = true,
	topicFeedHandlers,
}: {
	resource: Pick<TopicFinding, "findingId" | "rating" | "isBookmarked" | "isConsumed">
	isRatable: boolean
	isBookmarkable: boolean
	canMarkUnread?: boolean
	topicFeedHandlers: Pick<TopicFeedHandlers, "rateTopicFinding" | "bookmarkTopicFinding" | "consumeTopicFinding">
}) {
	return (
		<div className="mt-3 border-t pt-2">
			{/* the rating block leads, shown only on topics this user owns or subscribes to */}
			{isRatable && (
				<TopicFindingRating
					findingId={resource.findingId}
					rating={resource.rating}
					onRateTopicFinding={(rating) => topicFeedHandlers.rateTopicFinding(resource.findingId, rating)}
				/>
			)}
			{/* the bookmark and read toggles share one row, and an existing bookmark stays removable */}
			<div className={cn("flex items-center justify-between gap-2", isRatable && "mt-2")}>
				{(isBookmarkable || resource.isBookmarked) && (
					<button
						type="button"
						onClick={() => topicFeedHandlers.bookmarkTopicFinding(resource.findingId, !resource.isBookmarked)}
						aria-pressed={resource.isBookmarked}
						className={TOPIC_FINDING_TOGGLE_CLASS}
					>
						<Bookmark className={cn("size-4", resource.isBookmarked && ACTIVE_ICON_CLASS)} />
						{resource.isBookmarked ? "Remove bookmark" : "Bookmark"}
					</button>
				)}
				<button
					type="button"
					onClick={() => topicFeedHandlers.consumeTopicFinding(resource.findingId, !resource.isConsumed)}
					disabled={resource.isConsumed && !canMarkUnread}
					className={TOPIC_FINDING_TOGGLE_CLASS}
				>
					{resource.isConsumed ? <Circle className="size-4" /> : <Check className="size-4" />}
					{resource.isConsumed ? "Mark unread" : "Mark read"}
				</button>
			</div>
		</div>
	)
}
