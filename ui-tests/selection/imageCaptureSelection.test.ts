// the selection over a fixture repo: a component change, a shared core change, the preview's toast host, a server-only
// change, a token, the lockfile, an unresolved import, an unreadable story file, a file that the web build config
// imports, a failed diff, an approved baseline, a removed story's baseline, a docs-only change, and a failed selection
import { expect, test } from "bun:test"
import { toDirectImportReader } from "../importGraph"
import type { StoryFile } from "../storyFiles"
import {
	type ImageCaptureSelection,
	toEveryImageCaptureSelection,
	toImageCaptureSelection,
} from "./imageCaptureSelection"

// the fixture repo's files and their text: two web stories, one native story, the previews, a card, the web build
// config with its plugin, and a worker file
const FIXTURE_FILES = new Map<string, string>([
	["apps/web/.storybook/preview.tsx", 'import { Toaster } from "@/components/primitives/sonner"\n'],
	["apps/web/src/components/primitives/sonner.tsx", "export const Toaster = () => null\n"],
	["apps/web/src/components/common/IconButton.tsx", 'import { Badge } from "@carlnotes/core/components/Badge"\n'],
	["apps/web/src/components/common/IconButton.stories.tsx", 'import { IconButton } from "./IconButton"\n'],
	["apps/web/src/components/common/Card.tsx", 'import type { IconButton } from "./IconButton"\n'],
	["apps/web/src/components/common/Card.stories.tsx", 'import { Card } from "./Card"\n'],
	["apps/mobile/.rnstorybook/preview.tsx", ""],
	["apps/mobile/app/storybook.tsx", ""],
	["apps/mobile/src/components/Badge.stories.tsx", 'import { Badge } from "@carlnotes/core/components/Badge"\n'],
	["packages/core/components/Badge.tsx", ""],
	["apps/web/src/mcpCards/main.tsx", 'import { IconButton } from "@/components/common/IconButton"\n'],
	["apps/worker/scan.ts", ""],
	["apps/docs/src/content/docs/index.mdx", ""],
	["packages/nightshift/colors.ts", ""],
	["apps/web/vite.config.ts", 'import { voiceActivityAssetsPlugin } from "./voiceActivityAssetsPlugin"\n'],
	["apps/web/voiceActivityAssetsPlugin.ts", ""],
])

// the fixture story files, each with its story ids
const STORY_FILES: StoryFile[] = [
	toStoryFile("web", "apps/web/src/components/common/IconButton.stories.tsx", ["common-iconbutton--default"]),
	toStoryFile("web", "apps/web/src/components/common/Card.stories.tsx", ["common-card--default"]),
	toStoryFile("mobile", "apps/mobile/src/components/Badge.stories.tsx", ["primitives-badge--default"]),
]

// a fixture story file with its story ids
function toStoryFile(appName: StoryFile["appName"], filePath: string, storyIds: string[]): StoryFile {
	return { appName, filePath, storyEntries: storyIds.map((storyId) => ({ storyId, tags: [] })) }
}

// select over the fixture repo from a green base, with the given changed files and story files that could not be read
function selectChanges(
	changedFiles: string[] | null,
	fixtureFiles: Map<string, string> = FIXTURE_FILES,
	unreadableStoryFiles: string[] = [],
): ImageCaptureSelection {
	return toImageCaptureSelection({
		diffBase: { baseCommit: "green", reason: "the last green UI tests run checked green" },
		headCommit: "head",
		changedFiles,
		storyFiles: STORY_FILES,
		unreadableStoryFiles,
		mcpCardFilePaths: ["apps/web/src/mcpCards/main.tsx"],
		knownFilePaths: [...fixtureFiles.keys()],
		readDirectImports: toDirectImportReader({
			knownFilePaths: fixtureFiles,
			readFileText: (filePath) => fixtureFiles.get(filePath) ?? "",
		}),
	})
}

// a component selects the stories that render it and the cards that import it, and a type-only import selects nothing
test("a component change selects the stories and cards that reach it", () => {
	const selection = selectChanges(["apps/web/src/components/common/IconButton.tsx"])
	expect(selection.platforms.web).toMatchObject({ mode: "affected", storyIds: ["common-iconbutton--default"] })
	expect(selection.platforms.mcp.mode).toBe("all")
	expect(selection.platforms.native.mode).toBe("none")
})

// a shared core component reaches web stories through a web component, native stories, and the cards
test("a shared core change selects both apps and the cards", () => {
	const selection = selectChanges(["packages/core/components/Badge.tsx"])
	expect(selection.platforms.web.storyIds).toEqual(["common-iconbutton--default"])
	expect(selection.platforms.native).toMatchObject({ mode: "affected", storyIds: ["primitives-badge--default"] })
	expect(selection.platforms.mcp.mode).toBe("all")
})

// the preview wraps every story. a file that the preview imports selects every web story
test("a component that every story renders inside selects every web story", () => {
	const selection = selectChanges(["apps/web/src/components/primitives/sonner.tsx"])
	expect(selection.platforms.web).toMatchObject({
		mode: "all",
		storyIds: ["common-iconbutton--default", "common-card--default"],
	})
})

// a file that no story or card imports selects nothing, and the run says so
test("a server-only change and a docs-only change select nothing", () => {
	for (const changedFile of ["apps/worker/scan.ts", "apps/docs/src/content/docs/index.mdx"]) {
		const selection = selectChanges([changedFile])
		expect(selection.mode).toBe("none")
		expect(selection.changedFiles).toEqual([changedFile])
	}
})

// a token and the lockfile are shared inputs of every platform, and the summary names them
test("a token change and a lockfile change select every image capture", () => {
	const tokenSelection = selectChanges(["packages/nightshift/colors.ts"])
	expect(tokenSelection.mode).toBe("all")
	expect(tokenSelection.reasons).toContain(
		"`packages/nightshift/colors.ts` is a Nightshift token source or a stylesheet written from one",
	)
	expect(selectChanges(["bun.lock"]).mode).toBe("all")
})

// an import that names no file leaves the graph uncertain, so its platform selects everything, naming the import
test("an unresolved import selects everything on its platform", () => {
	const brokenFiles = new Map(FIXTURE_FILES)
	brokenFiles.set("apps/web/src/components/common/Card.tsx", 'import { Missing } from "@/components/common/Missing"\n')
	const selection = selectChanges(["apps/worker/scan.ts"], brokenFiles)
	expect(selection.platforms.web.mode).toBe("all")
	expect(selection.platforms.web.reasons[0]).toContain("@/components/common/Missing")
})

// a story file that could not be read leaves its app's graph uncertain, so every story of that app is selected
test("an unreadable story file selects every story of its app", () => {
	const unreadableStoryFile = "apps/web/src/components/common/Broken.stories.tsx could not be read: Unexpected token"
	const selection = selectChanges(["apps/worker/scan.ts"], FIXTURE_FILES, [unreadableStoryFile])
	expect(selection.platforms.web).toMatchObject({ mode: "all", reasons: [unreadableStoryFile] })
	expect(selection.platforms.native.mode).toBe("none")
})

// a plugin that the web build config loads is part of that config, so it selects every web story and card
test("a file that the web build config imports selects every web image capture", () => {
	const selection = selectChanges(["apps/web/voiceActivityAssetsPlugin.ts"])
	expect(selection.platforms.web.mode).toBe("all")
	expect(selection.platforms.mcp.mode).toBe("all")
	expect(selection.platforms.native.mode).toBe("none")
	expect(selection.platforms.web.reasons[0]).toContain("is imported by the web build config")
})

// an import in a build config that names no file leaves that shared input uncertain, so it selects its platforms
test("an unresolved import in a build config selects its platforms", () => {
	const brokenFiles = new Map(FIXTURE_FILES)
	brokenFiles.set("apps/web/vite.config.ts", 'import { missingPlugin } from "./missingPlugin"\n')
	const selection = selectChanges(["apps/worker/scan.ts"], brokenFiles)
	expect(selection.platforms.web.mode).toBe("all")
	expect(selection.platforms.web.reasons).toEqual([
		"an import in the web build config names no file: ./missingPlugin in apps/web/vite.config.ts",
	])
	expect(selection.platforms.native.mode).toBe("none")
})

// a diff that could not be read selects everything instead of nothing
test("a failed diff selects every image capture", () => {
	expect(selectChanges(null).mode).toBe("all")
})

// an approved baseline selects its own story, so the next run proves the image matches
test("a changed baseline selects its own story", () => {
	const selection = selectChanges(["ui-tests/baselines/web/common-card--default/latte-phone.png"])
	expect(selection.platforms.web).toMatchObject({
		mode: "affected",
		storyIds: ["common-card--default"],
		reasons: ["the approved baseline of `common-card--default` changed"],
	})
	const nativeSelection = selectChanges(["ui-tests/baselines/ios/primitives-badge--default/latte-phone.png"])
	expect(nativeSelection.platforms.native.storyIds).toEqual(["primitives-badge--default"])
})

// a story file that holds no story now runs its platform with no story chosen, so its old baselines are reported
test("a deleted story file runs its platform with no story chosen", () => {
	const selection = selectChanges(["apps/web/src/components/common/Gone.stories.tsx"])
	expect(selection.platforms.web).toMatchObject({ mode: "affected", storyIds: [] })
	expect(selection.platforms.web.reasons[0]).toContain("holds no story now")
	expect(selection.platforms.native.mode).toBe("none")
})

// a deleted baseline of a story that is gone selects nothing
test("a removed story's baseline selects nothing", () => {
	const selection = selectChanges(["ui-tests/baselines/web/common-gone--default/latte-phone.png"])
	expect(selection.platforms.web).toMatchObject({ mode: "none", storyIds: [] })
})

// a selection that failed selects every image capture on every platform, with the failure as the reason
test("a selection that cannot be made selects every image capture", () => {
	const reason = "the selection could not be made: git ls-files failed"
	const selection = toEveryImageCaptureSelection({ headCommit: "head", reason })
	expect(selection).toMatchObject({ baseCommit: null, mode: "all", reasons: [reason], changedFiles: [] })
	expect(Object.values(selection.platforms).map((platformSelection) => platformSelection.mode)).toEqual([
		"all",
		"all",
		"all",
	])
})

// a run with no base selects everything for the base's reason
test("no base selects every image capture for the base's reason", () => {
	const selection = toImageCaptureSelection({
		diffBase: { baseCommit: null, reason: "a scheduled run selects every image capture" },
		headCommit: "head",
		changedFiles: [],
		storyFiles: STORY_FILES,
		unreadableStoryFiles: [],
		mcpCardFilePaths: [],
		knownFilePaths: [],
		readDirectImports: () => ({ importedPaths: [], unresolvedImports: [] }),
	})
	expect(selection.mode).toBe("all")
	expect(selection.platforms.native.storyIds).toEqual(["primitives-badge--default"])
	expect(selection.reasons).toEqual(["a scheduled run selects every image capture"])
})
