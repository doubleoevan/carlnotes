// the selection's summary for a run's page: the base, each platform's mode and count, the reasons, and the changed files
import { type ImageCaptureSelection, SELECTION_PLATFORMS } from "./imageCaptureSelection"

// how many changed files and reasons the summary lists before it counts the rest
const SUMMARY_LIST_LIMIT = 30

/**
 * Returns the selection's summary in markdown: the base, each platform's mode and count, the reasons, and the files.
 */
export function toSelectionSummary(selection: ImageCaptureSelection): string {
	// the base, and one table row per platform
	const baseLine = selection.baseCommit ? `Base \`${selection.baseCommit.slice(0, 12)}\`` : "No base"
	const platformRows = SELECTION_PLATFORMS.map((platform) => {
		// a platform selected whole without a story count, as after a failed selection, says every image capture
		const { mode, storyIds, storyCount } = selection.platforms[platform]
		const selectedText =
			mode === "all" && storyCount === 0 ? "every image capture" : `${storyIds.length} of ${storyCount}`
		return `| ${platform} | ${mode} | ${selectedText} |`
	})

	// the reasons and the changed files, each list limited with a count of the rest
	return [
		`### Selection: ${selection.mode}`,
		"",
		`${baseLine}, head \`${selection.headCommit.slice(0, 12)}\`.`,
		"",
		"| platform | mode | selected stories |",
		"|---|---|---|",
		...platformRows,
		"",
		"**Reasons**",
		"",
		...toLimitedList(selection.reasons),
		"",
		`**Changed files** (${selection.changedFiles.length})`,
		"",
		...toLimitedList(selection.changedFiles.map((changedFile) => `\`${changedFile}\``)),
	].join("\n")
}

// a markdown list of at most the summary's limit, with a line naming how many more there are
function toLimitedList(lines: string[]): string[] {
	const listedLines = lines.slice(0, SUMMARY_LIST_LIMIT).map((line) => `- ${line}`)
	const hiddenLineCount = lines.length - listedLines.length
	return hiddenLineCount > 0 ? [...listedLines, `- and ${hiddenLineCount} more`] : listedLines
}
