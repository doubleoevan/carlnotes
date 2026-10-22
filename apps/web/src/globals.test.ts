// the web app's stylesheet loads the Nightshift font stylesheet the component browser links too
import { expect, test } from "bun:test"
import { FONT_STYLESHEET_URL } from "@carlnotes/nightshift/typography"

// the app's stylesheet, read as written
const GLOBALS_CSS = await Bun.file(new URL("./globals.css", import.meta.url)).text()

// the first import is the font stylesheet, by the exact url the source names
test("globals.css imports the Nightshift font stylesheet", () => {
	expect(GLOBALS_CSS.startsWith(`@import url("${FONT_STYLESHEET_URL}");`)).toBe(true)
})
