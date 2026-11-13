import {
	type DotSeparatedTextsElements,
	DotSeparatedTexts as SharedDotSeparatedTexts,
} from "@carlnotes/core/components/DotSeparatedTexts"
import { cn } from "@carlnotes/nightshift/classNames"
import { Text } from "@/components/primitives/text"

// the first text shrinks on a narrow line, and a text after a dot has a margin that evens the line's gap with a space
export const DOT_SEPARATED_TEXTS_ELEMENTS: DotSeparatedTextsElements = {
	Text: ({ children, isAfterDot }) => (
		<Text className={cn("text-xs text-muted-foreground", isAfterDot ? "-ml-0.5" : "shrink")}>{children}</Text>
	),
}

/**
 * A row's details texts in the app, each wrapping on its own.
 */
export function DotSeparatedTexts({ texts }: { texts: (string | null | undefined)[] }) {
	return <SharedDotSeparatedTexts texts={texts} elements={DOT_SEPARATED_TEXTS_ELEMENTS} />
}
