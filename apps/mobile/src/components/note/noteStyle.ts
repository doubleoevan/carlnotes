import { colors } from "@carlnotes/nightshift/colors"
import { NOTE_BODY_LEADING, toNoteHtmlStyle } from "@carlnotes/nightshift/noteHtmlStyle"
import { fontFamilies, typeRoles } from "@carlnotes/nightshift/typography"
import { toPixels } from "@carlnotes/nightshift/units"
import { useColorMode } from "@/theme"

/**
 * Resolves the same note typography and palette as web into native editor styles.
 */
export function useNoteStyle(): {
	htmlStyle: ReturnType<typeof toNoteHtmlStyle>
	placeholderColor: string
	bodyStyle: { fontFamily: string; fontSize: number; lineHeight: number; color: string }
} {
	const colorMode = useColorMode()
	const palette = {
		foreground: colors.foreground[colorMode],
		mutedForeground: colors.mutedForeground[colorMode],
		muted: colors.muted[colorMode],
		border: colors.border[colorMode],
		link: colors.link[colorMode],
		primary: colors.primary[colorMode],
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
