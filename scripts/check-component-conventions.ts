// run the report-only inventory or the strict adopted set from the repository root
import { existsSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
	ADOPTED_COMPONENTS,
	listComponentFiles,
	readComponentExceptions,
	validateComponentPaths,
} from "./componentConventionFiles"
import { buildComponentReport, formatComponentReport, hasComponentFindings } from "./componentConventionReport"

// keep operational errors distinct from convention findings
try {
	process.exit(await run())
} catch (error) {
	console.error(`components: ${error instanceof Error ? error.message : String(error)}`)
	process.exit(2)
}

// select the mode and the files, then print the deterministic report
async function run(): Promise<number> {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: { report: { type: "boolean" }, check: { type: "boolean" }, json: { type: "boolean" } },
	})
	if (Boolean(values.report) === Boolean(values.check)) {
		throw new Error("Choose exactly one of --report and --check")
	}
	// explicit paths replace the mode's default selection
	const filePaths = positionals.length
		? positionals.map(toRepoPath)
		: values.report
			? listComponentFiles()
			: ADOPTED_COMPONENTS
	if (!filePaths.length) {
		throw new Error("The component selection is empty")
	}
	// validate the selection and its exceptions before scanning source
	validateComponentPaths(filePaths.map((filePath) => ({ filePath, reason: "selected component" })))
	const exceptions = await readComponentExceptions()
	const report = buildComponentReport({ filePaths, exceptions })
	// strict mode must check at least one feature component
	if (values.check && report.counts.checked + report.counts.review === 0) {
		throw new Error("The strict selection contains no feature components")
	}
	// print the same inventory in either mode and enforce strict findings
	console.log(values.json ? JSON.stringify(report, null, 2) : formatComponentReport(report))
	return values.check && hasComponentFindings(report) ? 1 : 0
}

// keep explicit paths within the selected repository and reject missing inputs
function toRepoPath(filePath: string): string {
	const repoPath = relative(process.cwd(), resolve(filePath))
	if (isAbsolute(repoPath) || repoPath.startsWith("../") || !existsSync(repoPath)) {
		throw new Error(`Invalid component path: ${filePath}`)
	}
	return repoPath
}
