// the inline styles the Nightshift pages share. Tailwind does not scan this folder, so the pages set their layout and
// text colors inline from the palette's custom properties
import { toRadiusCssValue } from "@carlnotes/nightshift/radius"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import type { CSSProperties } from "react"

// the monospace stack for a token's name, a value, and a class list
const CODE_FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace"

// the card a page section sits on, in the body font and the card's text color in either mode
export const SECTION_CARD_STYLE: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "1.5rem",
	margin: "1rem 0",
	padding: "1.25rem",
	listStyle: "none",
	border: "1px solid var(--border)",
	borderRadius: toRadiusCssValue("lg"),
	background: "var(--card)",
	color: "var(--card-foreground)",
	fontFamily: fontFamilies.sans.stack,
}

// a token's or a role's name
export const NAME_STYLE: CSSProperties = { margin: 0, fontSize: "0.9375rem", fontWeight: 600 }

// a description, in the muted text color
export const DESCRIPTION_STYLE: CSSProperties = { margin: 0, fontSize: "0.875rem", color: "var(--muted-foreground)" }

// a custom property, a value, a font stack, or a class list
export const CODE_STYLE: CSSProperties = {
	margin: 0,
	fontFamily: CODE_FONT_STACK,
	fontSize: "0.75rem",
	overflowWrap: "anywhere",
}
