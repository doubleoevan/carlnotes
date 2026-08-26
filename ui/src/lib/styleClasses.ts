// the tailwind class strings shared across pages, so one look never drifts between them
/**
 * The highlight treatment over the shared button shape, for the one main action a page view has.
 */
export const MENU_BUTTON_HIGHLIGHT_CLASS =
	"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-transparent"

/**
 * The icon-only menu button at the end of the search bar, sized for a phone's touch target.
 */
export const SEARCH_BAR_ICON_CLASS =
	"text-muted-foreground hover:text-foreground grid min-h-11 w-8 shrink-0 place-items-center rounded-md sm:min-h-9"

/**
 * The bordered button treatment shared by the feed toolbar's controls.
 */
export const MENU_BUTTON_CLASS =
	"bg-card text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm shadow-lift sm:min-h-9"

/**
 * The thin visible scrollbar sized on both axes, so it shows automatically for vertical and horizontal overflow alike.
 */
export const THIN_SCROLLBAR_CLASS =
	"[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5"

/**
 * The first column stays put while the rest of the table scrolls under it, with a rule down its right
 * edge marking where the frozen part ends. It carries the card's own background so the scrolling cells
 * pass behind it. A cell spanning the whole row, like an opened subtable, is left alone.
 */
/**
 * The width the leading column keeps in every table. It is fixed rather than a floor, so a table with
 * three columns and a table with eleven both start at the same place and a name wraps inside it.
 */
const TABLE_COLUMN_WIDTH_CLASS = [
	"[&_tr>:first-child:not([colspan])]:min-w-48",
	"[&_tr>:first-child:not([colspan])]:max-w-48",
	// a column cannot be laid out narrower than its longest unbroken word, and the ceiling is only a hint against that
	"[&_tr>:first-child:not([colspan])]:[overflow-wrap:anywhere]",
	"[&_tr>:first-child:not([colspan])]:[&_a]:min-w-0",
	// a table fills its card, and auto layout hands the spare width out across the columns, over any ceiling they state
	"[&_tr>:first-child:not([colspan])]:w-[1%]",
	// a subtable fills the row it opens in
	"[&_table]:table-fixed",
	"[&_table]:w-full",
	"[&_table]:min-w-0",
	"[&_table_tr>:first-child:not([colspan])]:w-48",
].join(" ")

const TABLE_FIXED_FIRST_COLUMN_CLASS = [
	"[&_tr>:first-child:not([colspan])]:bg-card",
	"[&_tr>:first-child:not([colspan])]:sticky",
	"[&_tr>:first-child:not([colspan])]:left-0",
	"[&_tr>:first-child:not([colspan])]:z-10",
	// the rule sits between two equal gaps, the same gap the table's own columns keep
	"[&_tr>:first-child:not([colspan])]:pr-4",
	"[&_tr>:nth-child(2):not([colspan])]:pl-4",
	// the inset the card's padding used to give, now that the table spans the card's full width
	"[&_tr>:first-child:not([colspan])]:pl-4",
	"[&_tr>:last-child:not([colspan])]:pr-4",
	"[&_td[colspan]]:px-4",
	// the rule that ends the frozen column, a plain border so it matches the row rules exactly
	"[&_tr>:first-child:not([colspan])]:border-r",
	// a subtable opens inside a row of the table above it and shares that table's scrolling
	"[&_table_tr>:first-child:not([colspan])]:static",
	"[&_table_tr>:first-child:not([colspan])]:z-auto",
	"[&_table_tr>:first-child:not([colspan])]:bg-transparent",
	"[&_table_tr>:first-child:not([colspan])]:pr-4",
	"[&_table_tr>:nth-child(2):not([colspan])]:pl-0",
	"[&_table_tr>:first-child:not([colspan])]:border-r-0",
].join(" ")

/**
 * The row rules. Borders are separated rather than collapsed, so a rule belongs to the cell that draws
 * it: it paints with the frozen column instead of underneath it, and it survives that column sticking.
 * Collapsed borders do neither, which is why a scrolled table lost its lines until a resize repainted.
 */
const TABLE_ROW_RULE_CLASS = [
	"[&_tr.border-b>*]:border-b",
	"[&_thead.border-b>tr>*]:border-b",
	// a subtable draws its rules on the sunken fill instead of the card
	"[&_table_tr.border-b>*]:border-separator-sunken",
	"[&_table_thead.border-b>tr>*]:border-separator-sunken",
	// the controls sitting on that same fill: the row selects and the pager buttons
	"[&_table_select]:border-separator-sunken",
	"[&_table_button:not([role])]:border-separator-sunken",
].join(" ")

/**
 * The row under the pointer. The tint goes on the cells rather than the row, so the frozen column
 * lights up with the rest of its row instead of keeping the card colour that hides what is behind it.
 */
const TABLE_ROW_HOVER_CLASS = [
	// the row paints the band in one piece
	"[&_tbody_tr:hover:not(:has(tr:hover))]:bg-accent",
	// the frozen column paints its own, being opaque so the columns can pass behind it
	"[&_tbody_tr:hover:not(:has(tr:hover))>:first-child:not([colspan])]:bg-accent",
].join(" ")

// the table element, its header row, and its card chrome, shared by every data table so the look never drifts
export const TABLE_CLASS = `w-full border-separate border-spacing-0 text-left text-sm ${TABLE_COLUMN_WIDTH_CLASS} ${TABLE_ROW_RULE_CLASS} ${TABLE_FIXED_FIRST_COLUMN_CLASS} ${TABLE_ROW_HOVER_CLASS}`

export const TABLE_HEAD_CLASS = "text-muted-foreground border-b"

export const CARD_CLASS = "bg-card rounded-lg border p-4 shadow-lift"

/**
 * The wrapper that scrolls a table sideways. It sits inside the card, so the card's padding and
 * whatever follows the table stay where they are while the columns move under them.
 */
export const TABLE_SCROLL_CLASS = `-mx-4 overflow-x-auto ${THIN_SCROLLBAR_CLASS}`

/**
 * The centered display-font title at the top of a note popover.
 */
export const POPOVER_HEADING_CLASS = "font-display mb-2 text-center text-lg"

/**
 * The card chrome around the topic page's info and settings sections.
 */
export const INFO_CARD_CLASS = "border-separator bg-card h-fit rounded-lg border p-5 text-sm shadow-lift"

/**
 * The card chrome around a numbered list of resources. Its background is mostly transparent, so the steam rings
 * drifting behind the page still read through it.
 * The dark card includes more fill than the light one, which needs less to separate from the page behind it.
 */
export const RESOURCE_LIST_CARD_CLASS = "border-separator/60 bg-card/35 dark:bg-card/55 rounded-lg border shadow-lift"

/**
 * The inset that lines up a right-aligned row with the quota line above it. Text takes the full inset.
 * An icon button takes a smaller one. Its icon already sits inset from its own touch target, so the
 * full inset would push it in twice.
 */
export const RAIL_TEXT_INSET = "mr-2.5"

export const RAIL_ICON_INSET = "mr-1"

/**
 * The inset for a right-aligned row ending in a bare icon button. A phone widens the icon's touch
 * box while the glyph stays centered in it, so the box hangs past the edge to keep the glyph on it.
 */
export const RAIL_BARE_ICON_INSET = "-mr-2 sm:mr-1"

/**
 * The page shell every route's main element wears. A page that needs more room overrides the width.
 */
export const PAGE_CLASS = "mx-auto max-w-5xl px-safe pt-3 pb-10"

/**
 * A popover sized to the viewport on a phone and to its own ceiling above that.
 */
export const POPOVER_WIDTH_CLASS = "w-[calc(100vw-2rem)] max-w-lg text-sm"

/**
 * A bare icon button, at a phone's touch target and tighter on a pointer.
 */
export const ICON_BUTTON_CLASS =
	"text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"

/**
 * The round chrome a user's or a team's avatar wears. The caller sets the size.
 */
export const AVATAR_CLASS =
	"inline-block shrink-0 overflow-hidden rounded-full border shadow-lift outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
