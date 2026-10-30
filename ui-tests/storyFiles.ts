// the stories that a story file holds, read with Storybook's own CSF loader, so each id matches the component browser's
import { loadCsf } from "storybook/internal/csf-tools"
import { STORY_FILE_PATTERN } from "../scripts/workspaces"

/** The app that a story file belongs to. */
export type StoryAppName = "web" | "mobile"

/** One story: its id and its tags, the file's tags included. */
export type StoryEntry = { storyId: string; tags: string[] }

/** A story file: its app, its path, and its stories. */
export type StoryFile = { appName: StoryAppName; filePath: string; storyEntries: StoryEntry[] }

// each app's story files, by folder
const STORY_FOLDERS: Record<StoryAppName, string> = { web: "apps/web/src/", mobile: "apps/mobile/src/" }

/**
 * Returns the app that a path's story file belongs to, or null for a path that is not a story file.
 */
export function toStoryAppName(filePath: string): StoryAppName | null {
	// a story file inside the web or the mobile app's source folder
	if (!STORY_FILE_PATTERN.test(filePath)) {
		return null
	}
	const appNames = Object.keys(STORY_FOLDERS) as StoryAppName[]
	return appNames.find((appName) => filePath.startsWith(STORY_FOLDERS[appName])) ?? null
}

/**
 * Returns a story file's stories with their ids and tags. Throws an error if the file has no title or cannot be parsed.
 */
export function readStoryFile({
	appName,
	filePath,
	fileText,
}: {
	appName: StoryAppName
	filePath: string
	fileText: string
}): StoryFile {
	// parse the file the way the component browser indexes it. a file without a title has no id to select by
	const makeTitle = (userTitle?: string): string => toRequiredTitle(userTitle, filePath)
	const parsedCsfFile = loadCsf(fileText, { makeTitle, fileName: filePath }).parse()

	// each story's id, with the file's tags before its own
	const fileTags = parsedCsfFile.meta?.tags ?? []
	const storyEntries = parsedCsfFile.stories.map((staticStory) => ({
		storyId: staticStory.id,
		tags: [...fileTags, ...(staticStory.tags ?? [])],
	}))
	return { appName, filePath, storyEntries }
}

// the title that a file names, or an error that names the file
function toRequiredTitle(userTitle: string | undefined, filePath: string): string {
	if (!userTitle) {
		throw new Error(`${filePath} names no story title`)
	}
	return userTitle
}
