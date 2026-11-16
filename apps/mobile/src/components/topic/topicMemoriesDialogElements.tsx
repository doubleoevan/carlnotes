import type { TopicMemoriesDialogElements } from "@carlnotes/core/components/TopicMemoriesDialog"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { RatingWithFeedback } from "@/components/primitives/rating-with-feedback"
import { TakeawayRow, TakeawaySkeleton, TakeawaysList } from "@/components/primitives/takeaways-list"
import { Text } from "@/components/primitives/text"

/** Supplies the Journal's rating, announcements, and Nightshift list controls. */
export const topicMemoriesDialogElements: TopicMemoriesDialogElements = {
	List: TakeawaysList,
	Row: TakeawayRow,
	Skeleton: TakeawaySkeleton,
	Rating: RatingWithFeedback,
	Message: ({ children, isError }) => (
		<Text
			className={cn("text-sm", isError ? "text-destructive" : "text-muted-foreground")}
			accessibilityLiveRegion="polite"
		>
			{children}
		</Text>
	),
	Retry: ({ onPress }) => (
		<Button variant="outline" accessibilityLabel="Try again" onPress={onPress}>
			<Text>Try again</Text>
		</Button>
	),
	Pagination: (props) => <Pagination {...props} label="Takeaways pages" />,
}
