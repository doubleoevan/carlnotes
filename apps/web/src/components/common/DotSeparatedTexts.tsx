import {
	type DotSeparatedTextsElements,
	DotSeparatedTexts as SharedDotSeparatedTexts,
} from "@carlnotes/core/components/DotSeparatedTexts"
import { cn } from "@carlnotes/nightshift/classNames"

// a text after a dot never breaks inside, and its margin evens the line's gap with a space. a time may differ between
// the server's render and the browser's by a minute, so its hydration warning is off
export const DOT_SEPARATED_TEXTS_ELEMENTS: DotSeparatedTextsElements = {
	Text: ({ children, isAfterDot }) => (
		<span suppressHydrationWarning className={cn(isAfterDot && "-ml-0.5 whitespace-nowrap")}>
			{children}
		</span>
	),
}

/**
 * A row's details texts on the web, each wrapping on its own.
 */
export function DotSeparatedTexts({ texts }: { texts: (string | null | undefined)[] }) {
	return <SharedDotSeparatedTexts texts={texts} elements={DOT_SEPARATED_TEXTS_ELEMENTS} />
}
