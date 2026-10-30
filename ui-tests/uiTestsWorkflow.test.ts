// the UI tests workflow as written: no secret and no Doppler step, every action pinned to a commit, read-only
// permissions with no job widening them, a timeout on every job, no job or step that continues on error, its triggers
// and cancel rule, the baseline images' Git LFS rule and the one job that downloads them, and no UI check in the gate or
// in any other workflow
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { runCommand } from "./commands"

// the workflow's text, and the parsed workflow
const WORKFLOW_TEXT = readFileSync(".github/workflows/ui-tests.yml", "utf8")
const WORKFLOW = Bun.YAML.parse(WORKFLOW_TEXT) as {
	on: Record<string, unknown>
	concurrency: { group: string; "cancel-in-progress": string }
	permissions: Record<string, string>
	jobs: Record<
		string,
		{
			"timeout-minutes"?: number
			permissions?: unknown
			"continue-on-error"?: unknown
			steps: { uses?: string; run?: string; "continue-on-error"?: unknown }[]
		}
	>
}

// the workflow reads no repository secret and runs no Doppler step
test("the workflow names no secret and no Doppler step", () => {
	expect(WORKFLOW_TEXT).not.toContain("secrets.")
	expect(WORKFLOW_TEXT.toLowerCase()).not.toContain("doppler")
})

// every published action names a full commit, with its version beside it
test("every action is pinned to a commit", () => {
	const actionReferences = Object.values(WORKFLOW.jobs).flatMap((job) =>
		job.steps.flatMap((step) => (step.uses ? [step.uses] : [])),
	)
	for (const actionReference of actionReferences.filter((reference) => !reference.startsWith("./"))) {
		expect(actionReference).toMatch(/^[\w-]+\/[\w-]+(\/[\w-]+)*@[0-9a-f]{40}$/)
	}
})

// an approved image is a Git LFS file and its manifest is not, and only the web job downloads the images, through its
// cache, while every checkout leaves them as pointers
test("the baseline images go through Git LFS, and only the web job downloads them", () => {
	// the attribute rule that sends an approved image to Git LFS, and leaves its manifest in git
	const imagePath = "ui-tests/baselines/web/button--default/latte-phone.png"
	const manifestPath = "ui-tests/baselines/web/manifest.json"
	const filterLines = runCommand(["git", "check-attr", "filter", "--", imagePath, manifestPath]).trim().split("\n")
	expect(filterLines).toEqual([`${imagePath}: filter: lfs`, `${manifestPath}: filter: unspecified`])

	// the one job that pulls them, and no checkout that downloads them on its own
	const pullingJobNames = Object.entries(WORKFLOW.jobs)
		.filter(([, job]) => job.steps.some((step) => step.run === "git lfs pull"))
		.map(([jobName]) => jobName)
	expect(pullingJobNames).toEqual(["web"])
	expect(WORKFLOW_TEXT).not.toContain("lfs: true")
})

// the workflow only reads, no job widens its permissions, and every job has a timeout and nothing that continues on error
test("the workflow only reads, and every job is bounded and fails visibly", () => {
	expect(WORKFLOW.permissions).toEqual({ contents: "read", actions: "read" })
	for (const [jobName, job] of Object.entries(WORKFLOW.jobs)) {
		expect({ jobName, timeoutMinutes: job["timeout-minutes"] }).toMatchObject({ timeoutMinutes: expect.any(Number) })
		expect({ jobName, permissions: job.permissions, continueOnError: job["continue-on-error"] }).toEqual({
			jobName,
			permissions: undefined,
			continueOnError: undefined,
		})
		expect(job.steps.filter((step) => step["continue-on-error"] !== undefined)).toEqual([])
	}
})

// a push, the nightly schedule, and a dispatch start it, and only a push run is cancelled by a newer push
test("pushes, the schedule, and dispatches start it, and only pushes cancel each other", () => {
	expect(Object.keys(WORKFLOW.on).sort()).toEqual(["push", "schedule", "workflow_dispatch"])
	expect(WORKFLOW.concurrency.group).toContain("github.event_name")
	expect(WORKFLOW.concurrency["cancel-in-progress"]).toContain("github.event_name == 'push'")
})

// no other workflow and no preflight step runs a UI check
test("the gate, the pre-push hook, and the other workflows run no UI check", () => {
	// every workflow but this one, the CI gate's included
	const otherWorkflowPaths = readdirSync(".github/workflows")
		.filter((fileName) => fileName !== "ui-tests.yml")
		.map((fileName) => `.github/workflows/${fileName}`)
	expect(otherWorkflowPaths).toContain(".github/workflows/ci.yml")

	// none of them, and neither preflight nor the pre-push hook, names a UI check
	for (const gateFilePath of ["scripts/preflight.sh", ".githooks/pre-push", ...otherWorkflowPaths]) {
		expect({ gateFilePath, gateText: readFileSync(gateFilePath, "utf8") }).not.toMatchObject({
			gateText: expect.stringMatching(/visual:|e2e:|ui-tests/),
		})
	}
})
