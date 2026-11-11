// the classes both buttons of a screen's top row add to the default Button, so the two draw at one size: the web's
// side padding beside an icon, and a border on both so their boxes match
const PAGE_BUTTON_SIZE_CLASS = "border px-3"

// the plain button at the left of a screen's top row, as the web's plain page button draws it: the card's fill and
// border, a muted label, and an icon that alone takes the highlight color
export const PLAIN_PAGE_BUTTON_CLASS = `${PAGE_BUTTON_SIZE_CLASS} border-border bg-card active:bg-accent`
export const PLAIN_PAGE_BUTTON_TEXT_CLASS = "text-muted-foreground"
export const PLAIN_PAGE_BUTTON_ICON_CLASS = "size-4 text-primary"

// the one highlighted button at the right of a screen's top row or of a titled header row. it differs from the plain
// button in its fill alone
export const HIGHLIGHTED_PAGE_BUTTON_CLASS = `${PAGE_BUTTON_SIZE_CLASS} border-transparent`

// the row of buttons under the search bar. each screen adds the margins that keep 16 points above the row, from the
// search bar, and 16 points below it, to the screen's header
export const PAGE_BUTTON_ROW_CLASS = "flex-row flex-wrap items-start justify-between gap-3"

// the row of buttons above an avatar header, loaded or loading. the negative margin leaves 16 points above the row,
// under the search bar's margin and the screen's top padding, as the row's margin leaves below it
export const AVATAR_HEADER_BUTTON_ROW_CLASS = `-mt-1 mb-4 ${PAGE_BUTTON_ROW_CLASS}`
