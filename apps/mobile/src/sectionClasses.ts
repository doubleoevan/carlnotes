// the classes a screen's sections and their loading states share

/**
 * A placeholder shape in a screen's loading state: the muted fill and a slight corner. The caller sets the size, and
 * the loading state's root pulses.
 */
export const SKELETON_SHAPE_CLASS = "rounded bg-muted-foreground/20"

/**
 * A collapsible section's box, with the gap under it.
 */
export const COLLAPSIBLE_SECTION_CLASS = "mb-3"

/**
 * A collapsible section's title row: the caret, the title, and the count at the far right, at the touch target's
 * height.
 */
export const COLLAPSIBLE_SECTION_TITLE_ROW_CLASS = "min-h-12 flex-row items-center gap-2 py-2"

/**
 * The news card's heading row: its title at the left and its window picker at the right, which wraps under the title.
 */
export const NEWS_HEADING_ROW_CLASS = "flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2"

/**
 * A screen's counts line under its last section: the counts centered and spaced apart, wrapping onto a second line, at
 * one line's height while it is empty.
 */
export const COUNTS_LINE_CLASS = "mx-4 mt-8 min-h-5 flex-row flex-wrap items-center justify-center gap-x-8 gap-y-2"
