// the open command, `bun run visual:open -- <run id>`: download a UI tests run's report artifact into the output folder
// and open its report page. it opens only a UI tests run that no pull request started
import { mkdirSync, rmSync } from "node:fs"
import { posix } from "node:path"
import { runCommand } from "../commands"
import { toErrorText } from "../errorText"
import { OUTPUT_FOLDER } from "../imageCaptures"
import { readUiTestsRun } from "./workflowRun"

// the run id is required
const workflowRunId = Bun.argv[2]
if (!workflowRunId) {
	console.error("visual:open: name the run, as in `bun run visual:open -- 1234567890`")
	process.exit(1)
}

// and must name a UI tests run that no pull request started, checked before the id reaches a folder
try {
	readUiTestsRun(workflowRunId)
} catch (error) {
	console.error(`visual:open: ${toErrorText(error)}`)
	process.exit(1)
}

// a fresh folder for the run's report artifact
const reportFolder = posix.join(OUTPUT_FOLDER, "runs", workflowRunId)
rmSync(reportFolder, { recursive: true, force: true })
mkdirSync(reportFolder, { recursive: true })

// download it, and open the report page in the default browser
runCommand(["gh", "run", "download", workflowRunId, "--name", "visual-report", "--dir", reportFolder])
const reportPagePath = posix.join(reportFolder, "report.html")
runCommand([process.platform === "darwin" ? "open" : "xdg-open", reportPagePath])
console.log(`visual:open: opened ${reportPagePath}`)
