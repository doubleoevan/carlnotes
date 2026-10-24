// each Nightshift type role as a React Native text style, so a role reads the same on both platforms
import { fontFamilies, type TypeRoleName, typeRoles } from "@carlnotes/nightshift/typography"
import { toPixels } from "@carlnotes/nightshift/units"
import type { TextStyle } from "react-native"

/**
 * Returns a type role's React Native text style: the loaded family's name, the size and line height in pixels, the
 * weight that selects the face, the letter spacing in pixels, and the uppercase transform where the role names one.
 */
export function toTypeRoleStyle(typeRoleName: TypeRoleName): TextStyle {
	// read the role and its optional union fields
	const typeRole = typeRoles[typeRoleName]
	const letterSpacingEm = "letterSpacingEm" in typeRole ? typeRole.letterSpacingEm : undefined
	const isUppercase = "isUppercase" in typeRole && typeRole.isUppercase

	// build the style. rem values resolve to pixels and the em spacing resolves against the font size
	const fontSize = toPixels(typeRole.fontSizeRem)
	return {
		fontFamily: fontFamilies[typeRole.family].name,
		fontSize,
		lineHeight: toPixels(typeRole.lineHeightRem),
		fontWeight: typeRole.fontWeight as TextStyle["fontWeight"],
		...(letterSpacingEm !== undefined && { letterSpacing: Number((letterSpacingEm * fontSize).toFixed(4)) }),
		...(isUppercase && { textTransform: "uppercase" as const }),
	}
}
