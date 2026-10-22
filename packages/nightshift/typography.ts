// the font families and the type roles the web app renders, each role mapped onto its Tailwind classes

/** A font family: the name a design tool shows, and the CSS stack that falls back from it. */
export type FontFamily = { name: string; stack: string; description: string }

/**
 * The font families. The email stack is the system's own, because web fonts do not load in most email clients.
 */
export const fontFamilies = {
	sans: {
		name: "Karla",
		stack: '"Karla", ui-sans-serif, system-ui, sans-serif',
		description: "the body font",
	},
	display: {
		name: "Architects Daughter",
		stack: '"Architects Daughter", ui-sans-serif, cursive',
		description: "the display font, for titles, headings, and the uppercase section label",
	},
	email: {
		name: "System UI",
		stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
		description: "the system font stack every email renders in",
	},
} satisfies Record<string, FontFamily>

/** A font family's key. */
export type FontFamilyName = keyof typeof fontFamilies

/**
 * The stylesheet that loads both web font families.
 */
export const FONT_STYLESHEET_URL =
	"https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Karla:wght@400;500;600;700&display=swap"

/**
 * A type role: the family, the size and line height in rem, the weight, the letter spacing in em, whether it is
 * uppercase, and the Tailwind classes that give those values.
 */
export type TypeRole = {
	// the family and the classes
	family: Exclude<FontFamilyName, "email">
	className: string
	// the values those classes give
	fontSizeRem: number
	lineHeightRem: number
	fontWeight: number
	letterSpacingEm?: number
	isUppercase?: boolean
	description: string
}

/**
 * The type roles the web app renders, largest first. A role's size and line height are the values its classes give
 * in Tailwind's default theme.
 */
export const typeRoles = {
	display: {
		family: "display",
		className: "font-display text-4xl leading-tight",
		fontSizeRem: 2.25,
		lineHeightRem: 2.8125,
		fontWeight: 400,
		description: "the hero tagline, which steps down to text-2xl below the sm breakpoint",
	},
	pageTitle: {
		family: "display",
		className: "font-display text-2xl",
		fontSizeRem: 1.5,
		lineHeightRem: 2,
		fontWeight: 400,
		description: "a page's h1, and a dialog's title at a tighter line height",
	},
	sectionHeading: {
		family: "display",
		className: "font-display text-lg",
		fontSizeRem: 1.125,
		lineHeightRem: 1.75,
		fontWeight: 400,
		description: "a collapsible section's title, a popover's heading, and an h2 or h3",
	},
	label: {
		family: "sans",
		className: "text-sm font-semibold",
		fontSizeRem: 0.875,
		lineHeightRem: 1.25,
		fontWeight: 600,
		description: "a settings heading and emphasis in a table",
	},
	body: {
		family: "sans",
		className: "text-sm",
		fontSizeRem: 0.875,
		lineHeightRem: 1.25,
		fontWeight: 400,
		description: "the default text of tables, menus, popovers, dialogs, and cards",
	},
	bodyLarge: {
		family: "sans",
		className: "text-base",
		fontSizeRem: 1,
		lineHeightRem: 1.5,
		fontWeight: 400,
		description: "a field or a composer on a phone, large enough that the phone does not zoom, then body from sm",
	},
	caption: {
		family: "sans",
		className: "text-xs",
		fontSizeRem: 0.75,
		lineHeightRem: 1,
		fontWeight: 400,
		description: "metadata, tooltips, badges, and table pagination",
	},
	sectionLabel: {
		family: "display",
		className: "font-display text-xs tracking-wide uppercase",
		fontSizeRem: 0.75,
		lineHeightRem: 1,
		fontWeight: 400,
		letterSpacingEm: 0.025,
		isUppercase: true,
		description: "the uppercase label above a field or a group",
	},
} satisfies Record<string, TypeRole>

/** A type role's name. */
export type TypeRoleName = keyof typeof typeRoles
