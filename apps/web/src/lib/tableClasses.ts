// the tailwind class strings every data table shares: the table, its header row, its cards, and the wrapper
// that scrolls it sideways
import { THIN_SCROLLBAR_CLASS } from "./styleClasses"

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
	// the selects and pager buttons anywhere in a subtable's cell, its pagination footer included
	"[&_td[colspan]_select]:border-separator-sunken",
	"[&_td[colspan]_button:not([role])]:border-separator-sunken",
	// a subtable inside another subtable flips back to the card fill, so it reads apart from the sunken one it sits in
	"[&_td[colspan]_td[colspan]_[data-slot=table-card]]:bg-card",
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

// the one column of a one-column table, which fills the table and draws no frozen column's rule.
// the important modifier overrides the table's own width and rule for its first column
export const TABLE_ONLY_COLUMN_CLASS = "w-full! max-w-none! border-r-0!"

// a first column wide enough for a play button beside a title.
// the important modifier overrides the table's own width for its first column
export const TABLE_WIDE_FIRST_COLUMN_CLASS = "min-w-64! max-w-64!"

// the card of a table with no pagination under it. the card ends at the last row, which draws no rule, and the card's
// rounded corners clip that row
export const ONE_PAGE_TABLE_CARD_CLASS = "overflow-hidden pb-0 [&_tbody>tr:last-child>*]:border-b-0"

// the card of a table whose pagination shows only with JavaScript. without JavaScript, the card ends at the last row
// as a one-page table's does
export const SCRIPTED_PAGINATION_TABLE_CARD_CLASS = `${ONE_PAGE_TABLE_CARD_CLASS} scripted:overflow-visible scripted:pb-4 scripted:[&_tbody>tr:last-child>*]:border-b`

/**
 * The wrapper that scrolls a table sideways. It sits inside the card, and the card's padding and
 * whatever follows the table stay put while the columns move under them. It is positioned, so absolutely positioned
 * content in a cell, such as a link's hidden screen reader text, stays inside it and never widens the page.
 */
export const TABLE_SCROLL_CLASS = `relative -mx-4 overflow-x-auto ${THIN_SCROLLBAR_CLASS}`

/**
 * A table card opened as a subtable under a table row, on the sunken surface with no margin or shadow of its own.
 */
export const SUBTABLE_CARD_CLASS = "bg-sunken mb-0 shadow-none"
