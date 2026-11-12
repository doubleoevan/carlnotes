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
 * A small number input an admin types a setting into.
 */
export const ADMIN_NUMBER_INPUT_CLASS = "w-16 rounded-md border px-1 py-0.5"

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

/**
 * The accordion sections under an avatar header, pulled up so the first section's title sits 1rem under the avatar, as
 * far as the avatar sits under the page's heading row.
 */
export const SECTIONS_UNDER_AVATAR_HEADER_CLASS = "-mt-2"

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
 * An image still to be drawn: its empty frame pulses unless the user asked for reduced motion.
 */
export const PENDING_IMAGE_CLASS = "motion-safe:animate-pulse"

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
 * A topic image in a Topics row: a step narrower than the page header's, with the slight corner a small image keeps.
 */
export const LIST_TOPIC_IMAGE_CLASS = "w-30 rounded-xs sm:w-36"

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
 * The round frame a user's or a team's avatar takes. The caller sets the size.
 */
export const AVATAR_CLASS =
	"inline-block shrink-0 overflow-hidden rounded-full border shadow-raised outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"

/**
 * The centered narrow column of the sign-in, signup, and invite pages.
 */
export const SESSION_PAGE_CLASS = "mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12"

/**
 * The muted counts line at the bottom of the topic and podcast episode pages, spaced apart and at a fixed height while
 * the counts load.
 */
export const COUNTS_LINE_CLASS = "text-muted-foreground mt-8 flex h-5 items-center justify-center gap-8 text-sm"

/**
 * The Visitors line at the bottom of the profile, team, and Topic Post pages: the counts line, one line high while it
 * is empty, wrapping its Dashboard links on a phone.
 */
export const VIEWER_COUNT_LINE_CLASS = cn(COUNTS_LINE_CLASS, "h-auto min-h-5 flex-wrap gap-y-2")
