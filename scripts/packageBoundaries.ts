// the workspace boundary check the check script runs: each file's import rules, each workspace's package.json rules,
// and the runtime closure of each universal package over the installed packages
import { toImportViolations } from "./importBoundaries"
import {
	API_PACKAGE_NAME,
	MOBILE_APP_FOLDER,
	type SourceFile,
	TYPE_ONLY_API_IMPORTERS,
	UNIVERSAL_WORKSPACE_FOLDERS,
	type Workspace,
} from "./workspaces"

// the server dependencies a universal package's runtime closure never reaches
const SERVER_DEPENDENCY_NAMES = new Set([
	"drizzle-orm",
	"@neondatabase/serverless",
	"stripe",
	"satori",
	"@resvg/resvg-js",
	"posthog-node",
	"@sentry/bun",
	"@opentelemetry/sdk-trace-node",
])
const SERVER_DEPENDENCY_SCOPE = "@temporalio/"

/** An installed package: its folder, and the names of its own dependencies. */
export type ResolvedPackage = { packageDirectory: string; dependencyNames: string[] }

/** Returns the installed package a name resolves to from a folder, or undefined if it is not installed. */
export type ResolvePackage = (options: { packageName: string; fromDirectory: string }) => ResolvedPackage | undefined

/** The violations found, one line each, and a note for each package the closure walk could not resolve. */
export type BoundaryCheckResult = { violations: string[]; notes: string[] }

// the workspaces, the files, and the resolver the check runs on
type CheckPackageBoundariesOptions = {
	workspaces: Workspace[]
	sourceFiles: SourceFile[]
	resolvePackage: ResolvePackage
}

/**
 * Returns every boundary violation across the workspaces, and the notes from the closure walk.
 */
export function checkPackageBoundaries({
	workspaces,
	sourceFiles,
	resolvePackage,
}: CheckPackageBoundariesOptions): BoundaryCheckResult {
	// the import rules, per file, and the package.json rules, per workspace
	const importViolations = sourceFiles.flatMap((sourceFile) => toImportViolations({ workspaces, sourceFile }))
	const packageJsonViolations = workspaces.flatMap((workspace) => toPackageJsonViolations({ workspaces, workspace }))

	// the runtime closure of each universal package
	const universalWorkspaces = workspaces.filter((workspace) => UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder))
	const closureResults = universalWorkspaces.map((workspace) => toClosureViolations({ workspace, resolvePackage }))
	const closureViolations = closureResults.flatMap((closureResult) => closureResult.violations)
	const notes = closureResults.flatMap((closureResult) => closureResult.notes)
	return { violations: [...importViolations, ...packageJsonViolations, ...closureViolations], notes }
}

// the workspaces and the one whose package.json is checked
type ToPackageJsonViolationsOptions = { workspaces: Workspace[]; workspace: Workspace }

/**
 * Returns a workspace's package.json violations: tsconfig references that differ from its @carlnotes dependencies, and
 * a universal package that depends on a non-universal one.
 */
export function toPackageJsonViolations({ workspaces, workspace }: ToPackageJsonViolationsOptions): string[] {
	// the @carlnotes names the package.json declares, and the ones the tsconfig references
	const declaredNames = toCarlnotesDependencyNames(workspace)
	const referencedNames = workspace.references.map(
		(referenceFolder) => workspaces.find((candidate) => candidate.folder === referenceFolder)?.name ?? referenceFolder,
	)

	// the two sets match
	const violations: string[] = []
	const hasMissingReference = declaredNames.some((name) => !referencedNames.includes(name))
	const hasExtraReference = referencedNames.some((name) => !declaredNames.includes(name))
	if (hasMissingReference || hasExtraReference) {
		const referenceList = toNameList(referencedNames)
		const declaredList = toNameList(declaredNames)
		violations.push(
			`${workspace.folder}: ${workspace.folder}/tsconfig.json references ${referenceList}. the package.json declares ${declaredList}`,
		)
	}

	// a universal package, and the mobile app, depend on universal packages only
	if (UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder) || workspace.folder === MOBILE_APP_FOLDER) {
		violations.push(...toNonUniversalDependencyViolations({ workspaces, workspace }))
	}
	return violations
}

// the non-universal @carlnotes packages a universal workspace or the mobile app depends on. the api passes as a
// type-only dev dependency only for the workspaces allowed it. the mobile app is not one
function toNonUniversalDependencyViolations({ workspaces, workspace }: ToPackageJsonViolationsOptions): string[] {
	const violations: string[] = []
	for (const dependencyName of toCarlnotesDependencyNames(workspace)) {
		// a universal dependency, or the api declared for its types alone
		const isUniversal = workspaces.some(
			(candidate) => candidate.name === dependencyName && UNIVERSAL_WORKSPACE_FOLDERS.has(candidate.folder),
		)
		const isTypeOnlyApi =
			dependencyName === API_PACKAGE_NAME &&
			TYPE_ONLY_API_IMPORTERS.has(workspace.folder) &&
			!workspace.dependencies.includes(dependencyName)

		// name the rule for the workspace kind
		const ruleText =
			workspace.folder === MOBILE_APP_FOLDER
				? "the mobile app depends on the universal packages only"
				: "a universal package depends on universal packages only"

		// report a dependency neither universal nor the allowed type-only api
		if (!isUniversal && !isTypeOnlyApi) {
			violations.push(`${workspace.folder}: ${workspace.folder}/package.json depends on ${dependencyName}. ${ruleText}`)
		}
	}
	return violations
}

// the @carlnotes names a workspace declares in dependencies and devDependencies, each once
function toCarlnotesDependencyNames(workspace: Workspace): string[] {
	const dependencyNames = [...workspace.dependencies, ...workspace.devDependencies]
	return [...new Set(dependencyNames.filter((name) => name.startsWith("@carlnotes/")))]
}

// a readable list of names, or the word nothing
function toNameList(names: string[]): string {
	return names.length > 0 ? names.join(", ") : "nothing"
}

// the universal workspace whose closure is walked, and the resolver that finds each installed package
type ToClosureViolationsOptions = { workspace: Workspace; resolvePackage: ResolvePackage }

// one hop of the walk: the package, the folder it resolves from, and the chain of names that led to it
type ClosureHop = { packageName: string; fromDirectory: string; chain: string[] }

/**
 * Returns the server dependencies a universal package's runtime closure reaches, with the chain to each, and a note for
 * each package that did not resolve.
 */
export function toClosureViolations({ workspace, resolvePackage }: ToClosureViolationsOptions): BoundaryCheckResult {
	// walk the runtime dependencies depth-first, each installed package once
	const result: BoundaryCheckResult = { violations: [], notes: [] }
	const visitedDirectories = new Set<string>()
	const walk = ({ packageName, fromDirectory, chain }: ClosureHop): void => {
		// a server dependency ends this chain with a violation
		if (isServerDependency(packageName)) {
			result.violations.push(
				`${workspace.folder}: ${workspace.folder}/package.json reaches ${packageName} through ${chain.join(" -> ")}. a universal package never depends on a server package`,
			)
			return
		}

		// resolve the package, and note one that is not installed
		const resolvedPackage = resolvePackage({ packageName, fromDirectory })
		if (!resolvedPackage) {
			result.notes.push(`${workspace.folder}: ${packageName} did not resolve from ${fromDirectory}, skipped`)
			return
		}

		// follow the package's own dependencies from its folder, once per installed copy
		if (visitedDirectories.has(resolvedPackage.packageDirectory)) {
			return
		}
		visitedDirectories.add(resolvedPackage.packageDirectory)
		for (const dependencyName of resolvedPackage.dependencyNames) {
			walk({
				packageName: dependencyName,
				fromDirectory: resolvedPackage.packageDirectory,
				chain: [...chain, dependencyName],
			})
		}
	}

	// start from each runtime dependency of the workspace itself
	for (const packageName of workspace.dependencies) {
		walk({ packageName, fromDirectory: workspace.folder, chain: [packageName] })
	}
	return result
}

// whether a package name is one of the server dependencies, or sits in the temporal scope
function isServerDependency(packageName: string): boolean {
	return SERVER_DEPENDENCY_NAMES.has(packageName) || packageName.startsWith(SERVER_DEPENDENCY_SCOPE)
}
