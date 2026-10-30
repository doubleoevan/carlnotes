// story files read with Storybook's loader: a one-line meta, the file's tags before a story's own, a file without a
// title, and the apps' story folders
import { expect, test } from "bun:test"
import { readStoryFile, toStoryAppName } from "./storyFiles"

// a story file whose meta sits on one line, with a tag on the file and one on a story
const ONE_LINE_META_STORY_FILE = [
	'import type { Meta, StoryObj } from "@storybook/tanstack-react"',
	'const meta = { title: "Table/DataTable", tags: ["no-screenshot"] } satisfies Meta',
	"export default meta",
	"type Story = StoryObj<typeof meta>",
	"export const Default: Story = {}",
	'export const IconSizes: Story = { tags: ["!autodocs"] }',
].join("\n")

// each story's id matches the component browser's, and its tags start with the file's
test("a one-line meta gives each story its id and tags", () => {
	const storyFile = readStoryFile({
		appName: "web",
		filePath: "apps/web/src/components/table/DataTable.stories.tsx",
		fileText: ONE_LINE_META_STORY_FILE,
	})
	expect(storyFile.storyEntries).toEqual([
		{ storyId: "table-datatable--default", tags: ["no-screenshot"] },
		{ storyId: "table-datatable--icon-sizes", tags: ["no-screenshot", "!autodocs"] },
	])
})

// a file with no title has no id to select by, so reading the file throws an error with the file's path
test("a story file without a title cannot be read", () => {
	const untitledStoryFile = ONE_LINE_META_STORY_FILE.replace('title: "Table/DataTable", ', "")
	expect(() =>
		readStoryFile({ appName: "web", filePath: "apps/web/src/Untitled.stories.tsx", fileText: untitledStoryFile }),
	).toThrow("apps/web/src/Untitled.stories.tsx names no story title")
})

// only a story file inside an app's source folder belongs to that app
test("story files belong to the app whose source folder holds them", () => {
	expect(toStoryAppName("apps/web/src/components/common/Card.stories.tsx")).toBe("web")
	expect(toStoryAppName("apps/mobile/src/components/Badge.stories.tsx")).toBe("mobile")
	expect(toStoryAppName("apps/web/src/components/common/Card.tsx")).toBeNull()
	expect(toStoryAppName("apps/docs/src/Card.stories.tsx")).toBeNull()
})
