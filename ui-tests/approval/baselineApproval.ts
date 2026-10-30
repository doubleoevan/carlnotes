// approving image captures as baselines: choose the image captures from a run's reports, and reject the approval if any
// chosen image capture cannot be trusted. otherwise copy the chosen image captures into the baselines with their source
// in the manifest, and remove the baselines marked removed if asked
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { posix } from "node:path"
import { readBaselineManifest } from "../compare/compareImageCaptures"
import {
	type BaselineImageSource,
	type BaselineManifest,
	IMAGE_CAPTURE_PLATFORMS,
	isSafeImageCaptureKey,
	type PlatformReport,
	type ReportEntry,
	type ReportStatus,
	readPlatformReports,
	toBaselineImageKey,
	toBaselineManifestPath,
	toImageCaptureLabel,
	toImageCapturePath,
} from "../imageCaptures"
import { readJsonFile, writeJsonFile } from "../jsonFiles"
import { type ImageCaptureSelection, toSelectionPlatform } from "../selection/imageCaptureSelection"

/**
 * The run that an approval reads from: its id, its commit, and the folder that its report artifact was downloaded into.
 */
export type ApprovalRun = { workflowRunId: string; headCommit: string; artifactFolder: string }

/** Which image captures to approve, and what the approval may also do. */
export type ApprovalChoice = {
	platforms: string[]
	storyIds: string[]
	statuses: ReportStatus[]
	isDeletingRemoved: boolean
	isNewEnvironmentAccepted: boolean
}

/**
 * What an approval did: the images that it approved, the baselines that it removed,
 * and every file that it wrote or deleted.
 */
export type ApprovalResult = { approvedLabels: string[]; deletedLabels: string[]; changedPaths: string[] }

/** An approval that the command rejects, with every reason for the rejection. */
export class ApprovalRejection extends Error {
	constructor(readonly rejectionReasons: string[]) {
		super(`the approval was rejected:\n- ${rejectionReasons.join("\n- ")}`)
	}
}

// the statuses whose images an approval copies, and the statuses that it rejects
const APPROVABLE_STATUSES: ReadonlySet<ReportStatus> = new Set(["changed", "new", "passed"])
const REJECTED_STATUSES: ReadonlySet<ReportStatus> = new Set(["error", "unstable"])

/**
 * Approves the chosen image captures of a run on the local HEAD: copies their images into the baselines and records
 * each image's source. Throws an ApprovalRejection error and changes nothing if any chosen image capture cannot be
 * trusted.
 */
export function approveBaselines({
	approvalRun,
	approvalChoice,
	localHeadCommit,
	baselinesFolder,
}: {
	approvalRun: ApprovalRun
	approvalChoice: ApprovalChoice
	localHeadCommit: string
	baselinesFolder: string
}): ApprovalResult {
	// the run's reports, and every reason to reject, found before anything is written
	const platformReports = readArtifactReports(approvalRun.artifactFolder, approvalChoice.platforms)
	const rejectionReasons = toRejectionReasons({
		approvalRun,
		approvalChoice,
		localHeadCommit,
		platformReports,
		baselinesFolder,
	})
	if (rejectionReasons.length > 0) {
		throw new ApprovalRejection(rejectionReasons)
	}

	// copy each chosen image capture and remove each chosen removed baseline, platform by platform
	const approvalResult: ApprovalResult = { approvedLabels: [], deletedLabels: [], changedPaths: [] }
	for (const platformReport of platformReports) {
		const chosenEntries = toChosenEntries(platformReport, approvalChoice)
		approvePlatform({ approvalRun, platformReport, chosenEntries, baselinesFolder, approvalResult })
	}
	return approvalResult
}

// every reason to reject: a run on another commit, an error or unstable image capture, or an unaccepted new environment
function toRejectionReasons({
	approvalRun,
	approvalChoice,
	localHeadCommit,
	platformReports,
	baselinesFolder,
}: {
	approvalRun: ApprovalRun
	approvalChoice: ApprovalChoice
	localHeadCommit: string
	platformReports: PlatformReport[]
	baselinesFolder: string
}): string[] {
	// the run must have captured the local HEAD, and must have a report to approve from
	const rejectionReasons: string[] = []
	if (approvalRun.headCommit !== localHeadCommit) {
		rejectionReasons.push(
			`run ${approvalRun.workflowRunId} captured ${approvalRun.headCommit}, and the local HEAD is ${localHeadCommit}`,
		)
	}
	if (platformReports.length === 0) {
		rejectionReasons.push(`run ${approvalRun.workflowRunId}'s report artifact holds no platform report`)
	}

	// each platform's unknown names, its rejected image captures, and its environment
	for (const platformReport of platformReports) {
		rejectionReasons.push(...toUnknownNameRejectionReasons(platformReport))
		rejectionReasons.push(...toStatusRejectionReasons(platformReport, approvalChoice))
		rejectionReasons.push(...toMissingImageRejectionReasons({ approvalRun, approvalChoice, platformReport }))
		rejectionReasons.push(
			...toEnvironmentRejectionReasons({ approvalRun, approvalChoice, platformReport, baselinesFolder }),
		)
	}
	return rejectionReasons
}

// a platform or an image capture whose names could build a path outside the platform's baselines, as a crafted artifact
// might hold: an unknown platform, palette, or size, or a story id that is not plain lowercase words
function toUnknownNameRejectionReasons(platformReport: PlatformReport): string[] {
	// the report's own platform names its manifest's folder
	if (!IMAGE_CAPTURE_PLATFORMS.some((platform) => platform === platformReport.platform)) {
		return [`the report names an unknown platform: ${JSON.stringify(platformReport.platform)}`]
	}

	// and each entry names its image's path
	return platformReport.reportEntries
		.filter((reportEntry) => reportEntry.platform !== platformReport.platform || !isSafeImageCaptureKey(reportEntry))
		.map(
			(reportEntry) =>
				`the report names an image capture outside the baselines: ${JSON.stringify(toImageCaptureLabel(reportEntry))}`,
		)
}

// each chosen image capture that errored or was unstable, with why. a choice that accepts a new environment chooses
// every image capture, since that environment replaces every image. a choice that names stories chooses every image
// capture of those stories, and a choice that names no story chooses every image capture whose status the choice names
function toStatusRejectionReasons(platformReport: PlatformReport, approvalChoice: ApprovalChoice): string[] {
	return (
		platformReport.reportEntries
			.filter((reportEntry) => REJECTED_STATUSES.has(reportEntry.status))
			.filter((reportEntry) => {
				// a new environment chooses every image capture
				if (approvalChoice.isNewEnvironmentAccepted) {
					return true
				}

				// named stories choose their image captures, and otherwise the named statuses choose theirs
				return approvalChoice.storyIds.length > 0
					? approvalChoice.storyIds.includes(reportEntry.storyId)
					: approvalChoice.statuses.includes(reportEntry.status)
			})
			// each image capture's reason: its error text, or that its images never matched
			.map((reportEntry) => {
				const detailText = reportEntry.status === "error" ? reportEntry.errorText : "its images never matched"
				return `${toImageCaptureLabel(reportEntry)} is ${reportEntry.status}: ${detailText}`
			})
	)
}

// an image capture from a host browser is never approved, and a new environment needs the flag and a full run
function toEnvironmentRejectionReasons({
	approvalRun,
	approvalChoice,
	platformReport,
	baselinesFolder,
}: {
	approvalRun: ApprovalRun
	approvalChoice: ApprovalChoice
	platformReport: PlatformReport
	baselinesFolder: string
}): string[] {
	// an image capture from a host's own browser is never a baseline
	if (platformReport.environmentId.startsWith("host ")) {
		return [
			`${platformReport.platform} image captures came from ${platformReport.environmentId}, which no baseline is approved from`,
		]
	}

	// the same environment as the baselines, or a platform with no baselines yet, needs nothing more
	const baselineManifest = readBaselineManifest(platformReport.platform, baselinesFolder)
	if (!baselineManifest || baselineManifest.environmentId === platformReport.environmentId) {
		return []
	}

	// a new environment needs the flag
	if (!approvalChoice.isNewEnvironmentAccepted) {
		const environmentsText = `${platformReport.environmentId}, and the baselines from ${baselineManifest.environmentId}`
		return [
			`${platformReport.platform} image captures came from ${environmentsText}. pass --new-environment to approve it`,
		]
	}

	// and a run that captured every story, approved whole with no story named, so no image is left from the old one
	const selection = readArtifactSelection(approvalRun.artifactFolder)
	const isFullRun = selection?.platforms[toSelectionPlatform(platformReport.platform)].mode === "all"
	const fullRunText = `a new ${platformReport.platform} environment is approved only from a run that captured every story`
	const namedStoryText = `a new ${platformReport.platform} environment replaces every story's images, so name no story`

	// and the removed baselines deleted with it, so none is kept from the old environment
	const hasRemovedEntry = platformReport.reportEntries.some((reportEntry) => reportEntry.status === "removed")
	const keptRemovedText = `a new ${platformReport.platform} environment replaces every image, so pass --delete-removed`
	return [
		...(isFullRun ? [] : [fullRunText]),
		...(approvalChoice.storyIds.length > 0 ? [namedStoryText] : []),
		...(hasRemovedEntry && !approvalChoice.isDeletingRemoved ? [keptRemovedText] : []),
	]
}

// each chosen image capture whose current image the run's artifact does not hold, as in an artifact cut short, found
// before any image is copied
function toMissingImageRejectionReasons({
	approvalRun,
	approvalChoice,
	platformReport,
}: {
	approvalRun: ApprovalRun
	approvalChoice: ApprovalChoice
	platformReport: PlatformReport
}): string[] {
	// the run's current images, and each chosen image capture that has none
	const currentFolder = posix.join(approvalRun.artifactFolder, "current")
	return toChosenEntries(platformReport, approvalChoice)
		.filter((reportEntry) => APPROVABLE_STATUSES.has(reportEntry.status))
		.filter((reportEntry) => !existsSync(toImageCapturePath(currentFolder, reportEntry)))
		.map(
			(reportEntry) =>
				`run ${approvalRun.workflowRunId}'s artifact holds no image for ${toImageCaptureLabel(reportEntry)}`,
		)
}

// the entries that a choice names. a chosen status, every captured image if the choice accepts a new environment, and
// every removed baseline if the choice deletes removed baselines. only the chosen stories, if the choice names any
function toChosenEntries(platformReport: PlatformReport, approvalChoice: ApprovalChoice): ReportEntry[] {
	return platformReport.reportEntries.filter((reportEntry) => {
		// a chosen status, any captured image for a new environment, or a removed baseline that the choice deletes
		const isReplacedForEnvironment =
			approvalChoice.isNewEnvironmentAccepted && APPROVABLE_STATUSES.has(reportEntry.status)
		const isRemovedDeleted = approvalChoice.isDeletingRemoved && reportEntry.status === "removed"
		const isStatusChosen =
			approvalChoice.statuses.includes(reportEntry.status) || isReplacedForEnvironment || isRemovedDeleted

		// and a chosen story, if the choice names any
		const isStoryChosen = approvalChoice.storyIds.length === 0 || approvalChoice.storyIds.includes(reportEntry.storyId)
		return isStatusChosen && isStoryChosen
	})
}

// copy one platform's chosen image captures, remove its chosen removed baselines, and rewrite its manifest
function approvePlatform({
	approvalRun,
	platformReport,
	chosenEntries,
	baselinesFolder,
	approvalResult,
}: {
	approvalRun: ApprovalRun
	platformReport: PlatformReport
	chosenEntries: ReportEntry[]
	baselinesFolder: string
	approvalResult: ApprovalResult
}): void {
	// the manifest, moved to the run's environment
	const existingManifest = readBaselineManifest(platformReport.platform, baselinesFolder)
	const baselineManifest: BaselineManifest = {
		environmentId: platformReport.environmentId,
		baselineImages: { ...(existingManifest?.baselineImages ?? {}) },
	}

	for (const reportEntry of chosenEntries) {
		// the image's manifest key and its path in the baselines
		const baselineImageKey = toBaselineImageKey(reportEntry)
		const baselinePath = toImageCapturePath(baselinesFolder, reportEntry)

		// a removed baseline goes, with its manifest entry
		if (reportEntry.status === "removed") {
			rmSync(baselinePath, { force: true })
			delete baselineManifest.baselineImages[baselineImageKey]
			approvalResult.deletedLabels.push(toImageCaptureLabel(reportEntry))
			approvalResult.changedPaths.push(baselinePath)
			continue
		}

		// an approvable image capture is copied in with its source and the environment that captured it
		if (APPROVABLE_STATUSES.has(reportEntry.status)) {
			const environmentId = platformReport.environmentId
			baselineManifest.baselineImages[baselineImageKey] = copyApprovedImage({
				approvalRun,
				reportEntry,
				baselinePath,
				environmentId,
			})
			approvalResult.approvedLabels.push(toImageCaptureLabel(reportEntry))
			approvalResult.changedPaths.push(baselinePath)
		}
	}

	// the manifest, written with its images in a stable order, and any story folder left empty removed
	baselineManifest.baselineImages = Object.fromEntries(
		Object.entries(baselineManifest.baselineImages).sort(([firstKey], [secondKey]) =>
			firstKey.localeCompare(secondKey),
		),
	)
	const baselineManifestPath = toBaselineManifestPath(platformReport.platform, baselinesFolder)
	writeJsonFile(baselineManifestPath, baselineManifest)
	approvalResult.changedPaths.push(baselineManifestPath)
	removeEmptyStoryFolders(posix.join(baselinesFolder, platformReport.platform))
}

// copy an image capture's current image from the run's artifact into the baselines, and return its source
function copyApprovedImage({
	approvalRun,
	reportEntry,
	baselinePath,
	environmentId,
}: {
	approvalRun: ApprovalRun
	reportEntry: ReportEntry
	baselinePath: string
	environmentId: string
}): BaselineImageSource {
	// copy the run's current image into the baselines
	const currentImagePath = toImageCapturePath(posix.join(approvalRun.artifactFolder, "current"), reportEntry)
	mkdirSync(posix.dirname(baselinePath), { recursive: true })
	copyFileSync(currentImagePath, baselinePath)

	// its source: the run, its commit, the environment that captured it, and the image's hash
	const sha256 = createHash("sha256").update(readFileSync(baselinePath)).digest("hex")
	return { workflowRunId: approvalRun.workflowRunId, commit: approvalRun.headCommit, environmentId, sha256 }
}

// the platform reports in a run's artifact folder, limited to the named platforms if the choice names any
function readArtifactReports(artifactFolder: string, platforms: string[]): PlatformReport[] {
	return readPlatformReports(artifactFolder).filter(
		(platformReport) => platforms.length === 0 || platforms.includes(platformReport.platform),
	)
}

// the selection that a run's artifact holds, or null without one
function readArtifactSelection(artifactFolder: string): ImageCaptureSelection | null {
	const selectionPath = posix.join(artifactFolder, "selection.json")
	return existsSync(selectionPath) ? readJsonFile<ImageCaptureSelection>(selectionPath) : null
}

// remove every story folder under a platform folder that no longer holds an image
function removeEmptyStoryFolders(platformFolder: string): void {
	// a platform with no folder has nothing to remove
	if (!existsSync(platformFolder)) {
		return
	}

	// each story folder with no image left
	for (const folderEntry of readdirSync(platformFolder, { withFileTypes: true })) {
		const storyFolder = posix.join(platformFolder, folderEntry.name)
		if (folderEntry.isDirectory() && readdirSync(storyFolder).length === 0) {
			rmSync(storyFolder, { recursive: true })
		}
	}
}
