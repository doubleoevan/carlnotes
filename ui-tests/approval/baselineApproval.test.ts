// baseline approval over a fixture report artifact and a temporary baselines folder: an approval with its sources and
// changed files, an image capture with an error named by its story or its status, an image capture whose names leave
// the baselines, a run on another commit, an image capture from the host, a new environment that replaces every
// captured image, and removed baselines
import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { posix } from "node:path"
import type { BaselineManifest, PlatformReport, ReportEntry } from "../imageCaptures"
import { toWebReportEntry } from "../reportTestFixtures"
import { type ApprovalChoice, ApprovalRejection, approveBaselines } from "./baselineApproval"

// the temporary artifact and baselines folders of one test
let testFolder = ""
let artifactFolder = ""
let baselinesFolder = ""

// the environment that the fixture run captured in
const RUN_ENVIRONMENT_ID = "mcr.microsoft.com/playwright:v1.64.1-noble@sha256:abc playwright-core@1.64.1 fonts@123"

// the choice that the command makes without options
const DEFAULT_CHOICE: ApprovalChoice = {
	platforms: [],
	storyIds: [],
	statuses: ["changed", "new"],
	isDeletingRemoved: false,
	isNewEnvironmentAccepted: false,
}

// fresh folders before each test
beforeEach(() => {
	testFolder = mkdtempSync(posix.join(tmpdir(), "baseline-approval-"))
	artifactFolder = posix.join(testFolder, "artifact")
	baselinesFolder = posix.join(testFolder, "baselines")
	mkdirSync(artifactFolder)
})

// the folders removed after each test
afterEach(() => {
	rmSync(testFolder, { recursive: true, force: true })
})

// write the run's web report and a current image for each entry that has one
function writeArtifact(reportEntries: ReportEntry[], environmentId: string = RUN_ENVIRONMENT_ID): void {
	const platformReport: PlatformReport = {
		platform: "web",
		environmentId,
		baselineEnvironmentId: null,
		skippedStoryIds: [],
		reportEntries,
	}
	writeFileSync(posix.join(artifactFolder, "report-web.json"), JSON.stringify(platformReport))
	for (const reportEntry of reportEntries) {
		const imageFolder = posix.join(artifactFolder, "current", "web", reportEntry.storyId)
		mkdirSync(imageFolder, { recursive: true })
		writeFileSync(posix.join(imageFolder, "latte-phone.png"), `image of ${reportEntry.storyId}`)
	}
}

// approve the fixture run on the commit that it captured
function approve(
	approvalChoice: ApprovalChoice = DEFAULT_CHOICE,
	localHeadCommit = "head",
): ReturnType<typeof approveBaselines> {
	return approveBaselines({
		approvalRun: { workflowRunId: "42", headCommit: "head", artifactFolder },
		approvalChoice,
		localHeadCommit,
		baselinesFolder,
	})
}

// the rejection reasons in the error that an approval throws
function toRejectionReasons(approval: () => unknown): string[] {
	try {
		approval()
	} catch (error) {
		return error instanceof ApprovalRejection ? error.rejectionReasons : []
	}
	return []
}

// changed and new image captures are copied in with their source, and passed ones are left alone
test("an approval copies the changed and new image captures with their source", () => {
	writeArtifact([
		toWebReportEntry("changed", { status: "changed" }),
		toWebReportEntry("new", { status: "new" }),
		toWebReportEntry("passed", { status: "passed" }),
	])
	const approvalResult = approve()
	expect(approvalResult.approvedLabels).toEqual(["web changed latte phone", "web new latte phone"])

	// the images and the manifest that names their source
	expect(readFileSync(posix.join(baselinesFolder, "web/new/latte-phone.png"), "utf8")).toBe("image of new")
	expect(existsSync(posix.join(baselinesFolder, "web/passed/latte-phone.png"))).toBe(false)
	const baselineManifest = JSON.parse(
		readFileSync(posix.join(baselinesFolder, "web/manifest.json"), "utf8"),
	) as BaselineManifest
	expect(baselineManifest.environmentId).toBe(RUN_ENVIRONMENT_ID)
	expect(baselineManifest.baselineImages["new/latte-phone.png"]).toMatchObject({
		workflowRunId: "42",
		commit: "head",
		environmentId: RUN_ENVIRONMENT_ID,
	})

	// every file that the approval wrote, for the developer to commit
	expect(approvalResult.changedPaths).toEqual([
		posix.join(baselinesFolder, "web/changed/latte-phone.png"),
		posix.join(baselinesFolder, "web/new/latte-phone.png"),
		posix.join(baselinesFolder, "web/manifest.json"),
	])
})

// an image capture with an error that the developer names, by its story or by its status, is rejected, and nothing is
// written
test("an image capture with an error is rejected with its error", () => {
	writeArtifact([
		toWebReportEntry("broken", { status: "error", errorText: "the story threw" }),
		toWebReportEntry("new", { status: "new" }),
	])
	const brokenRejection = ["web broken latte phone is error: the story threw"]
	expect(toRejectionReasons(() => approve({ ...DEFAULT_CHOICE, storyIds: ["broken"] }))).toEqual(brokenRejection)
	expect(toRejectionReasons(() => approve({ ...DEFAULT_CHOICE, statuses: ["error"] }))).toEqual(brokenRejection)
	expect(existsSync(baselinesFolder)).toBe(false)
})

// an image capture whose names could climb out of the baselines, as a crafted artifact might hold, is rejected
// unwritten
test("an image capture whose names leave the baselines is rejected", () => {
	writeArtifact([toWebReportEntry("../../escape", { status: "new" })])
	expect(toRejectionReasons(() => approve())).toEqual([
		'the report names an image capture outside the baselines: "web ../../escape latte phone"',
	])
	expect(existsSync(baselinesFolder)).toBe(false)
})

// a run on another commit is rejected, naming both commits
test("a run on another commit is rejected", () => {
	writeArtifact([toWebReportEntry("new", { status: "new" })])
	expect(toRejectionReasons(() => approve(DEFAULT_CHOICE, "local"))).toEqual([
		"run 42 captured head, and the local HEAD is local",
	])
})

// an image capture from a host's own browser is never a baseline
test("an image capture from the host's browser is rejected", () => {
	writeArtifact([toWebReportEntry("new", { status: "new" })], "host darwin chrome playwright-core@1.64.1 fonts@123")
	expect(toRejectionReasons(() => approve())[0]).toContain("which no baseline is approved from")
})

// a new environment needs the flag and a run that captured every story
test("a new environment is rejected without the flag and accepted from a full run with it", () => {
	// baselines approved in another environment
	mkdirSync(posix.join(baselinesFolder, "web"), { recursive: true })
	const oldManifest: BaselineManifest = { environmentId: "old environment", baselineImages: {} }
	writeFileSync(posix.join(baselinesFolder, "web/manifest.json"), JSON.stringify(oldManifest))
	writeArtifact([toWebReportEntry("changed", { status: "changed" })])
	expect(toRejectionReasons(() => approve())[0]).toContain("pass --new-environment")

	// with the flag, a run that captured every story is accepted, and its passed image captures are replaced too
	writeArtifact([toWebReportEntry("changed", { status: "changed" }), toWebReportEntry("passed", { status: "passed" })])
	writeFileSync(posix.join(artifactFolder, "selection.json"), JSON.stringify({ platforms: { web: { mode: "all" } } }))
	expect(approve({ ...DEFAULT_CHOICE, isNewEnvironmentAccepted: true }).approvedLabels).toEqual([
		"web changed latte phone",
		"web passed latte phone",
	])

	// so every image in the manifest comes from the new environment
	const newManifest = JSON.parse(
		readFileSync(posix.join(baselinesFolder, "web/manifest.json"), "utf8"),
	) as BaselineManifest
	expect(Object.values(newManifest.baselineImages).map((baselineImage) => baselineImage.environmentId)).toEqual([
		RUN_ENVIRONMENT_ID,
		RUN_ENVIRONMENT_ID,
	])
})

// a new environment replaces every story's images, so an approval that names stories is rejected
test("a new environment approved for named stories alone is rejected", () => {
	// baselines from another environment, and a run that captured every story
	mkdirSync(posix.join(baselinesFolder, "web"), { recursive: true })
	const oldManifest: BaselineManifest = { environmentId: "old environment", baselineImages: {} }
	writeFileSync(posix.join(baselinesFolder, "web/manifest.json"), JSON.stringify(oldManifest))
	writeArtifact([toWebReportEntry("changed", { status: "changed" })])
	writeFileSync(posix.join(artifactFolder, "selection.json"), JSON.stringify({ platforms: { web: { mode: "all" } } }))

	// naming a story leaves the others from the old environment
	const namedChoice = { ...DEFAULT_CHOICE, isNewEnvironmentAccepted: true, storyIds: ["changed"] }
	expect(toRejectionReasons(() => approve(namedChoice))).toEqual([
		"a new web environment replaces every story's images, so name no story",
	])
})

// a new environment replaces every image, so an unstable image capture that it cannot replace rejects the approval
test("a new environment with an unstable image capture is rejected", () => {
	// baselines from another environment, and a full run with an unstable image capture
	mkdirSync(posix.join(baselinesFolder, "web"), { recursive: true })
	const oldManifest: BaselineManifest = { environmentId: "old environment", baselineImages: {} }
	writeFileSync(posix.join(baselinesFolder, "web/manifest.json"), JSON.stringify(oldManifest))
	writeArtifact([toWebReportEntry("changed", { status: "changed" }), toWebReportEntry("shaky", { status: "unstable" })])
	writeFileSync(posix.join(artifactFolder, "selection.json"), JSON.stringify({ platforms: { web: { mode: "all" } } }))

	// the approval names the image capture that it cannot replace
	expect(toRejectionReasons(() => approve({ ...DEFAULT_CHOICE, isNewEnvironmentAccepted: true }))).toEqual([
		"web shaky latte phone is unstable: its images never matched",
	])
})

// a new environment replaces every image, so the removed baselines must go with the approval
test("a new environment with removed baselines needs them deleted", () => {
	// baselines from another environment, and a full run that reports one removed
	mkdirSync(posix.join(baselinesFolder, "web"), { recursive: true })
	const oldManifest: BaselineManifest = { environmentId: "old environment", baselineImages: {} }
	writeFileSync(posix.join(baselinesFolder, "web/manifest.json"), JSON.stringify(oldManifest))
	writeArtifact([toWebReportEntry("changed", { status: "changed" }), toWebReportEntry("gone", { status: "removed" })])
	writeFileSync(posix.join(artifactFolder, "selection.json"), JSON.stringify({ platforms: { web: { mode: "all" } } }))

	// the approval asks for the removed baselines to be deleted too
	expect(toRejectionReasons(() => approve({ ...DEFAULT_CHOICE, isNewEnvironmentAccepted: true }))).toEqual([
		"a new web environment replaces every image, so pass --delete-removed",
	])
})

// a chosen image capture whose image the artifact lacks is rejected before any image is copied
test("an image capture whose image the artifact lacks is rejected unwritten", () => {
	writeArtifact([toWebReportEntry("new", { status: "new" }), toWebReportEntry("missing", { status: "new" })])
	rmSync(posix.join(artifactFolder, "current/web/missing/latte-phone.png"))
	expect(toRejectionReasons(() => approve())).toEqual(["run 42's artifact holds no image for web missing latte phone"])
	expect(existsSync(baselinesFolder)).toBe(false)
})

// a removed baseline in a size that is no longer captured never blocks approving the run's other image captures
test("a removed baseline of a retired size does not block an approval", () => {
	writeArtifact([
		toWebReportEntry("new", { status: "new" }),
		toWebReportEntry("old", { status: "removed", sizeName: "tablet" }),
	])
	expect(approve().approvedLabels).toEqual(["web new latte phone"])
})

// a removed baseline goes only if the developer asks, with its manifest entry
test("removed baselines are removed only if asked", () => {
	// an approved baseline that the run reports as removed
	mkdirSync(posix.join(baselinesFolder, "web/deleted"), { recursive: true })
	writeFileSync(posix.join(baselinesFolder, "web/deleted/latte-phone.png"), "old image")
	writeArtifact([toWebReportEntry("deleted", { status: "removed" })])
	expect(approve().deletedLabels).toEqual([])
	expect(existsSync(posix.join(baselinesFolder, "web/deleted/latte-phone.png"))).toBe(true)

	// asked to, the approval removes the image and its empty story folder
	expect(approve({ ...DEFAULT_CHOICE, isDeletingRemoved: true }).deletedLabels).toEqual(["web deleted latte phone"])
	expect(existsSync(posix.join(baselinesFolder, "web/deleted"))).toBe(false)
})
