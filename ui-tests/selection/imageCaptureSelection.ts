// which image captures a run checks: every image capture of a platform whose shared input changed or whose graph is
// uncertain, the stories and cards whose import graphs reach a changed file, or nothing

import type { ImageCapturePlatform } from "../imageCaptures"
import { type DirectImportReader, type ReachedFiles, toReachedFiles } from "../importGraph"
import { type StoryAppName, type StoryFile, toStoryAppName } from "../storyFiles"
import type { DiffBase } from "./diffBase"
import { SHARED_INPUTS, toSharedInputImportSelections } from "./sharedInputs"

/** The groups of image captures that a selection decides on: the web stories, the MCP cards, and the native stories. */
export const SELECTION_PLATFORMS = ["web", "mcp", "native"] as const

/** A group of image captures that a selection decides on. */
export type SelectionPlatform = (typeof SELECTION_PLATFORMS)[number]

/** How much of a platform a run captures. */
export type SelectionMode = "all" | "affected" | "none"

/** A platform's selection: its mode, the reasons for it, the selected story ids, and how many stories it has. */
export type PlatformSelection = { mode: SelectionMode; reasons: string[]; storyIds: string[]; storyCount: number }

/** A run's selection: the commits that it compares, the files that changed, and each platform's selection. */
export type ImageCaptureSelection = {
	baseCommit: string | null
	headCommit: string
	mode: SelectionMode
	reasons: string[]
	changedFiles: string[]
	platforms: Record<SelectionPlatform, PlatformSelection>
}

/** What a selection is made from: the base, the changed files, the story files, and the repo's imports. */
export type ToImageCaptureSelectionOptions = {
	// the commits, and the changed files, or null if the diff could not be read
	diffBase: DiffBase
	headCommit: string
	changedFiles: string[] | null
	// the story files, the story files that could not be read with why, and the card bundle's files
	storyFiles: StoryFile[]
	unreadableStoryFiles: string[]
	mcpCardFilePaths: string[]
	// every file in the repo, and the repo's imports
	knownFilePaths: string[]
	readDirectImports: DirectImportReader
}

// the files that every story of an app renders inside:
// the web preview, and the native preview with its storybook route
const PREVIEW_ROOTS: Record<StoryAppName, string[]> = {
	web: ["apps/web/.storybook/preview.tsx"],
	mobile: ["apps/mobile/.rnstorybook/preview.tsx", "apps/mobile/app/storybook.tsx"],
}

// the platform that each app's stories are captured on
const STORY_PLATFORMS: Record<StoryAppName, SelectionPlatform> = { web: "web", mobile: "native" }

// a baseline image, with its platform folder and its story id
const BASELINE_IMAGE_PATTERN = /^ui-tests\/baselines\/(web|mcp|android|ios)\/([^/]+)\/[^/]+\.png$/

// a platform's selection while it is being decided
type PendingPlatformSelection = { isAll: boolean; isAffected: boolean; reasons: string[]; storyIds: Set<string> }

/**
 * Returns a selection of every image capture on every platform for one reason, for a run whose selection could not be
 * made.
 */
export function toEveryImageCaptureSelection({
	headCommit,
	reason,
}: {
	headCommit: string
	reason: string
}): ImageCaptureSelection {
	const pendingSelections = toEmptyPendingSelections()
	selectEveryPlatform(pendingSelections, reason)
	return {
		baseCommit: null,
		headCommit,
		mode: "all",
		reasons: [reason],
		changedFiles: [],
		platforms: toPlatformSelections(pendingSelections, []),
	}
}

/**
 * Returns the image captures that a run checks on each platform, with the reasons.
 */
export function toImageCaptureSelection(options: ToImageCaptureSelectionOptions): ImageCaptureSelection {
	// one pending selection per platform, and the changed files
	const pendingSelections = toEmptyPendingSelections()
	const changedFiles = options.changedFiles ?? []

	// select everything if the run has no base or no diff, and otherwise select from the changes
	if (options.diffBase.baseCommit === null) {
		selectEveryPlatform(pendingSelections, options.diffBase.reason)
	} else if (options.changedFiles === null) {
		selectEveryPlatform(pendingSelections, "the diff against the base could not be read")
	} else {
		selectFromChanges({ options, pendingSelections, changedFiles: new Set(changedFiles) })
	}

	// each platform's selection, and the run's mode and reasons across them, each reason once
	const platforms = toPlatformSelections(pendingSelections, options.storyFiles)
	const platformReasons = SELECTION_PLATFORMS.flatMap((platform) => platforms[platform].reasons)
	return {
		baseCommit: options.diffBase.baseCommit,
		headCommit: options.headCommit,
		mode: toRunMode(Object.values(platforms).map((platformSelection) => platformSelection.mode)),
		reasons: [...new Set([options.diffBase.reason, ...platformReasons])],
		changedFiles,
		platforms,
	}
}

// select from a readable diff: unreadable story files, shared inputs, changed baselines, and each graph
function selectFromChanges({
	options,
	pendingSelections,
	changedFiles,
}: {
	options: ToImageCaptureSelectionOptions
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>
	changedFiles: Set<string>
}): void {
	// a story file that cannot be read leaves its app's graph uncertain
	for (const unreadableStoryFile of options.unreadableStoryFiles) {
		selectPlatform(
			pendingSelections,
			unreadableStoryFile.startsWith("apps/mobile/") ? "native" : "web",
			unreadableStoryFile,
		)
	}

	// a changed story file with no stories now, as after a deleted story, runs its platform with no story chosen
	selectEmptiedStoryFiles({ options, pendingSelections, changedFiles })

	// every story id, which a changed baseline must name to select its story
	const allStoryIds = toAllStoryIds(options.storyFiles)

	// a changed shared input selects every image capture of the platforms that it names, under the first shared input's
	// name, and a changed baseline selects its own story
	for (const changedFile of changedFiles) {
		const matchingSharedInputs = SHARED_INPUTS.filter((sharedInput) => sharedInput.isSharedInputPath(changedFile))
		const sharedInputPlatforms = new Set(matchingSharedInputs.flatMap((sharedInput) => sharedInput.platforms))
		for (const platform of sharedInputPlatforms) {
			selectPlatform(pendingSelections, platform, `\`${changedFile}\` is ${matchingSharedInputs[0]?.label}`)
		}
		selectChangedBaseline({ pendingSelections, changedFile, allStoryIds })
	}

	// a changed file that a build config or the UI test tooling imports belongs to that shared input
	const sharedInputImportSelections = toSharedInputImportSelections({
		knownFilePaths: options.knownFilePaths,
		readDirectImports: options.readDirectImports,
		changedFiles,
	})
	for (const { platforms, reason } of sharedInputImportSelections) {
		for (const platform of platforms) {
			selectPlatform(pendingSelections, platform, reason)
		}
	}

	// each app's stories and the cards, by their graphs
	selectStoriesByGraph({ options, pendingSelections, changedFiles, appName: "web" })
	selectStoriesByGraph({ options, pendingSelections, changedFiles, appName: "mobile" })
	selectCardsByGraph({ options, pendingSelections, changedFiles })
}

// a changed baseline image selects its own story on its platform, unless the story is gone, as after a deleted baseline
function selectChangedBaseline({
	pendingSelections,
	changedFile,
	allStoryIds,
}: {
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>
	changedFile: string
	allStoryIds: Record<SelectionPlatform, string[]>
}): void {
	// the baseline image's platform folder and story id, if the file is a baseline image
	const baselineMatch = BASELINE_IMAGE_PATTERN.exec(changedFile)
	if (!baselineMatch) {
		return
	}

	// android and ios baselines both belong to the native stories, and a card baseline names its card, not a story
	const platform = toSelectionPlatform(baselineMatch[1] as ImageCapturePlatform)
	const storyId = baselineMatch[2] as string
	if (platform !== "mcp" && !allStoryIds[platform].includes(storyId)) {
		return
	}

	// the story, with the reason once per story
	const pendingSelection = pendingSelections[platform]
	pendingSelection.storyIds.add(storyId)
	pendingSelection.isAffected = true
	addReason(pendingSelection, `the approved baseline of \`${storyId}\` changed`)
}

// run a platform's capture job with no story chosen if a changed story file has no stories now, so the comparison
// reports that file's old baselines as removed
function selectEmptiedStoryFiles({
	options,
	pendingSelections,
	changedFiles,
}: {
	options: ToImageCaptureSelectionOptions
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>
	changedFiles: Set<string>
}): void {
	// the story files that still hold a story
	const filledStoryFilePaths = new Set(
		options.storyFiles.filter((storyFile) => storyFile.storyEntries.length > 0).map((storyFile) => storyFile.filePath),
	)

	// each changed story file path that holds no story now
	for (const changedFile of changedFiles) {
		const appName = toStoryAppName(changedFile)
		if (appName && !filledStoryFilePaths.has(changedFile)) {
			// the app's platform runs with no story chosen, naming the file
			const pendingSelection = pendingSelections[STORY_PLATFORMS[appName]]
			pendingSelection.isAffected = true
			addReason(pendingSelection, `\`${changedFile}\` holds no story now, so its old baselines are checked`)
		}
	}
}

// add a reason to a platform's pending selection once
function addReason(pendingSelection: PendingPlatformSelection, reason: string): void {
	if (!pendingSelection.reasons.includes(reason)) {
		pendingSelection.reasons.push(reason)
	}
}

/**
 * Returns the selection platform for an image capture platform's stories: android and ios share the native one.
 */
export function toSelectionPlatform(imageCapturePlatform: ImageCapturePlatform): SelectionPlatform {
	return imageCapturePlatform === "web" || imageCapturePlatform === "mcp" ? imageCapturePlatform : "native"
}

// select an app's stories whose graph, with the preview that every story renders inside, reaches a changed file
function selectStoriesByGraph({
	options,
	pendingSelections,
	changedFiles,
	appName,
}: {
	options: ToImageCaptureSelectionOptions
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>
	changedFiles: Set<string>
	appName: StoryAppName
}): void {
	// a platform that already selects everything needs no graph
	const platform = STORY_PLATFORMS[appName]
	if (pendingSelections[platform].isAll) {
		return
	}

	// the preview wraps every story.
	// a change that the preview reaches, or an import in the preview that names no file, selects every story
	const previewReachedFiles = toReachedFiles(PREVIEW_ROOTS[appName], options.readDirectImports)
	const previewReason = toGraphReason({
		reachedFiles: previewReachedFiles,
		changedFiles,
		graphName: `the ${platform} preview`,
	})
	if (previewReason) {
		selectPlatform(pendingSelections, platform, previewReason)
		return
	}

	// each story file whose graph reaches a change selects its stories,
	// and a graph with an unresolved import selects every story of the app
	for (const storyFile of options.storyFiles.filter((candidate) => candidate.appName === appName)) {
		const storyReachedFiles = toReachedFiles([storyFile.filePath], options.readDirectImports)
		if (storyReachedFiles.unresolvedImports.length > 0) {
			selectPlatform(pendingSelections, platform, `an import names no file: ${storyReachedFiles.unresolvedImports[0]}`)
			return
		}

		// a graph with no unresolved import selects the file's stories if it reaches a change
		addReachedStories({ pendingSelection: pendingSelections[platform], storyFile, storyReachedFiles, changedFiles })
	}
}

// add a story file's stories if its graph reaches a changed file, with the file that reached it
function addReachedStories({
	pendingSelection,
	storyFile,
	storyReachedFiles,
	changedFiles,
}: {
	pendingSelection: PendingPlatformSelection
	storyFile: StoryFile
	storyReachedFiles: ReachedFiles
	changedFiles: Set<string>
}): void {
	// the first changed file that the story file's graph reaches
	const reachedChangedFile = [...changedFiles].find((changedFile) => storyReachedFiles.filePaths.has(changedFile))
	if (!reachedChangedFile) {
		return
	}

	// select every story in the file, naming the change that selected them
	for (const storyEntry of storyFile.storyEntries) {
		pendingSelection.storyIds.add(storyEntry.storyId)
	}
	pendingSelection.isAffected = true
	const isStoryFileChanged = reachedChangedFile === storyFile.filePath
	pendingSelection.reasons.push(
		isStoryFileChanged
			? `\`${storyFile.filePath}\` changed`
			: `\`${reachedChangedFile}\` reaches \`${storyFile.filePath}\``,
	)
}

// select every card image capture if the card bundle's graph reaches a changed file, or names a file that is missing
function selectCardsByGraph({
	options,
	pendingSelections,
	changedFiles,
}: {
	options: ToImageCaptureSelectionOptions
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>
	changedFiles: Set<string>
}): void {
	// a platform that already selects everything needs no graph
	if (pendingSelections.mcp.isAll) {
		return
	}

	// the card bundle's graph, from every file in the card folder. the cards share one bundle,
	// so a change that the graph reaches, or an import in the graph that names no file, selects every card
	const cardReachedFiles = toReachedFiles(options.mcpCardFilePaths, options.readDirectImports)
	const cardReason = toGraphReason({ reachedFiles: cardReachedFiles, changedFiles, graphName: "the card bundle" })
	if (cardReason) {
		selectPlatform(pendingSelections, "mcp", cardReason)
	}
}

// why a graph selects its image captures: an import in it that names no file, or a changed file that it reaches.
// null if neither
function toGraphReason({
	reachedFiles,
	changedFiles,
	graphName,
}: {
	reachedFiles: ReachedFiles
	changedFiles: Set<string>
	graphName: string
}): string | null {
	// an import that names no file leaves the graph uncertain
	if (reachedFiles.unresolvedImports.length > 0) {
		return `an import in ${graphName}'s graph names no file: ${reachedFiles.unresolvedImports[0]}`
	}

	// the first changed file that the graph reaches
	const reachedChangedFile = [...changedFiles].find((changedFile) => reachedFiles.filePaths.has(changedFile))
	return reachedChangedFile ? `${graphName} reaches \`${reachedChangedFile}\`` : null
}

// one empty pending selection per platform
function toEmptyPendingSelections(): Record<SelectionPlatform, PendingPlatformSelection> {
	const toEmptyPendingSelection = (): PendingPlatformSelection => ({
		isAll: false,
		isAffected: false,
		reasons: [],
		storyIds: new Set(),
	})
	return { web: toEmptyPendingSelection(), mcp: toEmptyPendingSelection(), native: toEmptyPendingSelection() }
}

// select every image capture on every platform, for one reason
function selectEveryPlatform(
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>,
	reason: string,
): void {
	for (const platform of SELECTION_PLATFORMS) {
		selectPlatform(pendingSelections, platform, reason)
	}
}

// select every image capture on one platform, adding the reason once
function selectPlatform(
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>,
	platform: SelectionPlatform,
	reason: string,
): void {
	const pendingSelection = pendingSelections[platform]
	pendingSelection.isAll = true
	if (!pendingSelection.reasons.includes(reason)) {
		pendingSelection.reasons.push(reason)
	}
}

// each pending selection as a platform selection, with every story id for a platform that selects everything
function toPlatformSelections(
	pendingSelections: Record<SelectionPlatform, PendingPlatformSelection>,
	storyFiles: StoryFile[],
): Record<SelectionPlatform, PlatformSelection> {
	// every story id of each platform
	const allStoryIds = toAllStoryIds(storyFiles)

	// each platform's mode and story ids
	const toPlatformSelection = (platform: SelectionPlatform): PlatformSelection => {
		const pendingSelection = pendingSelections[platform]
		const mode: SelectionMode = pendingSelection.isAll ? "all" : pendingSelection.isAffected ? "affected" : "none"
		const storyIds = mode === "all" ? allStoryIds[platform] : [...pendingSelection.storyIds].sort()
		return { mode, reasons: pendingSelection.reasons, storyIds, storyCount: allStoryIds[platform].length }
	}
	return { web: toPlatformSelection("web"), mcp: toPlatformSelection("mcp"), native: toPlatformSelection("native") }
}

// every story id of each platform: the web stories, no card ids, and the native stories
function toAllStoryIds(storyFiles: StoryFile[]): Record<SelectionPlatform, string[]> {
	const toAppStoryIds = (appName: StoryAppName): string[] =>
		storyFiles
			.filter((storyFile) => storyFile.appName === appName)
			.flatMap((storyFile) => storyFile.storyEntries.map((storyEntry) => storyEntry.storyId))
	return { web: toAppStoryIds("web"), mcp: [], native: toAppStoryIds("mobile") }
}

// the run's mode across its platforms: all if every platform is all, none if every platform is none
function toRunMode(platformModes: SelectionMode[]): SelectionMode {
	if (platformModes.every((platformMode) => platformMode === "all")) {
		return "all"
	}
	return platformModes.every((platformMode) => platformMode === "none") ? "none" : "affected"
}
