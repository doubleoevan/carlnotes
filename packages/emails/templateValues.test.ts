// every color and font size in a template comes from Nightshift, so no template writes a hex or rgb color or a pixel size
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// a hex or rgb color, and a font size written in pixels or as a bare number
const COLOR_LITERAL_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\(/gi
const PIXEL_FONT_SIZE_PATTERN = /fontSize:\s*(?:["'`]\d+px|\d+)/g

// every template and the shell
const TEMPLATE_FILE_NAMES = readdirSync(import.meta.dir).filter(
	(fileName) => fileName.endsWith(".tsx") && !fileName.includes(".test."),
)

// each template names its colors and sizes by token or type role
for (const fileName of TEMPLATE_FILE_NAMES) {
	test(`${fileName} writes no hex or rgb color and no pixel font size`, () => {
		const fileText = readFileSync(join(import.meta.dir, fileName), "utf8")
		expect(fileText.match(COLOR_LITERAL_PATTERN) ?? []).toEqual([])
		expect(fileText.match(PIXEL_FONT_SIZE_PATTERN) ?? []).toEqual([])
	})
}
