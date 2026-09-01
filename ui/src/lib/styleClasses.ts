// the tailwind class strings shared across pages
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
 * The thin visible scrollbar, sized on both axes for vertical and horizontal overflow alike.
 */
export const THIN_SCROLLBAR_CLASS =
	"[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5"

/**
 * The scrollbar in the highlight color, a little wider than the thin one, for a box whose scrolling is easy to miss.
 * The rules live in globals.css.
 */
export const HIGHLIGHT_SCROLLBAR_CLASS = "scrollbar-highlight"

/**
 * The width the leading column keeps in every table. The min and the max are the same value. A long
 * name wraps inside the column.
 */
const TABLE_COLUMN_WIDTH_CLASS = [
	"[&_tr>:first-child:not([colspan])]:min-w-48",
	"[&_tr>:first-child:not([colspan])]:max-w-48",
	// a column cannot be laid out narrower than its longest unbroken word. breaking anywhere lets the max width hold
	"[&_tr>:first-child:not([colspan])]:[overflow-wrap:anywhere]",
	"[&_tr>:first-child:not([colspan])]:[&_a]:min-w-0",
	// a table fills its card, and auto layout hands the spare width out across the columns, over any max width they state
	"[&_tr>:first-child:not([colspan])]:w-[1%]",
	// a subtable fills the row it opens in
	"[&_table]:table-fixed",
	"[&_table]:w-full",
	"[&_table]:min-w-0",
	"[&_table_tr>:first-child:not([colspan])]:w-48",
].join(" ")

/**
 * The first column stays put while the rest of the table scrolls under it, with a rule down its right
 * edge marking where the frozen part ends. It is opaque with the card's own background, and the
 * scrolling cells pass behind it. A cell spanning the whole row, like an opened subtable, is left alone.
 */
const TABLE_FIXED_FIRST_COLUMN_CLASS = [
	"[&_tr>:first-child:not([colspan])]:bg-card",
	"[&_tr>:first-child:not([colspan])]:sticky",
	"[&_tr>:first-child:not([colspan])]:left-0",
	"[&_tr>:first-child:not([colspan])]:z-10",
	// the rule sits between two equal gaps, the same gap the table's own columns keep
	"[&_tr>:first-child:not([colspan])]:pr-4",
	"[&_tr>:nth-child(2):not([colspan])]:pl-4",
	// the table spans the card's full width, and the edge cells pad the card's inset themselves
	"[&_tr>:first-child:not([colspan])]:pl-4",
	"[&_tr>:last-child:not([colspan])]:pr-4",
	"[&_td[colspan]]:px-4",
	// the rule that ends the frozen column, a plain border matching the row rules exactly
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
 * The row rules. Borders are separated, so each rule belongs to the cell that draws it and paints with
 * the frozen column. Collapsed rules vanish from a scrolled table until a resize repaints them.
 */
const TABLE_ROW_RULE_CLASS = [
	"[&_tr.border-b>*]:border-b",
	"[&_thead.border-b>tr>*]:border-b",
	// a subtable draws its rules on the sunken fill
	"[&_table_tr.border-b>*]:border-separator-sunken",
	"[&_table_thead.border-b>tr>*]:border-separator-sunken",
	// the controls sitting on that same fill: the row selects and the pager buttons
	"[&_table_select]:border-separator-sunken",
	"[&_table_button:not([role])]:border-separator-sunken",
].join(" ")

/**
 * The row under the pointer. The tint goes on the cells, and the opaque frozen column lights up with
 * the rest of its row.
 */
const TABLE_ROW_HOVER_CLASS = [
	// the row paints the band in one piece
	"[&_tbody_tr:hover:not(:has(tr:hover))]:bg-accent",
	// the frozen column is opaque and paints its own tint
	"[&_tbody_tr:hover:not(:has(tr:hover))>:first-child:not([colspan])]:bg-accent",
].join(" ")

// the table element, its header row, and its card, shared by every data table
export const TABLE_CLASS = `w-full border-separate border-spacing-0 text-left text-sm ${TABLE_COLUMN_WIDTH_CLASS} ${TABLE_ROW_RULE_CLASS} ${TABLE_FIXED_FIRST_COLUMN_CLASS} ${TABLE_ROW_HOVER_CLASS}`

export const TABLE_HEAD_CLASS = "text-muted-foreground border-b"

export const CARD_CLASS = "bg-card rounded-lg border p-4 shadow-lift"

/**
 * The wrapper that scrolls a table sideways. It sits inside the card, and the card's padding and
 * whatever follows the table stay put while the columns move under them.
 */
export const TABLE_SCROLL_CLASS = `-mx-4 overflow-x-auto ${THIN_SCROLLBAR_CLASS}`

/**
 * The centered display-font title at the top of a note popover.
 */
export const POPOVER_HEADING_CLASS = "font-display mb-2 text-center text-lg"

/**
 * The bordered card around the topic page's info and settings sections.
 */
export const INFO_CARD_CLASS = "border-separator bg-card h-fit rounded-lg border p-5 text-sm shadow-lift"

/**
 * The card around a numbered list of resources. Its background is mostly transparent, and the steam
 * rings drifting behind the page read through it. The dark card has more fill than the light one.
 */
export const RESOURCE_LIST_CARD_CLASS = "border-separator/60 bg-card/35 dark:bg-card/55 rounded-lg border shadow-lift"

/**
 * The inset that lines up a right-aligned row with the quota line above it. Text takes the full inset.
 * An icon button takes a smaller one. Its icon already sits inset from its own touch target.
 */
export const RAIL_TEXT_INSET = "mr-2.5"

export const RAIL_ICON_INSET = "mr-1"

/**
 * The inset for a right-aligned row ending in a bare icon button. A phone widens the icon's touch
 * box while the glyph stays centered in it, and the box hangs past the edge to keep the glyph on it.
 */
export const RAIL_BARE_ICON_INSET = "-mr-2 sm:mr-1"

/**
 * The page shell every route's main element takes. A page that needs more room overrides the width.
 */
export const PAGE_CLASS = "mx-auto max-w-5xl px-safe pt-3 pb-10"

/**
 * A wide info popover panel: viewport width on a phone, its own max width above that. The popover-panel
 * marker lets globals.css center it as a sheet on a phone.
 */
export const POPOVER_PANEL_CLASS =
	"popover-panel w-[calc(100vw-2rem)] max-w-lg text-sm max-h-[85dvh] sm:max-h-(--radix-popover-content-available-height)"

/**
 * The option in a popover menu: a phone's touch target, tighter on a pointer. A disabled option fades.
 */
export const MENU_OPTION_CLASS =
	"hover:bg-accent focus-visible:ring-ring/50 mt-1 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none first:mt-0 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"

/**
 * The tint marking the option a menu is currently on: the open page, the chosen value, the setting that is on.
 * It goes over MENU_OPTION_CLASS, whose hover fill is a different color.
 */
export const MENU_OPTION_SELECTED_CLASS = "bg-primary/15"

/**
 * A bare icon button, at a phone's touch target and tighter on a pointer.
 */
export const ICON_BUTTON_CLASS =
	"text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"

/**
 * The round frame a user's or a team's avatar takes. The caller sets the size.
 */
export const AVATAR_CLASS =
	"inline-block shrink-0 overflow-hidden rounded-full border shadow-lift outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
