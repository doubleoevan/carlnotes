import type { ComponentPlatform } from "../componentPlatforms"

/** @public scripts/check-component-parity.ts reads the implementations from this contract. */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

// use the Brews News display face and the same card, row insets, and skeleton line height on each surface
export const topicMemoriesListClasses = {
	card: "min-w-0 rounded-lg border border-separator bg-card px-1 shadow-raised",
	text: "font-display leading-relaxed tracking-wide",
	row: "min-w-0 px-2",
	feedbackInset: "pt-1 pb-2.5",
	readOnlyInset: "py-1.5",
	skeletonBar: "h-2.5 rounded bg-muted-foreground/20",
} as const

// match the 10px skeleton bar to Nightshift's 26px relaxed body line
export const topicMemoriesSkeletonMetrics = { barHeight: 10, lineHeight: 26 } as const

/** A numbered topic memory or a loading row that reserves the same space. */
export type TopicMemoryRowContent = {
	itemNumber: number
	isLast: boolean
}

/** The previous topic memory text sizes the skeleton while the next page loads. */
export type TopicMemorySkeletonProps = TopicMemoryRowContent & { text?: string; canRate?: boolean }
