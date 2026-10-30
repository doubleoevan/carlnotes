// fail on an import, a package.json, or a tsconfig that crosses a workspace boundary. the rules live in
// packageBoundaries.ts and importBoundaries.ts. read the workspaces, their source files, and the installed packages,
// and run the rules
import { existsSync, readFileSync } from "node:fs"
import { dirname, posix, resolve } from "node:path"
import { checkPackageBoundaries, type ResolvedPackage } from "./packageBoundaries"
import { readSourceFiles } from "./sourceFiles"
import type { Workspace } from "./workspaces"

// the folders that hold the workspaces
const WORKSPACE_PARENT_FOLDERS = ["apps", "packages"]

// a package.json's fields the check reads
type PackageJson = {
	name: string
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}

// a tsconfig's references, the one field the check reads
type Tsconfig = { references?: { path: string }[] }

// the package to resolve, and the folder to resolve it from
type ResolveInstalledPackageOptions = { packageName: string; fromDirectory: string }

// read one workspace's package.json, and its tsconfig references resolved to repo folders
function readWorkspace(folder: string): Workspace {
	// the package.json, and the tsconfig if the workspace has one
	const packageJson = JSON.parse(readFileSync(posix.join(folder, "package.json"), "utf8")) as PackageJson
	const tsconfigPath = posix.join(folder, "tsconfig.json")
	const tsconfig = existsSync(tsconfigPath) ? (Bun.JSONC.parse(readFileSync(tsconfigPath, "utf8")) as Tsconfig) : {}
	const references = tsconfig.references ?? []
	return {
		folder,
		name: packageJson.name,
		dependencies: Object.keys(packageJson.dependencies ?? {}),
		devDependencies: Object.keys(packageJson.devDependencies ?? {}),
		peerDependencies: Object.keys(packageJson.peerDependencies ?? {}),
		references: references.map((reference) => posix.normalize(posix.join(folder, reference.path))),
	}
}

// the installed package a name resolves to from a folder, through Bun's resolver, or undefined if it does not resolve
function resolveInstalledPackage({
	packageName,
	fromDirectory,
}: ResolveInstalledPackageOptions): ResolvedPackage | undefined {
	try {
		// the package's package.json, and the names of its own runtime dependencies
		const packageJsonPath = Bun.resolveSync(`${packageName}/package.json`, resolve(fromDirectory))
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson
		return { packageDirectory: dirname(packageJsonPath), dependencyNames: Object.keys(packageJson.dependencies ?? {}) }
	} catch {
		return undefined
	}
}

// read the workspaces, every folder with a package.json under apps/ and packages/, and their source files
const workspaces = [...new Bun.Glob("{apps,packages}/*/package.json").scanSync()]
	.sort()
	.map((packageJsonPath) => readWorkspace(posix.dirname(packageJsonPath)))
const sourceFiles = readSourceFiles(WORKSPACE_PARENT_FOLDERS)

// run the rules, and print a note for each package the closure walk skipped
const { violations, notes } = checkPackageBoundaries({
	workspaces,
	sourceFiles,
	resolvePackage: resolveInstalledPackage,
})
for (const note of notes) {
	console.log(`package boundaries: ${note}`)
}

// report every violation, then fail
if (violations.length > 0) {
	console.error("package boundaries: an import, a package.json, or a tsconfig crosses a workspace boundary:")
	for (const violation of violations) {
		console.error(`  ${violation}`)
	}
	process.exit(1)
}

// report a clean run
console.log(
	`package boundaries: ${workspaces.length} workspaces and ${sourceFiles.length} files stay inside their boundaries`,
)
