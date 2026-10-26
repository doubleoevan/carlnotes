/**
 * The web pagination colors, shared with native controls whose labels need their own text classes.
 */
export const paginationClasses = {
	idle: { box: "border-border bg-card", text: "text-muted-foreground" },
	current: { box: "border-primary bg-primary", text: "text-primary-foreground" },
} as const
