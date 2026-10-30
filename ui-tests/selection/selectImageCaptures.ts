// the selection step: diff this run's commit against its base, select the image captures that the changes reach, and
// write the selection file, the run's summary, and the job's outputs. any failure while selecting selects every image
// capture, with the failure as the reason. run as `bun run visual:select`, with `--base <commit>` or `--all` on a
// laptop. `--head <commit>` compares two commits instead of the working tree, and reads the import graph from the
// working tree
import { appendFileSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { runCommand } from "../commands"
import { toErrorText } from "../errorText"
import { SELECTION_PATH } from "../imageCaptures"
import { toDirectImportReader } from "../importGraph"
import { readJsonFile, writeJsonFile } from "../jsonFiles"
import { readStoryFile, type StoryFile, toStoryAppName } from "../storyFiles"
import { type DiffBase, toDiffBase, toNameStatusPaths } from "./diffBase"
import {
	type ImageCaptureSelection,
	SELECTION_PLATFORMS,
	toEveryImageCaptureSelection,
	toImageCaptureSelection,
} from "./imageCaptureSelection"
import { toSelectionSummary } from "./selectionSummary"

// the card bundle's folder: its entry and the files that the card build aliases in
const MCP_CARD_FOLDER = "apps/web/src/mcpCards/"

// a test or a story file, which the card bundle never includes
const TEST_OR_STORY_FILE_PATTERN = /\.(?:test|stories)\.tsx?$/

// the command's options: an explicit base and head commit, or every image capture
const { values: commandOptions } = parseArgs({
	args: Bun.argv.slice(2),
	options: { base: { type: "string" }, head: { type: "string" }, all: { type: "boolean", default: false } },
})

// select, then write the selection file, the summary, and the job's outputs
writeSelection(await toCommandSelection())

// the run's selection from its head, its base, the repo's files, and the changes,
// or every image capture with the reason if any step fails
async function toCommandSelection(): Promise<ImageCaptureSelection> {
	try {
		// the head, the base, the repo's files, and the changed files
		const headCommit = runCommand(["git", "rev-parse", commandOptions.head ?? "HEAD"]).trim()
		const diffBase = await toCommandDiffBase(headCommit)
		const knownFilePaths = toLines(runCommand(["git", "ls-files", "--cached", "--others", "--exclude-standard"]))
		const changedFiles = diffBase.baseCommit === null ? [] : readChangedFiles(diffBase.baseCommit, headCommit)

		// the story files and the card bundle's files
		const { storyFiles, unreadableStoryFiles } = readStoryFiles(knownFilePaths)
		const mcpCardFilePaths = knownFilePaths.filter(
			(filePath) => filePath.startsWith(MCP_CARD_FOLDER) && !TEST_OR_STORY_FILE_PATTERN.test(filePath),
		)

		// the image captures that the changes reach
		return toImageCaptureSelection({
			diffBase,
			headCommit,
			changedFiles,
			storyFiles,
			unreadableStoryFiles,
			mcpCardFilePaths,
			knownFilePaths,
			readDirectImports: toDirectImportReader({ knownFilePaths: new Set(knownFilePaths), readFileText: readRepoFile }),
		})
	} catch (error) {
		// the commit as far as it can be named, and the failure as the reason
		const headCommit = commandOptions.head ?? Bun.env.GITHUB_SHA ?? "HEAD"
		return toEveryImageCaptureSelection({
			headCommit,
			reason: `the selection could not be made: ${toErrorText(error)}`,
		})
	}
}

// the base that this run diffs against: the command's own choice on a laptop, or the workflow event's in CI
async function toCommandDiffBase(headCommit: string): Promise<DiffBase> {
	// a laptop run names its base, or selects everything
	if (commandOptions.all) {
		return { baseCommit: null, reason: "the command asked for every image capture" }
	}
	if (commandOptions.base) {
		const baseCommit = runCommand(["git", "rev-parse", commandOptions.base]).trim()
		return { baseCommit, reason: "the command named the base" }
	}

	// a workflow run reads its event
	return toDiffBase({
		eventName: Bun.env.GITHUB_EVENT_NAME ?? "local",
		ref: Bun.env.GITHUB_REF ?? "",
		headCommit,
		beforeCommit: readPushBeforeCommit(),
		isAffectedDispatch: Bun.env.UI_TESTS_SELECTION === "affected",
		findLastGreenCommit,
		isAncestor: async (ancestorCommit, descendantCommit) => isAncestorCommit(ancestorCommit, descendantCommit),
		findMergeBaseWithMain: async () => runCommand(["git", "merge-base", "HEAD", "origin/main"]).trim(),
	})
}

// the commit that the last successful UI tests run on main checked, from a push, the schedule, or a dispatch, never
// from a run that a pull request started. null if no such run has succeeded
async function findLastGreenCommit(): Promise<string | null> {
	const runListOptions = ["--workflow", "ui-tests.yml", "--branch", "main", "--status", "success", "--limit", "20"]
	const trustedRunFilter = '[.[] | select(.event | startswith("pull_request") | not)][0].headSha // empty'
	const jsonOptions = ["--json", "headSha,event", "--jq", trustedRunFilter]
	const listedCommit = runCommand(["gh", "run", "list", ...runListOptions, ...jsonOptions]).trim()
	return listedCommit || null
}

// whether one commit is an ancestor of another.
// any failure, as for a commit that the clone does not have, counts as no
function isAncestorCommit(ancestorCommit: string, descendantCommit: string): boolean {
	return Bun.spawnSync(["git", "merge-base", "--is-ancestor", ancestorCommit, descendantCommit]).exitCode === 0
}

// the push event's previous commit, or null outside a push
function readPushBeforeCommit(): string | null {
	// only a push names a previous commit
	const eventPath = Bun.env.GITHUB_EVENT_PATH
	if (Bun.env.GITHUB_EVENT_NAME !== "push" || !eventPath) {
		return null
	}

	// read it from the event payload
	const pushEvent = readJsonFile<{ before?: string }>(eventPath)
	return pushEvent.before ?? null
}

// every file that differs from the base, renamed files under both names: in the working tree with its untracked files,
// or at the named head commit. null if git cannot diff
function readChangedFiles(baseCommit: string, headCommit: string): string[] | null {
	try {
		// the head commit's changes, if the command names a head commit
		if (commandOptions.head) {
			return toNameStatusPaths(runCommand(["git", "diff", "--name-status", "-M", baseCommit, headCommit])).sort()
		}

		// the working tree's changes and its untracked files, each path once
		const changedPaths = toNameStatusPaths(runCommand(["git", "diff", "--name-status", "-M", baseCommit]))
		const untrackedPaths = toLines(runCommand(["git", "ls-files", "--others", "--exclude-standard"]))
		return [...new Set([...changedPaths, ...untrackedPaths])].sort()
	} catch {
		return null
	}
}

// every story file in either app, and each file that could not be read, with why
function readStoryFiles(filePaths: string[]): { storyFiles: StoryFile[]; unreadableStoryFiles: string[] } {
	const storyFiles: StoryFile[] = []
	const unreadableStoryFiles: string[] = []
	for (const filePath of filePaths) {
		// a path outside the apps' story files is skipped
		const appName = toStoryAppName(filePath)
		if (!appName) {
			continue
		}

		// read the story file, keeping why it could not be read
		try {
			storyFiles.push(readStoryFile({ appName, filePath, fileText: readRepoFile(filePath) }))
		} catch (error) {
			unreadableStoryFiles.push(`${filePath} could not be read: ${toErrorText(error)}`)
		}
	}
	return { storyFiles, unreadableStoryFiles }
}

// a repo file's text, or empty for a file that the working tree no longer has
function readRepoFile(filePath: string): string {
	try {
		return readFileSync(filePath, "utf8")
	} catch {
		return ""
	}
}

// write the selection file, the summary, and each platform's mode as a job output
function writeSelection(selection: ImageCaptureSelection): void {
	// the selection file
	writeJsonFile(SELECTION_PATH, selection)

	// the summary, printed and added to the run's summary in CI
	const selectionSummary = toSelectionSummary(selection)
	console.log(selectionSummary)
	if (Bun.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(Bun.env.GITHUB_STEP_SUMMARY, `${selectionSummary}\n`)
	}

	// each platform's mode, for the jobs that decide whether to run
	if (Bun.env.GITHUB_OUTPUT) {
		const outputLines = SELECTION_PLATFORMS.map((platform) => `${platform}=${selection.platforms[platform].mode}`)
		appendFileSync(Bun.env.GITHUB_OUTPUT, `${outputLines.join("\n")}\n`)
	}
}

// a command's output lines, without empty lines
function toLines(commandOutput: string): string[] {
	return commandOutput.split("\n").filter(Boolean)
}
