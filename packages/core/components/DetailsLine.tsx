// the muted line of details under a page's byline: a Topic Post's date and reading time, and the counts of a topic,
// a profile, and a team. the line wraps between details, and each detail keeps its middle dot at its own end
import type { ComponentType, ReactNode } from "react"
import { toDetailText } from "../lib/detailsLine"

// each app's elements: the wrapping line, and one detail of it, which moves to the next line whole
export type DetailsLineElements = {
	Line: ComponentType<{ className?: string; children: ReactNode }>
	Detail: ComponentType<{ children: string }>
}

// the details in order, the classes that place the line on its page, and what ends the line after the details
export type DetailsLineProps = { details: string[]; className?: string; children?: ReactNode }

/**
 * Shows a page's details on one muted line that wraps between details. A line with no detail and nothing after them
 * is absent.
 */
export function DetailsLine({
	details,
	className,
	children,
	elements: { Line, Detail },
}: DetailsLineProps & { elements: DetailsLineElements }) {
	const hasEnding = Boolean(children)
	if (details.length === 0 && !hasEnding) {
		return null
	}
	return (
		<Line className={className}>
			{details.map((detail, i) => (
				<Detail key={detail}>{toDetailText(detail, i === details.length - 1 && !hasEnding)}</Detail>
			))}
			{children}
		</Line>
	)
}
