// the values an email reads: the Latte palette, the system font stack, and a type role's size in pixels. Gmail and
// Outlook ignore CSS custom properties, so an email inlines these values
import { latte } from "./colors"
import { fontFamilies, type TypeRoleName, typeRoles } from "./typography"
import { toPixels } from "./units"

/**
 * The colors an email renders in: the Latte palette, the light mode values.
 */
export const emailColors = latte

// the font stack every email renders in
export const EMAIL_FONT_STACK = fontFamilies.email.stack

/**
 * Returns a type role's size as pixels, at the browser's default 16-pixel rem, for an email's inline style.
 */
export function toEmailFontSize(typeRoleName: TypeRoleName): string {
	return `${toPixels(typeRoles[typeRoleName].fontSizeRem)}px`
}
