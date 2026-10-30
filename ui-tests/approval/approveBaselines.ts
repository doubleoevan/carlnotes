// the approval command, `bun run visual:approve -- --run <id>`: download a UI tests run's report artifact, approve the
// chosen image captures as baselines, and print the files that it changed for the developer to commit. it never
// commits, and it needs git-lfs, which stores the baseline images. by default it approves the run's changed and new
// image captures. `--platform`, `--story`, and `--status` narrow the choice, `--delete-removed` also removes the
// baselines marked removed, and `--new-environment` accepts a new capture environment and replaces every captured image
// of the chosen stories
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { posix } from "node:path"
import { parseArgs } from "node:util"
import { runCommand } from "../commands"
import { toErrorText } from "../errorText"
import { BASELINES_FOLDER, type ReportStatus } from "../imageCaptures"
import { ApprovalRejection, approveBaselines } from "./baselineApproval"
import { readUiTestsRun } from "./workflowRun"

// the statuses that a developer may name, error and unstable included so that the approval rejects them with their
// reasons, and the statuses approved without a choice
const STATUS_OPTIONS: ReportStatus[] = ["changed", "new", "passed", "error", "unstable"]
const DEFAULT_STATUSES: ReportStatus[] = ["changed", "new"]

// how many changed files the command lists before it counts the rest
const LISTED_PATH_LIMIT = 30

// the command's options
const { values: commandOptions } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		run: { type: "string" },
		platform: { type: "string", multiple: true, default: [] },
		story: { type: "string", multiple: true, default: [] },
		status: { type: "string", multiple: true, default: [] },
		"delete-removed": { type: "boolean", default: false },
		"new-environment": { type: "boolean", default: false },
	},
})

// a run id is required, and each named status must be one that a developer may name
const workflowRunId = commandOptions.run
const statuses = (commandOptions.status.length > 0 ? commandOptions.status : DEFAULT_STATUSES) as ReportStatus[]
if (!workflowRunId || statuses.some((status) => !STATUS_OPTIONS.includes(status))) {
	console.error(`visual:approve: name the run with --run <id>, and statuses among ${STATUS_OPTIONS.join(", ")}`)
	process.exit(1)
}

// git-lfs, before anything reads the run
checkGitLfsOrExit()

// the run's commit, from a UI tests run that no pull request started, and its report artifact in a temporary folder
const headCommit = readRunCommitOrExit(workflowRunId)
const artifactFolder = mkdtempSync(posix.join(tmpdir(), "ui-tests-approval-"))

// download the report artifact and approve, then list what changed, or every reason to reject the approval. the
// temporary folder goes either way
try {
	runCommand(["gh", "run", "download", workflowRunId, "--name", "visual-report", "--dir", artifactFolder])
	const approvalResult = approveBaselines({
		approvalRun: { workflowRunId, headCommit, artifactFolder },
		approvalChoice: {
			platforms: commandOptions.platform,
			storyIds: commandOptions.story,
			statuses,
			isDeletingRemoved: commandOptions["delete-removed"],
			isNewEnvironmentAccepted: commandOptions["new-environment"],
		},
		localHeadCommit: runCommand(["git", "rev-parse", "HEAD"]).trim(),
		baselinesFolder: BASELINES_FOLDER,
	})
	const { approvedLabels, deletedLabels, changedPaths } = approvalResult
	console.log(
		`visual:approve: approved ${approvedLabels.length} image captures and removed ${deletedLabels.length} baselines`,
	)
	printPaths(`changed ${changedPaths.length} files, to commit with the change they show:`, changedPaths)
} catch (error) {
	// a rejection names every reason and changes nothing
	if (!(error instanceof ApprovalRejection)) {
		throw error
	}
	console.error(`visual:approve: ${error.message}`)
	process.exitCode = 1
} finally {
	rmSync(artifactFolder, { recursive: true, force: true })
}

// the command stops unless git-lfs is installed and its filter is set up, since git would otherwise commit each approved
// image whole
function checkGitLfsOrExit(): void {
	// the filter that git-lfs sets up, and the program that runs it
	const lfsFilterCommand = Bun.spawnSync(["git", "config", "--get", "filter.lfs.process"]).stdout.toString().trim()
	if (lfsFilterCommand && Bun.which("git-lfs")) {
		return
	}

	// how to set it up
	console.error(
		"visual:approve: the baseline images are stored in Git LFS. install git-lfs, with `brew install git-lfs` on a Mac, then run `git lfs install --skip-repo`",
	)
	process.exit(1)
}

// a UI tests run's commit, or the command stops and says what is wrong with the run
function readRunCommitOrExit(workflowRunId: string): string {
	try {
		return readUiTestsRun(workflowRunId).headSha
	} catch (error) {
		console.error(`visual:approve: ${toErrorText(error)}`)
		process.exit(1)
	}
}

// print a heading and its file paths, limited with a count of the rest
function printPaths(heading: string, filePaths: string[]): void {
	// the heading and the listed paths
	console.log(`visual:approve: ${heading}`)
	for (const filePath of filePaths.slice(0, LISTED_PATH_LIMIT)) {
		console.log(`  ${filePath}`)
	}

	// how many more there are
	if (filePaths.length > LISTED_PATH_LIMIT) {
		console.log(`  and ${filePaths.length - LISTED_PATH_LIMIT} more`)
	}
}
