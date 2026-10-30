// the shared inputs: the files that every image capture of a platform depends on without any story importing them. a
// change to a shared input selects every image capture of each platform that the shared input names
import { type DirectImportReader, type ReachedFiles, toReachedFiles } from "../importGraph"
import type { SelectionPlatform } from "./imageCaptureSelection"

/**
 * A kind of shared input: how to recognize it, how the summary names it, the platforms that it selects, and whether
 * the files that its own files import belong to it too, such as a plugin that the web build config loads.
 */
export type SharedInput = {
	label: string
	platforms: SelectionPlatform[]
	isSharedInputPath: (filePath: string) => boolean
	isImportGraphIncluded?: boolean
}

// every platform
const EVERY_PLATFORM: SelectionPlatform[] = ["web", "mcp", "native"]

// the platforms that the web app renders: its stories and its cards
const WEB_PLATFORMS: SelectionPlatform[] = ["web", "mcp"]

// a dependency manifest, the lockfile, the install settings, a dependency patch, or the Bun version
const DEPENDENCY_PATH_PATTERN = /(?:^|\/)package\.json$|^bun\.lock$|^bunfig\.toml$|^\.bun-version$|^patches\//

// a TypeScript config, whose paths decide how imports resolve
const TYPESCRIPT_CONFIG_PATTERN = /(?:^|\/)tsconfig(?:\.base)?\.json$/

// the web and mobile build configs
const WEB_BUILD_CONFIG_PATTERN = /^apps\/web\/(?:vite\.config\.ts|vite\.mcpCards\.config\.ts|components\.json)$/
const MOBILE_BUILD_CONFIG_PATTERN = /^apps\/mobile\/(?:metro\.config\.js|app\.config\.ts|babel\.config\.js|eas\.json)$/

/** The shared inputs, each with the platforms whose every image capture it selects. */
export const SHARED_INPUTS: SharedInput[] = [
	{
		label: "a Nightshift token source or a stylesheet written from one",
		platforms: EVERY_PLATFORM,
		isSharedInputPath: (filePath) => /^packages\/nightshift\/[^/]+$/.test(filePath) && !isGuideOrTestPath(filePath),
	},
	{
		label: "a web stylesheet",
		platforms: WEB_PLATFORMS,
		isSharedInputPath: (filePath) => filePath.endsWith(".css") && !filePath.startsWith("apps/mobile/"),
	},
	{
		label: "a mobile stylesheet",
		platforms: ["native"],
		isSharedInputPath: (filePath) => filePath.endsWith(".css") && filePath.startsWith("apps/mobile/"),
	},
	{
		label: "in the web component browser's own folder",
		platforms: ["web"],
		isSharedInputPath: (filePath) => filePath.startsWith("apps/web/.storybook/"),
	},
	{
		label: "in the mobile component browser's own folder",
		platforms: ["native"],
		isSharedInputPath: (filePath) => filePath.startsWith("apps/mobile/.rnstorybook/"),
	},
	{
		label: "a dependency manifest, the lockfile, a dependency patch, or the Bun version",
		platforms: EVERY_PLATFORM,
		isSharedInputPath: (filePath) => DEPENDENCY_PATH_PATTERN.test(filePath),
	},
	{
		label: "a TypeScript config",
		platforms: EVERY_PLATFORM,
		isSharedInputPath: (filePath) => TYPESCRIPT_CONFIG_PATTERN.test(filePath),
	},
	{
		label: "the web build config",
		platforms: WEB_PLATFORMS,
		isSharedInputPath: (filePath) => WEB_BUILD_CONFIG_PATTERN.test(filePath),
		isImportGraphIncluded: true,
	},
	{
		label: "a file the web app serves from its public folder",
		platforms: WEB_PLATFORMS,
		isSharedInputPath: (filePath) => filePath.startsWith("apps/web/public/"),
	},
	{
		label: "the mobile build config",
		platforms: ["native"],
		isSharedInputPath: (filePath) => MOBILE_BUILD_CONFIG_PATTERN.test(filePath),
		isImportGraphIncluded: true,
	},
	{
		label: "part of the UI test tooling",
		platforms: EVERY_PLATFORM,
		isSharedInputPath: (filePath) => isUiTestToolingPath(filePath),
		isImportGraphIncluded: true,
	},
	{
		label: "the UI tests workflow",
		platforms: EVERY_PLATFORM,
		isSharedInputPath: (filePath) => filePath === ".github/workflows/ui-tests.yml",
	},
]

/** A shared input that a change reaches through its imports: the platforms that it selects, and the reason. */
export type SharedInputImportSelection = { platforms: SelectionPlatform[]; reason: string }

// a script file, whose imports the selection can follow
const SCRIPT_FILE_PATTERN = /\.[cm]?[jt]sx?$/

/**
 * Returns each shared input that selects its platforms through its imports: a build config or the UI test tooling whose
 * own script files import a changed file, or make an import that names no file, with the reason. A change to the
 * shared input's own files is left to the path check.
 */
export function toSharedInputImportSelections({
	knownFilePaths,
	readDirectImports,
	changedFiles,
}: {
	knownFilePaths: string[]
	readDirectImports: DirectImportReader
	changedFiles: Set<string>
}): SharedInputImportSelection[] {
	return SHARED_INPUTS.filter((sharedInput) => sharedInput.isImportGraphIncluded).flatMap((sharedInput) => {
		// the shared input's own script files, and the files that they import
		const sharedInputFilePaths = knownFilePaths.filter(
			(filePath) => SCRIPT_FILE_PATTERN.test(filePath) && sharedInput.isSharedInputPath(filePath),
		)
		const sharedInputReachedFiles = toReachedFiles(sharedInputFilePaths, readDirectImports)

		// the reason that the imports select the shared input's platforms, if there is one
		const reason = toSharedInputImportReason({
			sharedInputLabel: sharedInput.label,
			sharedInputFilePaths: new Set(sharedInputFilePaths),
			sharedInputReachedFiles,
			changedFiles,
		})
		return reason ? [{ platforms: sharedInput.platforms, reason }] : []
	})
}

// why a shared input's imports select its platforms: an import among them that names no file, or a changed file among
// them. null if neither
function toSharedInputImportReason({
	sharedInputLabel,
	sharedInputFilePaths,
	sharedInputReachedFiles,
	changedFiles,
}: {
	sharedInputLabel: string
	sharedInputFilePaths: Set<string>
	sharedInputReachedFiles: ReachedFiles
	changedFiles: Set<string>
}): string | null {
	// an import that names no file
	const unresolvedImport = sharedInputReachedFiles.unresolvedImports[0]
	if (unresolvedImport) {
		return `an import in ${sharedInputLabel} names no file: ${unresolvedImport}`
	}

	// the first changed file that the shared input imports, which is not one of the shared input's own files
	const importedChangedFile = [...changedFiles].find(
		(changedFile) => sharedInputReachedFiles.filePaths.has(changedFile) && !sharedInputFilePaths.has(changedFile),
	)
	return importedChangedFile ? `\`${importedChangedFile}\` is imported by ${sharedInputLabel}` : null
}

// a file of the UI test tooling that can change an image capture: not a baseline, a guide, or a unit test
function isUiTestToolingPath(filePath: string): boolean {
	const isToolingFolder = filePath.startsWith("ui-tests/") && !filePath.startsWith("ui-tests/baselines/")
	return isToolingFolder && !isGuideOrTestPath(filePath)
}

// a guide or a unit test, which no capture page renders
function isGuideOrTestPath(filePath: string): boolean {
	return filePath.endsWith(".md") || filePath.endsWith(".test.ts")
}
