// podcast episode copy tests: the topic video section's title is Coffee Break Cinema, the podcast episode page's is
// Coffee Break Film, and no web or mobile source file says Topic Cinema, a rejected name for the section
import { expect, test } from "bun:test"
import { join } from "node:path"
import { PODCAST_EPISODE_VIDEO_SECTION_TITLE, TOPIC_VIDEO_SECTION_TITLE } from "./podcastEpisodeCopy"

// every TypeScript source file, from the repo root
const SOURCE_FILE_GLOB = new Bun.Glob("**/*.{ts,tsx}")

// test files, which may say Topic Cinema to check for it
const TEST_FILE_PATTERN = /\.test\.tsx?$/

// the folders each app's source lives in, from the repo root, with the shared components both apps render
const WEB_SOURCE_FOLDERS = ["apps/web/src", "packages/core"]
const MOBILE_SOURCE_FOLDERS = ["apps/mobile/app", "apps/mobile/src", "packages/core"]

/**
 * Returns the path of every source file in the folders whose text says Topic Cinema, skipping test files and installed
 * packages.
 */
async function toTopicCinemaFilePaths(sourceFolders: string[]): Promise<string[]> {
	const repoRoot = join(import.meta.dir, "../../..")
	const topicCinemaFilePaths: string[] = []
	for (const sourceFolder of sourceFolders) {
		for (const filePath of SOURCE_FILE_GLOB.scanSync({ cwd: join(repoRoot, sourceFolder), absolute: true })) {
			// skip test files and installed packages
			if (TEST_FILE_PATTERN.test(filePath) || filePath.includes("node_modules")) {
				continue
			}
			// keep a source file that says Topic Cinema
			if ((await Bun.file(filePath).text()).includes("Topic Cinema")) {
				topicCinemaFilePaths.push(filePath)
			}
		}
	}
	return topicCinemaFilePaths
}

test("the topic video section's title is Coffee Break Cinema", () => {
	expect(TOPIC_VIDEO_SECTION_TITLE).toBe("Coffee Break Cinema")
})

test("the podcast episode page's film section title is Coffee Break Film", () => {
	expect(PODCAST_EPISODE_VIDEO_SECTION_TITLE).toBe("Coffee Break Film")
})

test("no web source file says Topic Cinema", async () => {
	expect(await toTopicCinemaFilePaths(WEB_SOURCE_FOLDERS)).toEqual([])
})

test("no mobile source file says Topic Cinema", async () => {
	expect(await toTopicCinemaFilePaths(MOBILE_SOURCE_FOLDERS)).toEqual([])
})
