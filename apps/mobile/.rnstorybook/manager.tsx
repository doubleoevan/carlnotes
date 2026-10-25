// the component browser's frame, branded Nightshift as the web's is: Carl beside the name, and the sheet, the search,
// the story tree, the bottom bar, and the addons panel in the Dark roast palette in both modes
import { darkRoast } from "@carlnotes/nightshift/colors"
import { toRadiusPixels } from "@carlnotes/nightshift/radius"
import type { ThemePartial } from "@storybook/react-native"
import { FullUI } from "@storybook/react-native-ui"
import { type ComponentProps, useMemo } from "react"
import { Image, Text, View } from "react-native"
import { MAX_FONT_SCALE } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * The frame's theme, merged over Storybook's light and dark bases alike: each surface, text, and control in the
 * Dark roast palette, mapped from the web frame's fields. The brand goes on after the merge, in NightshiftStorybookUI.
 */
export const NIGHTSHIFT_STORYBOOK_THEME: ThemePartial = {
	base: "dark",
	color: {
		// the highlight, the chosen radio's dot, the selected story's fill, and the group and component icons
		primary: darkRoast.primary,
		positive: darkRoast.primary,
		secondary: darkRoast.secondary,
		ultraviolet: darkRoast.primary,
		seafoam: darkRoast.mutedForeground,
		// the text, the selected story's text, and the quiet icons
		defaultText: darkRoast.foreground,
		lightest: darkRoast.foreground,
		inverseText: darkRoast.primaryForeground,
		mediumdark: darkRoast.mutedForeground,
		dark: darkRoast.mutedForeground,
		border: darkRoast.border,
		negative: darkRoast.destructive,
	},
	background: {
		app: darkRoast.card,
		content: darkRoast.card,
		preview: darkRoast.background,
		bar: darkRoast.sunken,
		hoverable: darkRoast.accent,
	},
	textMutedColor: darkRoast.mutedForeground,
	appBorderColor: darkRoast.border,
	appBorderRadius: toRadiusPixels("lg"),
	barBg: darkRoast.sunken,
	barTextColor: darkRoast.mutedForeground,
	barHoverColor: darkRoast.primary,
	barSelectedColor: darkRoast.primary,
	button: { background: darkRoast.secondary, border: darkRoast.border },
	boolean: { background: darkRoast.muted, selectedBackground: darkRoast.secondary },
	input: {
		background: darkRoast.sunken,
		border: darkRoast.input,
		color: darkRoast.foreground,
		borderRadius: toRadiusPixels("md"),
	},
}

/**
 * Storybook's own on-device UI with the Nightshift brand set on the merged theme. Storybook deep-merges the theme it
 * is given, and the merge walks into a React element, so the brand element never goes through it.
 */
export function NightshiftStorybookUI({ theme, ...props }: ComponentProps<typeof FullUI>) {
	const brandedTheme = useMemo(
		() => ({ ...theme, brand: { title: "Nightshift", image: <NightshiftBrand /> } }),
		[theme],
	)
	return <FullUI {...props} theme={brandedTheme} />
}

// Carl's round picture, the app icon, beside the name in the logo type role, drawn in place of Storybook's wordmark.
// the colors are the Dark roast values, not Uniwind utilities, since the frame stays dark while the story toggle
// switches the Uniwind theme
function NightshiftBrand() {
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
			<Image
				source={require("../assets/icon.png")}
				accessibilityLabel="Carl"
				style={{ width: 28, height: 28, borderRadius: 14 }}
			/>
			<Text
				style={[toTypeRoleStyle("logo"), { color: darkRoast.foreground }]}
				numberOfLines={1}
				maxFontSizeMultiplier={MAX_FONT_SCALE}
			>
				Nightshift
			</Text>
		</View>
	)
}
