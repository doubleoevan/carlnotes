// fail if .bun-version differs from the tag of the Dockerfile's oven/bun stages, if a patchedDependencies key in the
// root package.json names a package version the lockfile does not install, or if docker-compose.yml runs another
// LiteLLM image than infra/litellm/Dockerfile starts from. the rules live in dependencyPins.ts
import { readFileSync } from "node:fs"
import { toBunVersionViolations, toLiteLLMImageViolations, toPatchedDependencyViolations } from "./dependencyPins"
import { readLockfile, toInstalledPackageVersions } from "./lockfile"

// the keys of the root package.json's patched packages, each a name and a version
const rootPackageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
	patchedDependencies?: Record<string, string>
}
const patchedDependencyKeys = Object.keys(rootPackageJson.patchedDependencies ?? {})

// run each rule over the repo's files
const violations = [
	...toBunVersionViolations({
		bunVersionText: readFileSync(".bun-version", "utf8"),
		dockerfileText: readFileSync("Dockerfile", "utf8"),
	}),
	...toPatchedDependencyViolations({
		patchedDependencyKeys,
		installedPackageVersions: toInstalledPackageVersions(readLockfile()),
	}),
	...toLiteLLMImageViolations({
		composeText: readFileSync("docker-compose.yml", "utf8"),
		dockerfileText: readFileSync("infra/litellm/Dockerfile", "utf8"),
	}),
]

// report every violation, then fail
if (violations.length > 0) {
	console.error(`dependency pins: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}

// report a clean run
console.log(
	`dependency pins: .bun-version names the Dockerfile's Bun, the lockfile installs all ${patchedDependencyKeys.length} patched package versions, and docker-compose.yml runs the LiteLLM image of infra/litellm/Dockerfile`,
)
