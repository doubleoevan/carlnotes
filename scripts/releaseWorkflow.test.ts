// the release workflow's steps, in the order the deployment guide states
import { expect, test } from "bun:test"

// one step of the workflow's sequence: its name, and the service a deploy step releases to
type ReleaseStep = { ref: string; spec: { target?: { id: string } } }

test("the release deploys web right after app and before the edge purge, and the films before the worker", async () => {
	const releaseWorkflow = await Bun.file("infra/northflank/release-main.json").json()
	const releaseSteps = releaseWorkflow.spec.spec.steps as ReleaseStep[]
	expect(releaseSteps.map(({ ref }) => ref)).toEqual([
		"build-image",
		"run-migrate",
		"deploy-app",
		"deploy-web",
		"run-edge-purge",
		"deploy-films",
		"deploy-worker",
		"run-docs-sync",
	])

	// each deploy step releases the one build to its own service
	const deployedServices = releaseSteps.flatMap(({ ref, spec }) => (spec.target ? [[ref, spec.target.id]] : []))
	expect(deployedServices).toEqual([
		["deploy-app", "app"],
		["deploy-web", "web"],
		["deploy-films", "temporal-films"],
		["deploy-worker", "temporal-worker"],
	])
})
