// every primitive and shared component has a story in the component browser, beside it
import { expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

// the folders whose every component the browser shows
const FOLDERS_WITH_STORIES = ["primitives", "common", "table", "layout"]

// a component file: a .tsx file that is not a test or a story
const COMPONENT_FILE_PATTERN = /^(?!.*\.(test|stories)\.tsx$).*\.tsx$/

// each component file in each folder has a sibling <name>.stories.tsx
for (const folder of FOLDERS_WITH_STORIES) {
	test(`every component in components/${folder} has a story`, () => {
		const folderPath = join(import.meta.dir, folder)
		const componentFileNames = readdirSync(folderPath).filter((fileName) => COMPONENT_FILE_PATTERN.test(fileName))
		const componentFileNamesWithoutStory = componentFileNames.filter(
			(fileName) => !existsSync(join(folderPath, fileName.replace(/\.tsx$/, ".stories.tsx"))),
		)
		expect(componentFileNamesWithoutStory).toEqual([])
	})
}
