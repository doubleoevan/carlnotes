// the tailwind class strings shared across pages
import { cn } from "@carlnotes/nightshift/classNames"
import { FIELD_CLASS } from "@carlnotes/nightshift/field"

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
 * The hover that a ghost button on the dark hero band takes in place of the ghost variant's own: a white wash and the
 * hero's text color.
 */
export const HERO_BUTTON_HOVER_CLASS = "hover:bg-white/10 hover:text-hero-foreground dark:hover:bg-white/10"

/**
 * A link that stands alone, such as a link in a table cell, a footer link, or a link alone in its line: the link color,
 * underlined on hover. A link inside a sentence takes the sentence-link utility instead.
 */
export const STANDALONE_LINK_CLASS = "text-link hover:underline"

/**
 * A standalone link on a line of its own.
 */
export const STANDALONE_LINE_LINK_CLASS = `${STANDALONE_LINK_CLASS} inline-block text-sm`

/**
 * The metadata line under a row's title.
 */
export const METADATA_LINE_CLASS = "text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"

/**
 * The metadata line of a row that brightens on hover.
 */
export const ROW_METADATA_LINE_CLASS = `${METADATA_LINE_CLASS} group-hover:text-foreground/80`

/**
 * A list row with a dashed separator over it. The first row has no separator.
 */
export const DASHED_ROW_CLASS =
	"after:border-separator-strong relative after:absolute after:inset-x-2 after:top-0 after:border-t after:border-dashed first:after:hidden"

/**
 * The tinted band behind a list row under the pointer. It paints on a rounded under-layer, so the row's dashed
 * separator stays straight.
 */
export const LIST_ROW_HOVER_CLASS =
	"relative isolate before:absolute before:inset-0 before:-z-10 before:rounded-lg before:transition-colors hover:before:bg-accent-foreground/20"

/**
 * The tint that keeps a list row's under-layer lit while the player is on the row's podcast episode chapter.
 */
export const LIST_ROW_HIGHLIGHTED_CLASS = "before:bg-muted/70"

/**
 * A round play button in the primary color, with a button's shadow. Each button adds its own size class.
 */
export const PLAY_BUTTON_CLASS =
	"bg-primary text-primary-foreground hover:bg-primary/90 shadow-raised grid shrink-0 place-items-center rounded-full transition-colors"

/**
 * The caret that leads a title which opens and closes what is under it. It points right while closed, and its
 * caller turns it down a quarter turn while open.
 */
export const EXPANDER_CARET_CLASS = "text-muted-foreground size-4 shrink-0 transition-transform duration-200"

/**
 * Shows a control only in a browser with JavaScript.
 */
export const SCRIPTED_ONLY_CLASS = "hidden scripted:inline-flex"

/**
 * Hides an element only in a browser with JavaScript.
 */
export const SCRIPTED_HIDDEN_CLASS = "scripted:hidden"

/**
 * Hides a section on a narrow screen with JavaScript. The section stays in the html, and a browser without JavaScript
 * shows it at every width.
 */
export const NARROW_SCREEN_HIDDEN_CLASS = "max-sm:scripted:hidden"

/**
 * A card that is one link to its page: the box the heading's link stretches over, the group whose hover underlines the
 * heading, and the overlay shadow under the pointer or a focus inside it.
 */
export const CARD_LINK_BOX_CLASS = "group/card relative flex flex-col hover:shadow-overlay focus-within:shadow-overlay"

/**
 * The heading of a card that is one link: the display font, underlined while the card is hovered, and a pseudo-element
 * over the whole card, so a click anywhere opens the page.
 */
export const STRETCHED_CARD_LINK_CLASS =
	"font-display text-foreground text-lg leading-tight no-underline group-hover/card:underline after:absolute after:inset-0 after:content-['']"

/**
 * The muted look that a row's play button adds if its podcast episode or chapter is not the one in the player.
 */
export const PLAY_BUTTON_MUTED_CLASS = "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground border"

/**
 * The cover that says the hosts are recording.
 * It replaces the cover placeholder for a podcast episode that is recording.
 */
export const COVER_RECORDING_CLASS = "bg-[url(/podcast-cover-recording.jpg)]"

/**
 * The bordered button treatment shared by the feed toolbar's controls.
 */
export const MENU_BUTTON_CLASS =
	"bg-card text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm shadow-raised sm:min-h-9"

/**
 * A round button beside the docked podcast player's play button, at play's own size on a phone and a pointer alike:
 * the mic that asks carl and vienna, and the stop that ends the question.
 */
export const PODCAST_EPISODE_QUESTION_BUTTON_CLASS =
	"bg-muted text-foreground hover:bg-accent grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40"

// the shared skip and playback speed button classes
export { PLAYBACK_CONTROL_BUTTON_CLASS } from "@carlnotes/core/components/PlaybackControlButtons"

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
 * The focus ring of a scrolling box that takes a tab stop, drawn inside its edge so a clipping parent never hides it.
 */
export const SCROLL_REGION_FOCUS_CLASS =
	"outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"

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

export const CARD_CLASS = "bg-card rounded-lg border p-4 shadow-raised"

// the filled primary color of an icon that shows an active state
export const ACTIVE_ICON_CLASS = "text-primary fill-current"

// the light fill of an active icon. a solid fill hides the lines inside the Funny icon
export const LIGHT_ICON_FILL_CLASS = "fill-primary/35"

// a comment row's small icon control, muted until hovered
export const ROW_CONTROL_CLASS = "text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center"

// a comment row's controls or reactions, pulled left by the padding of the first
export const ROW_CONTROLS_CLASS = "-ml-1 flex flex-wrap items-center"

// the border and outline of a highlighted card. the outline keeps the card's raised shadow, which a ring would lose to
export const HIGHLIGHTED_CARD_CLASS = "border-primary outline-primary/40 outline-2"

/**
 * The wrapper that scrolls a table sideways. It sits inside the card, and the card's padding and
 * whatever follows the table stay put while the columns move under them. It is positioned, so absolutely positioned
 * content in a cell, such as a link's hidden screen reader text, stays inside it and never widens the page.
 */
export const TABLE_SCROLL_CLASS = `relative -mx-4 overflow-x-auto ${THIN_SCROLLBAR_CLASS}`

/**
 * The centered display-font title at the top of a note popover.
 */
export const POPOVER_HEADING_CLASS = "font-display mb-2 text-center text-lg"

/**
 * A heading inside a scan's recap: the compact display-font line over the note's sections and the source footnotes.
 * Each caller adds its own margins.
 */
export const RECAP_HEADING_CLASS = "font-display text-foreground text-[13px] font-semibold"

/**
 * The section label: the small uppercase muted label in the display font over a field, a value, or a group. Each caller
 * adds its own margin and alignment. It is the sectionLabel type role in Nightshift's typography.ts with the muted
 * color.
 */
export const SECTION_LABEL_CLASS = "text-muted-foreground font-display text-xs tracking-wide uppercase"

/**
 * The CarlNotes name in the logo, beside the coffee mug, in the header and on the sign-in pages. It is the logo type
 * role in Nightshift's typography.ts.
 */
export const LOGO_CLASS = "font-display text-xl"

/**
 * The bordered card around the topic page's info and settings sections.
 */
export const INFO_CARD_CLASS = "border-separator bg-card h-fit rounded-lg border p-5 text-sm shadow-raised"

/**
 * The card around a film: the info card with the frame, the seek bar, and the controls in one column.
 */
export const FILM_CARD_CLASS = `${INFO_CARD_CLASS} flex flex-col gap-3`

/**
 * The dashed dividers between an info card's sections.
 */
export const INFO_CARD_SECTIONS_CLASS = "divide-separator-strong divide-y divide-dashed"

/**
 * Two info sections in one row, which takes the place of one divided section. Each section in it takes py-0.
 */
export const INFO_SECTION_PAIR_CLASS = "flex items-start gap-3 py-3 last:pb-0"

/**
 * The second info section in a pair row, at the right.
 */
export const INFO_SECTION_PAIR_END_CLASS = "ml-auto py-0 text-right"

/**
 * The card around a list of rows, such as a topic's findings, its podcast episodes, or its scan history.
 */
export const RESOURCE_LIST_CARD_CLASS = "border-separator bg-card rounded-lg border shadow-raised"

/**
 * The slot at a list row's top left that holds its rank. On a phone the taller slot starts at the row top.
 */
export const RANK_SLOT_CLASS = "absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"

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
export const RAIL_BARE_ICON_INSET = "-mr-1.5 sm:mr-1.5"

/**
 * The page shell every route's main element takes. A page that needs more room overrides the width.
 */
export const PAGE_CLASS = "mx-auto max-w-5xl px-safe pt-3 pb-10"

/**
 * An accordion whose first section's title drops its top padding, so the gap over the sections is the accordion's
 * own margin alone.
 */
export const FLUSH_FIRST_SECTION_CLASS = "[&>*:first-child_[data-slot=accordion-trigger]]:pt-0"

// the size and the states that both buttons of a page's top row share at every width: the default Button's height,
// label, icon gap, and corner, with a border on both so their boxes match. the pseudo-element grows the 36px button's
// touch target to 44px
const PAGE_BUTTON_SIZE_CLASS =
	"relative inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium whitespace-nowrap shadow-raised outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 before:absolute before:-inset-x-px before:-inset-y-[5px] before:content-['']"

/**
 * The plain button at the left of a page's top row of buttons, and the plain button of a titled header row: the card's
 * fill and border with a muted label. Its icon takes PLAIN_PAGE_BUTTON_ICON_CLASS.
 */
export const PLAIN_PAGE_BUTTON_CLASS = `${PAGE_BUTTON_SIZE_CLASS} bg-card text-muted-foreground hover:text-foreground`

/**
 * The one highlighted button at the right of a page's top row of buttons or of a titled header row. It differs from
 * the plain button in its fill alone.
 */
export const HIGHLIGHTED_PAGE_BUTTON_CLASS = `${PAGE_BUTTON_SIZE_CLASS} bg-primary text-primary-foreground hover:bg-primary/90 border-transparent`

/**
 * The icon of the plain button at the left of a page's top row of buttons. The icon alone takes the highlight color,
 * and the button stays plain.
 */
export const PLAIN_PAGE_BUTTON_ICON_CLASS = "text-primary size-4"

/**
 * The row of buttons under the search bar. The page's own button sits at the left in the plain style, and the button
 * at the right is the row's one highlighted button. The row keeps 16px above it, from the search bar, and 16px below
 * it, to the page's header.
 */
export const PAGE_BUTTON_ROW_CLASS = "mt-1 mb-4 flex flex-wrap items-start justify-between gap-3"

/**
 * The news card's heading row: its title at the left and its window picker at the right, which wraps under the title
 * on a phone.
 */
export const NEWS_HEADING_ROW_CLASS = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2"

/**
 * The row at the top of a page shell, with the page title at the left and the page's action at the right.
 */
export const PAGE_HEADER_CLASS = "flex items-center justify-between gap-4"

/**
 * An image's loading state at 3:2: the muted background, pulsing. The caller sets the width and the corners.
 */
export const IMAGE_SKELETON_CLASS = "bg-muted aspect-[3/2] animate-pulse"

/**
 * A placeholder shape in a page's loading state: the muted fill and a slight corner, pulsing unless the reader asked
 * for reduced motion. The caller sets the size.
 */
export const SKELETON_SHAPE_CLASS = "bg-muted-foreground/20 rounded motion-safe:animate-pulse"

/**
 * The loading state of a button in a page's top row, at the default button's height and a label's width.
 */
export const PAGE_BUTTON_SKELETON_CLASS = "bg-muted h-9 w-28 animate-pulse rounded-md"

/**
 * The loading state of the avatar on a comment row or a finding row, pulsing at the row's own icon size.
 */
export const ROW_AVATAR_SKELETON_CLASS = "bg-muted size-6 shrink-0 animate-pulse rounded-full"

/**
 * A topic image's width in a page header. It is as tall as a podcast episode cover at 3:2, and smaller on a phone.
 */
export const HEADER_TOPIC_IMAGE_CLASS = "w-36 rounded-xs sm:w-54"

/**
 * A topic image in a Topics row: a step narrower than the page header's, with the slight corner a small image keeps.
 */
export const LIST_TOPIC_IMAGE_CLASS = "w-30 rounded-xs sm:w-36"

// the topic header grid's layouts from sm up, by whether the topic has tags and whether the row has actions: the
// title, the byline, and the tags beside the image. the last row stretches to the image's bottom, and the actions
// end it at the right, at its bottom
const TOPIC_HEADER_GRID_CLASSES = {
	tagsAndActions:
		"sm:grid-rows-[auto_auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline'_'image_tags_actions']",
	actions: "sm:grid-rows-[auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_actions']",
	tags: "sm:grid-rows-[auto_auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline'_'image_tags_tags']",
	plain: "sm:grid-rows-[auto_1fr] sm:[grid-template-areas:'image_title_title'_'image_byline_byline']",
}

/**
 * Returns a topic header's classes, with the same space above and below as every image header. On a phone the image
 * floats at the left, so the title, the tags, and the byline sit beside it and run under it only once they pass its
 * bottom. From sm up it is a grid with each part in its named area.
 */
export function toTopicHeaderGridClass({ hasTags, hasActions }: { hasTags: boolean; hasActions: boolean }): string {
	const layoutName = hasTags ? (hasActions ? "tagsAndActions" : "tags") : hasActions ? "actions" : "plain"
	return `my-4 flow-root sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-4 sm:gap-y-1.5 ${TOPIC_HEADER_GRID_CLASSES[layoutName]}`
}

/**
 * The header grid of a page with an image, a title, and a byline, and no tags or actions: a Topic Post's page and a
 * podcast episode's page, loaded or loading, and a topic page while it loads.
 */
export const PLAIN_TOPIC_HEADER_GRID_CLASS = toTopicHeaderGridClass({ hasTags: false, hasActions: false })

/**
 * The classes of a topic header's parts. On a phone the byline row sits under the image and holds the byline with
 * the actions at its right. From sm up the row uses display: contents, so each child takes its own grid area.
 */
export const TOPIC_HEADER_AREA_CLASSES = {
	image: "float-left mr-4 mb-1.5 [grid-area:image] sm:float-none sm:mr-0 sm:mb-0",
	title: "[grid-area:title] min-w-0",
	tags: "[grid-area:tags] mt-1.5 min-w-0 sm:mt-0",
	bylineRow: "mt-1.5 flex items-center justify-between gap-3 max-sm:clear-left sm:contents",
	byline: "[grid-area:byline] min-w-0",
	actions: "[grid-area:actions] shrink-0 sm:self-end",
}

/**
 * The avatar in a profile's or a team's header, at the height of a topic's image on the Topics page: 5rem on a phone
 * and 6rem from sm up.
 */
export const PAGE_AVATAR_CLASS = "size-20 sm:size-24"

// a page header's grid, where the avatar leads and the title always sits beside it. the counts and the description
// each drop to their own full-width row below the avatar as the screen narrows, the description first
export const PAGE_HEADER_GRID_CLASS = "grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2"
export const PAGE_HEADER_AVATAR_CELL_CLASS = "col-start-1 row-start-1 self-center md:row-span-2 lg:row-span-3"
export const PAGE_HEADER_TITLE_CELL_CLASS = "col-start-2 row-start-1 min-w-0"
export const PAGE_HEADER_DETAILS_CELL_CLASS = "col-span-2 min-w-0 md:col-span-1 md:col-start-2"
export const PAGE_HEADER_DESCRIPTION_CELL_CLASS = "col-span-2 min-w-0 lg:col-span-1 lg:col-start-2"

/**
 * The h1 of a page shell: the display font, with the icon of the page's header menu item in front.
 */
export const PAGE_TITLE_CLASS = "font-display flex items-center gap-2 text-2xl"

/**
 * A 20px icon button tile in a line of text or a row. The tile and its tap area reach past the line's height.
 */
export const ICON_TILE_BUTTON_CLASS =
	"relative inline-grid size-5 shrink-0 place-items-center align-middle before:absolute before:-inset-2 before:content-['']"

/**
 * A 28px icon button around a 24px icon tile beside a title. Its tap area reaches past the button.
 */
export const TITLE_ICON_BUTTON_CLASS =
	"relative grid size-7 place-items-center before:absolute before:-inset-2 before:content-['']"

/**
 * The icon tile around a table row's small play button, as big as the button's 24px circle so the circle centers in
 * the row. Its negative margin keeps the row as tall as its text.
 */
export const PLAY_BUTTON_TILE_CLASS = cn(ICON_TILE_BUTTON_CLASS, "-my-0.5 size-6")

/**
 * A wide info popover panel: viewport width on a phone, its own max width above that. The popover-panel
 * marker lets globals.css center it as a sheet on a phone.
 */
export const POPOVER_PANEL_CLASS =
	"popover-panel w-[calc(100vw-2rem)] max-w-lg text-sm max-h-[85dvh] sm:max-h-(--radix-popover-content-available-height)"

/**
 * A popover trigger drawn as a field, such as a combobox: the field's border and fill, and a select trigger's hover and
 * height.
 */
export const FIELD_TRIGGER_CLASS = cn(
	FIELD_CLASS,
	"hover:bg-input/50 flex min-h-9 w-full items-center justify-between rounded-md border px-3 text-sm",
)

/**
 * The option in a popover menu: a phone's touch target, tighter on a pointer. A disabled option fades.
 */
export const MENU_OPTION_CLASS =
	"hover:bg-accent focus-visible:ring-ring/50 mt-1 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none first:mt-0 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 sm:min-h-9"

/**
 * The thin line between groups of options in a menu or an options dialog.
 */
export const MENU_DIVIDER_CLASS = "bg-border my-1 h-px"

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
 * The round primary button at the end of a chat composer, a phone's touch size and tighter on a pointer. The send
 * arrow, the stop square, and the mic share it.
 */
export const SEND_BUTTON_CLASS =
	"bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 sm:size-8"

/**
 * The chat composer's question box. Its text is 16px on a phone, which keeps iOS from zooming in on focus.
 */
export const COMPOSER_BOX_CLASS =
	"placeholder:text-muted-foreground w-full resize-none bg-transparent py-1 text-base leading-relaxed outline-none sm:text-sm"

/**
 * The bordered band at the bottom of a chat panel that holds the chat composer.
 */
export const COMPOSER_BAR_CLASS = "shrink-0 border-t px-3 py-2.5"

/**
 * The rounded frame around the chat composer's question box and its button row.
 */
export const COMPOSER_FRAME_CLASS = "bg-background rounded-2xl border px-3 py-2"

/**
 * The round frame a user's or a team's avatar takes. The caller sets the size.
 */
export const AVATAR_CLASS =
	"inline-block shrink-0 overflow-hidden rounded-full border shadow-raised outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"

/**
 * A chat reply's bubble, Carl's or Vienna's, and the thinking bubble before it.
 */
export const ANSWER_BUBBLE_CLASS =
	"bg-bubble text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm @lg:max-w-[75%]"

/**
 * How wide a user's question bubble and the tag under it grow.
 */
export const QUESTION_BUBBLE_WIDTH_CLASS = "max-w-[85%] @lg:max-w-[75%]"

/**
 * A user's question bubble in a chat turn.
 */
export const QUESTION_BUBBLE_CLASS = `bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap ${QUESTION_BUBBLE_WIDTH_CLASS}`

/**
 * The centered narrow column of the sign-in, signup, and invite pages.
 */
export const SESSION_PAGE_CLASS = "mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12"

/**
 * A table card opened as a subtable under a table row, on the sunken surface with no margin or shadow of its own.
 */
export const SUBTABLE_CARD_CLASS = "bg-sunken mb-0 shadow-none"

/**
 * The muted counts line at the bottom of the topic and podcast episode pages, spaced apart and at a fixed height while
 * the counts load.
 */
export const COUNTS_LINE_CLASS = "text-muted-foreground mt-8 flex h-5 items-center justify-center gap-8 text-sm"
