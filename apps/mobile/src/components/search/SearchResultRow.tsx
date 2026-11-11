import {
	type SearchResultRowElements,
	type SearchResultRowProps,
	SearchResultRow as SharedSearchResultRow,
} from "@carlnotes/core/components/SearchResultRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { Pressable, View } from "react-native"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// native keeps its font-scaled rank and existing list spacing
const elements: SearchResultRowElements = {
	// a row with a press opens something from anywhere on it but its own links, which take their own presses
	Row: ({ children, className, onPress }) => {
		const rowClassName = cn("min-h-16 flex-row items-start gap-2.5 py-3", className)
		return onPress ? (
			<Pressable accessible={false} onPress={onPress} className={cn(rowClassName, "active:opacity-75")}>
				{children}
			</Pressable>
		) : (
			<View className={rowClassName}>{children}</View>
		)
	},
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
	// the control sits right after the title, level with its first line, and adds no height to the row
	Title: ({ children, aside }) =>
		aside ? (
			<View className="flex-row items-start gap-0.5">
				<View className="shrink">{children}</View>
				<View className="-my-1">{aside}</View>
			</View>
		) : (
			children
		),
	Details: ({ children }) => <View className="flex-row flex-wrap items-center gap-1.5">{children}</View>,
}

/**
 * Adapts the shared search-result composition to native controls.
 */
export function SearchResultRow(props: SearchResultRowProps) {
	return <SharedSearchResultRow {...props} elements={elements} />
}
