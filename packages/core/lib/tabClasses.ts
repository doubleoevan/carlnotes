import { cn } from "@carlnotes/nightshift/classNames"

/**
 * Returns a tab's classes, underlined in the primary color and bold if it is the selected one of its row.
 */
export function toTabClassName(isSelected: boolean): string {
	return cn(
		"flex min-h-11 items-center border-b-[3px] px-3.5 text-sm sm:min-h-9",
		isSelected ? "border-primary font-bold" : "text-muted-foreground border-transparent font-semibold",
	)
}
