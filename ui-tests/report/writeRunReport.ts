// the report step, `bun run visual:report`: merge every platform's report in the output folder into the run's report,
// write the report page beside the images, print the annotations, and add the summary to the run's page. it fails only
// if it cannot read what the capture jobs wrote
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { posix } from "node:path"
import { BASELINES_FOLDER, OUTPUT_FOLDER, readPlatformReports, SELECTION_PATH } from "../imageCaptures"
import { readJsonFile, writeJsonFile } from "../jsonFiles"
import type { ImageCaptureSelection } from "../selection/imageCaptureSelection"
import { toReportPageHtml } from "./reportPage"
import {
	type BaselineFolderSize,
	type JobResult,
	type RunReportInput,
	toRunAnnotations,
	toRunSummary,
} from "./runReport"

// a Git LFS pointer's first line, the line that names its image's size, and the size that every pointer stays under. a
// checkout without Git LFS holds a pointer in place of each image
const LFS_POINTER_FIRST_LINE = "version https://git-lfs.github.com/spec/v1\n"
const LFS_POINTER_SIZE_PATTERN = /^size (\d+)$/m
const LFS_POINTER_BYTE_LIMIT = 1024

// what the run wrote: the selection, each platform's report, the jobs' results, and the approved baselines' size
const runReportInput: RunReportInput = {
	selection: existsSync(SELECTION_PATH) ? readJsonFile<ImageCaptureSelection>(SELECTION_PATH) : null,
	platformReports: readPlatformReports(OUTPUT_FOLDER),
	jobResults: readJobResults(),
	baselineFolderSize: readBaselineFolderSize(),
	runUrl: toRunUrl(),
}

// the merged report and the report page, beside the images that they name
writeJsonFile(posix.join(OUTPUT_FOLDER, "report.json"), runReportInput)
const pageTitle = `UI tests ${Bun.env.GITHUB_RUN_ID ? `run ${Bun.env.GITHUB_RUN_ID}` : "on this machine"}`
writeFileSync(posix.join(OUTPUT_FOLDER, "report.html"), toReportPageHtml(runReportInput.platformReports, pageTitle))

// the annotations, which the workflow reads from the output
for (const annotation of toRunAnnotations(runReportInput.platformReports)) {
	console.log(annotation)
}

// the summary on the run's page, or printed outside a workflow
const runSummary = toRunSummary(runReportInput)
if (Bun.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(Bun.env.GITHUB_STEP_SUMMARY, `${runSummary}\n`)
} else {
	console.log(runSummary)
}

// the approved images in the checkout and their size, or null before any baseline is approved
function readBaselineFolderSize(): BaselineFolderSize | null {
	if (!existsSync(BASELINES_FOLDER)) {
		return null
	}
	const imagePaths = readdirSync(BASELINES_FOLDER, { recursive: true, encoding: "utf8" }).filter((filePath) =>
		filePath.endsWith(".png"),
	)
	const byteCount = imagePaths.reduce(
		(total, imagePath) => total + readImageByteCount(posix.join(BASELINES_FOLDER, imagePath)),
		0,
	)
	return { imageCount: imagePaths.length, byteCount }
}

// an image's size. the report job's checkout holds Git LFS pointers, so a pointer's size line counts in place of the
// file's own size
function readImageByteCount(imagePath: string): number {
	// a file too large to be a pointer is the image itself
	const fileByteCount = statSync(imagePath).size
	if (fileByteCount >= LFS_POINTER_BYTE_LIMIT) {
		return fileByteCount
	}

	// a pointer names the size of its image
	const fileText = readFileSync(imagePath, "utf8")
	const sizeMatch = fileText.startsWith(LFS_POINTER_FIRST_LINE) ? LFS_POINTER_SIZE_PATTERN.exec(fileText) : null
	return sizeMatch ? Number(sizeMatch[1]) : fileByteCount
}

// each reported job's result, from the needs context that the workflow passes in
function readJobResults(): Record<string, JobResult> {
	const needsContext = JSON.parse(Bun.env.UI_TESTS_NEEDS ?? "{}") as Record<string, { result: JobResult }>
	return Object.fromEntries(Object.entries(needsContext).map(([jobName, jobNeeds]) => [jobName, jobNeeds.result]))
}

// the url of this workflow run, or null outside a workflow
function toRunUrl(): string | null {
	const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = Bun.env
	return GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null
}
