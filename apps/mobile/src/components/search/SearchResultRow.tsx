import {
	type SearchResultRowElements,
	type SearchResultRowProps,
	SearchResultRow as SharedSearchResultRow,
} from "@carlnotes/core/components/SearchResultRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// native keeps its font-scaled rank and existing list spacing
const elements: SearchResultRowElements = {
	Row: ({ children, className }) => (
		<View className={cn("min-h-16 flex-row items-start gap-2.5 py-3", className)}>{children}</View>
	),
	Rank: ({ children }) => {
		const width = useFontScaledSize(16)
		return (
			<Text style={{ width }} className="pt-0.5 text-center font-display text-sm text-muted-foreground">
				{children}
			</Text>
		)
	},
	Body: ({ children }) => <View className="min-w-0 flex-1 flex-row items-start gap-2.5">{children}</View>,
	Content: ({ children }) => <View className="min-w-0 flex-1 gap-0.5">{children}</View>,
	Title: ({ children }) => <>{children}</>,
	Details: ({ children }) => <View className="flex-row flex-wrap items-center gap-1.5">{children}</View>,
}

/**
 * Adapts the shared search-result composition to native controls.
 */
export function SearchResultRow(props: SearchResultRowProps) {
	return <SharedSearchResultRow {...props} elements={elements} />
}
