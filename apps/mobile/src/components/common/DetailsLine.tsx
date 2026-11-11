import {
	type DetailsLineElements,
	type DetailsLineProps,
	DetailsLine as SharedDetailsLine,
} from "@carlnotes/core/components/DetailsLine"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"

// the app's elements: a wrapping row of small muted text, where each detail is one item that wraps whole
const DETAILS_LINE_ELEMENTS: DetailsLineElements = {
	Line: ({ className, children }) => (
		<View className={cn("flex-row flex-wrap items-center gap-x-1", className)}>{children}</View>
	),
	Detail: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
}

/**
 * The muted details line under a screen's byline in the app: a Topic Post's date and reading time, and the counts of
 * a topic, a profile, and a team.
 */
export function DetailsLine(props: DetailsLineProps) {
	return <SharedDetailsLine {...props} elements={DETAILS_LINE_ELEMENTS} />
}
