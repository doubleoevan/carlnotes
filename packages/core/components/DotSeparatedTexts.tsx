// the texts of a row's details line, each its own element, so the line wraps one text at a time with each dot staying
// with the text after it
import type { ComponentType, ReactNode } from "react"

// each app's element for one text, told whether a dot leads it
export type DotSeparatedTextsElements = {
	Text: ComponentType<{ children: ReactNode; isAfterDot: boolean }>
}

/**
 * Shows the texts that are set, each in its own element, with a dot before every text after the first.
 */
export function DotSeparatedTexts({
	texts,
	elements: { Text },
}: {
	texts: (string | null | undefined)[]
	elements: DotSeparatedTextsElements
}) {
	const setTexts = texts.filter((text): text is string => Boolean(text))
	return (
		<>
			{setTexts.map((text, i) => (
				<Text key={text} isAfterDot={i > 0}>
					{i > 0 ? `· ${text}` : text}
				</Text>
			))}
		</>
	)
}
