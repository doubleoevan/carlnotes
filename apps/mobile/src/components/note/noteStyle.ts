import { colors } from "@carlnotes/nightshift/colors"
import { NOTE_BODY_LEADING, toNoteHtmlStyle } from "@carlnotes/nightshift/noteHtmlStyle"
import { fontFamilies, typeRoles } from "@carlnotes/nightshift/typography"
import { toPixels } from "@carlnotes/nightshift/units"
import { useUniwind } from "uniwind"

/**
 * Resolves the same note typography and palette as web into native editor styles.
 */
export function useNoteStyle(): {
	htmlStyle: ReturnType<typeof toNoteHtmlStyle>
	placeholderColor: string
	bodyStyle: { fontFamily: string; fontSize: number; lineHeight: number; color: string }
} {
	const { theme } = useUniwind()
	const mode = theme === "dark" ? "dark" : "light"
	const palette = {
		foreground: colors.foreground[mode],
		mutedForeground: colors.mutedForeground[mode],
		muted: colors.muted[mode],
		border: colors.border[mode],
		link: colors.link[mode],
		primary: colors.primary[mode],
	}
	return {
		htmlStyle: toNoteHtmlStyle(palette),
		placeholderColor: palette.mutedForeground,
		bodyStyle: {
			fontFamily: fontFamilies.sans.name,
			fontSize: toPixels(typeRoles.body.fontSizeRem),
			lineHeight: toPixels(typeRoles.body.fontSizeRem) * NOTE_BODY_LEADING,
			color: palette.foreground,
		},
	}
}
