import type { ComponentPlatform } from "../componentPlatforms"
import { typeRoles } from "../typography"

/**
 * The apps that implement ExpandableRow. @public The parity checker loads each contract.
 */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

/**
 * The content both platforms show in the disclosure trigger.
 */
export type ExpandableRowSharedProps = {
	title: string
	metadata: string
	tag?: string
	ordinal?: number
	initialOpen?: boolean

	// a list that keeps one row open holds the state, in place of the row's own
	isExpanded?: boolean
	onToggleExpanded?: () => void
	isFirst?: boolean
	isLast?: boolean
	variant?: "item" | "section"
}

/**
 * The shared layout and type classes, with platform semantics supplied by each primitive.
 */
export const expandableRowClasses = {
	row: "min-w-0 border-b border-separator py-1",
	firstRow: "pt-0",
	lastRow: "border-b-0",
	sectionRow: "py-0",
	trigger: "h-auto w-full flex-row flex-wrap justify-start gap-3 px-0 py-1",
	ordinal: "shrink-0 font-display text-xs font-normal text-muted-foreground tabular-nums",
	tag: "rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground",
	title: "min-w-0 flex-1 basis-40 text-left text-sm font-display font-normal text-muted-foreground",
	sectionTitle: `${typeRoles.sectionLabel.className} font-normal text-muted-foreground`,
	metadata: "shrink-0 text-xs text-muted-foreground",
	details: "min-w-0",
	itemDetails: "py-2",
	chevron: "size-4 shrink-0 text-foreground",
} as const
