// bundle every temporal workflow the way the worker does. a bad import fails the gate, not production.
//
// the worker bundles workflow code with webpack, which resolves neither the @shared/* tsconfig alias nor
// anything else only tsc understands. that makes `tsc -b` pass on code the worker cannot load,
// and the first sign of it is temporal-worker crash-looping after a deploy. bundling here is the check that catches it.
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { bundleWorkflowCode } from "@temporalio/worker"

// the worker takes one workflowsPath per queue, and every one of them is a file in this directory
const WORKFLOWS_DIRECTORY = join(import.meta.dir, "..", "worker", "workflows")

// a workflow entry point is a .ts file that is not an activities module, a generated entrypoint, or a test
function toWorkflowPaths(): string[] {
	return readdirSync(WORKFLOWS_DIRECTORY)
		.filter((name) => name.endsWith(".ts") && !/-activities\.ts$|\.test\.ts$|^stage-timeouts\.ts$/.test(name))
		.map((name) => join(WORKFLOWS_DIRECTORY, name))
}

// bundle each workflow file the way the worker does, collecting the ones that fail
const workflowPaths = toWorkflowPaths()
const failures: string[] = []
for (const workflowsPath of workflowPaths) {
	try {
		await bundleWorkflowCode({ workflowsPath })
	} catch (error) {
		// the failure keeps the path with the bundler's own words
		failures.push(`${workflowsPath}\n${error instanceof Error ? error.message : String(error)}`)
	}
}

// a failure names the file. the webpack output above it is long and the path is what matters
if (failures.length > 0) {
	console.error(`\n${failures.length} of ${workflowPaths.length} workflow bundles failed:\n`)
	for (const failure of failures) {
		console.error(failure)
	}
	process.exit(1)
}
console.log(`workflow bundles built: ${workflowPaths.length}`)
