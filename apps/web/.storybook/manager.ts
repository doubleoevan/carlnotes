// the component browser's frame, branded Nightshift: Carl's avatar beside the name, linked to carlnotes.com, and the
// sidebar and toolbar in the Dark roast palette and Karla
import { darkRoast } from "@carlnotes/nightshift/colors"
import { toRadiusPixels } from "@carlnotes/nightshift/radius"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { addons } from "storybook/manager-api"
import { create } from "storybook/theming"
import carlAvatar from "../src/assets/carl-avatar.png"

// Carl's round avatar beside the name in the display font. Storybook hides the title when a brandImage is set, so the
// avatar is in the title's markup
const BRAND_TITLE = `<span style="display: inline-flex; align-items: center; gap: 10px">
	<img src="${carlAvatar}" alt="Carl" width="28" height="28" style="border-radius: 50%" />
	<span style='font-family: ${fontFamilies.display.stack}; font-size: 20px'>Nightshift</span>
</span>`

// the frame's theme: the brand, then each surface, text, and control in the Dark roast palette
addons.setConfig({
	theme: create({
		base: "dark",
		brandTitle: BRAND_TITLE,
		brandUrl: "https://carlnotes.com",
		brandTarget: "_self",
		colorPrimary: darkRoast.primary,
		colorSecondary: darkRoast.secondary,
		appBg: darkRoast.card,
		appContentBg: darkRoast.card,
		appPreviewBg: darkRoast.background,
		appBorderColor: darkRoast.border,
		appBorderRadius: toRadiusPixels("lg"),
		fontBase: fontFamilies.sans.stack,
		textColor: darkRoast.foreground,
		textInverseColor: darkRoast.primaryForeground,
		textMutedColor: darkRoast.mutedForeground,
		barBg: darkRoast.sunken,
		barTextColor: darkRoast.mutedForeground,
		barHoverColor: darkRoast.primary,
		barSelectedColor: darkRoast.primary,
		buttonBg: darkRoast.secondary,
		buttonBorder: darkRoast.border,
		booleanBg: darkRoast.muted,
		booleanSelectedBg: darkRoast.secondary,
		inputBg: darkRoast.sunken,
		inputBorder: darkRoast.input,
		inputTextColor: darkRoast.foreground,
		inputBorderRadius: toRadiusPixels("md"),
	}),
})
