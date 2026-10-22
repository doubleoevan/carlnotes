// the browser toolbar colors the web app writes by hand match the Nightshift hero colors
import { expect, test } from "bun:test"
import { darkRoast, latte } from "@carlnotes/nightshift/colors"
import { HERO_DARK, HERO_LIGHT } from "./useTheme"

// the installed app's manifest, which tints its splash and toolbar with the dark hero color
const WEB_MANIFEST = (await Bun.file(new URL("../../public/site.webmanifest", import.meta.url)).json()) as {
	background_color: string
	theme_color: string
}

// the theme-color meta follows each mode's hero color
test("the theme-color values match the hero colors", () => {
	expect(HERO_LIGHT).toBe(latte.hero)
	expect(HERO_DARK).toBe(darkRoast.hero)
})

// the manifest uses the dark hero color for both of its colors
test("the web manifest's colors match the dark hero color", () => {
	expect(WEB_MANIFEST.background_color).toBe(darkRoast.hero)
	expect(WEB_MANIFEST.theme_color).toBe(darkRoast.hero)
})
