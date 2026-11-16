import type { ComponentPlatform } from "../componentPlatforms"

/** @public scripts/check-component-parity.ts reads the implementations from this contract. */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

// the field and thumbs share a row, and an acknowledgment takes the field's place
export const ratingWithFeedbackClasses = {
	row: "flex-wrap items-center gap-2",
	field: "flex-1",
	acknowledgment: "flex-1 text-muted-foreground",
} as const
