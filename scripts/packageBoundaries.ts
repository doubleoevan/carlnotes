// the workspace boundary check the check script runs: each file's import rules, each workspace's package.json rules,
// the runtime closure of each universal package over the installed packages, and the web app's bundled imports
import { isImageRuntimeFile, toImportViolations, toPackageName, toPackageValueImports } from "./importBoundaries"
import {
	API_PACKAGE_NAME,
	isInsideFolder,
	MOBILE_APP_FOLDER,
	type SourceFile,
	TYPE_ONLY_API_IMPORTERS,
	UNIVERSAL_WORKSPACE_FOLDERS,
	WEB_APP_FOLDER,
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
	// the import rules, per file, the package.json rules, per workspace, and the web app's bundled imports
	const importViolations = sourceFiles.flatMap((sourceFile) => toImportViolations({ workspaces, sourceFile }))
	const packageJsonViolations = workspaces.flatMap((workspace) => toPackageJsonViolations({ workspaces, workspace }))
	const webClosureViolations = toWebClosureViolations({ workspaces, sourceFiles })

	// the runtime closure of each universal package
	const universalWorkspaces = workspaces.filter((workspace) => UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder))
	const closureResults = universalWorkspaces.map((workspace) => toClosureViolations({ workspace, resolvePackage }))
	const closureViolations = closureResults.flatMap((closureResult) => closureResult.violations)
	const notes = closureResults.flatMap((closureResult) => closureResult.notes)
	const violations = [...importViolations, ...packageJsonViolations, ...webClosureViolations, ...closureViolations]
	return { violations, notes }
}

// the workspaces, and the source files whose imports the web closure rule reads
type ToWebClosureViolationsOptions = { workspaces: Workspace[]; sourceFiles: SourceFile[] }

/**
 * Returns a violation for each third-party package that runtime code in the web app's @carlnotes closure imports and
 * the web app does not declare in dependencies. The web server build bundles those packages and leaves their imports
 * external.
 */
export function toWebClosureViolations({ workspaces, sourceFiles }: ToWebClosureViolationsOptions): string[] {
	// the web app, and the @carlnotes packages its runtime dependencies reach
	const webWorkspace = workspaces.find((workspace) => workspace.folder === WEB_APP_FOLDER)
	if (!webWorkspace) {
		return []
	}
	const closureWorkspaces = toCarlnotesClosure({ workspaces, workspace: webWorkspace })

	// the first place the closure imports each third-party package
	const importLocationByPackageName = new Map<string, string>()
	for (const closureWorkspace of closureWorkspaces) {
		addImportLocations({ workspace: closureWorkspace, sourceFiles, importLocationByPackageName })
	}

	// name each package the web app does not declare in dependencies, the only ones the production install links
	const webDependencyNames = new Set(webWorkspace.dependencies)
	const undeclaredImports = [...importLocationByPackageName].filter(
		([packageName]) => !webDependencyNames.has(packageName),
	)
	return undeclaredImports.map(
		([packageName, location]) =>
			`${WEB_APP_FOLDER}: ${location} imports ${packageName}. the web server build leaves it external. declare it in ${WEB_APP_FOLDER}/package.json dependencies`,
	)
}

// the workspaces, and the one whose @carlnotes runtime closure is walked
type ToCarlnotesClosureOptions = { workspaces: Workspace[]; workspace: Workspace }

// the @carlnotes workspaces a workspace's runtime dependencies reach, each once
function toCarlnotesClosure({ workspaces, workspace }: ToCarlnotesClosureOptions): Workspace[] {
	const closureWorkspaces: Workspace[] = []
	const pendingDependencyNames = [...workspace.dependencies]
	while (pendingDependencyNames.length > 0) {
		// skip a name that is no workspace, or a workspace already reached
		const dependencyName = pendingDependencyNames.shift()
		const dependencyWorkspace = workspaces.find((candidate) => candidate.name === dependencyName)
		if (!dependencyWorkspace || closureWorkspaces.includes(dependencyWorkspace)) {
			continue
		}

		// keep the workspace, and walk its own runtime dependencies next
		closureWorkspaces.push(dependencyWorkspace)
		pendingDependencyNames.push(...dependencyWorkspace.dependencies)
	}
	return closureWorkspaces
}

// the closure workspace whose files are read, the source files, and the map each first import location is added to
type AddImportLocationsOptions = {
	workspace: Workspace
	sourceFiles: SourceFile[]
	importLocationByPackageName: Map<string, string>
}

// add the first location of each third-party package that a workspace's runtime files import
function addImportLocations({ workspace, sourceFiles, importLocationByPackageName }: AddImportLocationsOptions): void {
	// the workspace's files the image runs
	const runtimeFiles = sourceFiles.filter(
		(sourceFile) =>
			isInsideFolder(sourceFile.filePath, workspace.folder) && isImageRuntimeFile({ workspace, sourceFile }),
	)

	// each third-party value import, keeping the first location found
	for (const sourceFile of runtimeFiles) {
		for (const parsedImport of toPackageValueImports(sourceFile)) {
			// a @carlnotes import is a workspace the walk already covers
			const packageName = toPackageName(parsedImport.importPath)
			if (!packageName.startsWith("@carlnotes/") && !importLocationByPackageName.has(packageName)) {
				importLocationByPackageName.set(packageName, `${sourceFile.filePath}:${parsedImport.lineNumber}`)
			}
		}
	}
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
