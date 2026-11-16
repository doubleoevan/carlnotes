import type { TopicMemoriesDialogElements } from "@carlnotes/core/components/TopicMemoriesDialog"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { RatingWithFeedback } from "@/components/primitives/rating-with-feedback"
import { TakeawayRow, TakeawaySkeleton, TakeawaysList } from "@/components/primitives/takeaways-list"

/** Supplies the Journal's rating, announcements, and Nightshift list controls. */
export const topicMemoriesDialogElements: TopicMemoriesDialogElements = {
	List: TakeawaysList,
	Row: TakeawayRow,
	Skeleton: TakeawaySkeleton,
	Rating: RatingWithFeedback,
	Message: ({ children, isError }) => (
		<p
			className={cn("text-sm", isError ? "text-destructive" : "text-muted-foreground")}
			role={isError ? "alert" : undefined}
		>
			{children}
		</p>
	),
	Retry: ({ onPress }) => (
		<Button type="button" variant="outline" onClick={onPress}>
			Try again
		</Button>
	),
	Pagination: (props) => <Pagination {...props} ariaLabel="Takeaways pages" />,
}
