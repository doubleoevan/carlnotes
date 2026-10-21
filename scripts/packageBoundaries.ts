// the workspace boundary rules the check script runs over the workspaces, the files, and the installed packages
import { posix } from "node:path"

// the app packages, which no app or package imports
const APP_PACKAGE_NAMES = new Set(["@carlnotes/web", "@carlnotes/api", "@carlnotes/worker", "@carlnotes/docs"])

// the api package, and the workspaces that import it as types only
const API_PACKAGE_NAME = "@carlnotes/api"
const TYPE_ONLY_API_IMPORTERS = new Set(["packages/client", "apps/web"])

// the universal packages: a browser, a phone, and the server all load them
export const UNIVERSAL_WORKSPACE_FOLDERS = new Set([
	"packages/contracts",
	"packages/client",
	"packages/core",
	"packages/tokens",
])

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

// a test file, which may import bun and node modules inside a universal package
const TEST_FILE_PATTERN = /(?:\.test\.tsx?|TestFixtures\.ts)$/

// a bun or node module
const RUNTIME_MODULE_PATTERN = /^(?:bun|bun:.+|node:.+)$/

// an import or export statement with its quoted path, across any number of lines, a side-effect import, or an
// import(). the match stops before the next import or export keyword. the code has no semicolons to end a statement on
const IMPORT_PATTERN =
	/\b(?:import|export)\s(?:(?!(?:import|export)\s)[\s\S])*?from\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g

// a type-only import or export statement, and the specifiers of a named import
const TYPE_ONLY_STATEMENT_PATTERN = /^(?:import|export)\s+type\s/
const NAMED_IMPORT_SPECIFIERS_PATTERN = /^import\s*\{([^}]*)\}\s*from/

/**
 * A workspace's package.json and tsconfig: its repo folder, its name, its dependency names, whether it has a tsconfig,
 * and the folders that tsconfig references. hasTsconfig is false for a CSS-only package.
 */
export type Workspace = {
	folder: string
	name: string
	dependencies: string[]
	devDependencies: string[]
	hasTsconfig: boolean
	references: string[]
}

/** A source file under a workspace: its path from the repo root, and its text. */
export type SourceFile = { filePath: string; fileText: string }

/** An import found in a file: its path, the line it starts on, and whether it brings in types only. */
export type ParsedImport = { importPath: string; lineNumber: number; isTypeOnly: boolean }

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

// the workspaces and the file whose imports are checked
type ToImportViolationsOptions = { workspaces: Workspace[]; sourceFile: SourceFile }

/**
 * Returns one file's violations: an app import, a relative import that leaves the workspace, an undeclared @carlnotes
 * import, and a bun or node import inside a universal package.
 */
export function toImportViolations({ workspaces, sourceFile }: ToImportViolationsOptions): string[] {
	// the workspace the file belongs to. a file outside every workspace has no boundary to cross
	const workspace = workspaces.find((candidate) => isInsideFolder(sourceFile.filePath, candidate.folder))
	if (!workspace) {
		return []
	}

	// check each import against the rules
	const violations: string[] = []
	for (const parsedImport of toParsedImports(sourceFile.fileText)) {
		const violation = toImportViolation({ workspace, sourceFile, parsedImport })

		// name the workspace, the file and line, the import, and the rule it breaks
		if (violation) {
			const location = `${sourceFile.filePath}:${parsedImport.lineNumber}`
			violations.push(`${workspace.folder}: ${location} imports ${parsedImport.importPath}. ${violation}`)
		}
	}
	return violations
}

/**
 * Returns each import in a file's text with the line it starts on and whether it brings in types only.
 */
export function toParsedImports(fileText: string): ParsedImport[] {
	// each statement's path, line, and type-only flag
	const parsedImports: ParsedImport[] = []
	for (const importMatch of fileText.matchAll(IMPORT_PATTERN)) {
		const importPath = importMatch[1] ?? importMatch[2] ?? ""
		const lineNumber = fileText.slice(0, importMatch.index).split("\n").length
		parsedImports.push({ importPath, lineNumber, isTypeOnly: isTypeOnlyImport(importMatch[0]) })
	}
	return parsedImports
}

/**
 * Returns whether an import statement brings in types only: import type, export type, or every specifier marked type.
 */
export function isTypeOnlyImport(statementText: string): boolean {
	// a statement-level type import or re-export
	if (TYPE_ONLY_STATEMENT_PATTERN.test(statementText)) {
		return true
	}

	// a named import whose every specifier is marked type
	const specifiersMatch = NAMED_IMPORT_SPECIFIERS_PATTERN.exec(statementText)
	if (!specifiersMatch) {
		return false
	}
	const specifiers = (specifiersMatch[1] ?? "").split(",").map((specifier) => specifier.trim())
	const namedSpecifiers = specifiers.filter((specifier) => specifier.length > 0)
	return namedSpecifiers.length > 0 && namedSpecifiers.every((specifier) => specifier.startsWith("type "))
}

// the workspace, the file, and the import one rule check runs on
type ToImportViolationOptions = { workspace: Workspace; sourceFile: SourceFile; parsedImport: ParsedImport }

// the rule one import breaks, or undefined
function toImportViolation({ workspace, sourceFile, parsedImport }: ToImportViolationOptions): string | undefined {
	// a relative import stays inside the workspace
	const { importPath, isTypeOnly } = parsedImport
	if (importPath.startsWith(".")) {
		const resolvedPath = posix.normalize(`${posix.dirname(sourceFile.filePath)}/${importPath}`)
		return isInsideFolder(resolvedPath, workspace.folder) ? undefined : "a relative import stays inside its workspace"
	}

	// a bun or node module stays out of a universal package, outside its tests
	if (RUNTIME_MODULE_PATTERN.test(importPath)) {
		return UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder) && !TEST_FILE_PATTERN.test(sourceFile.filePath)
			? "a universal package imports no bun or node module"
			: undefined
	}

	// a package outside @carlnotes is no workspace boundary
	const packageName = toPackageName(importPath)
	if (!packageName.startsWith("@carlnotes/")) {
		return undefined
	}

	// an app is imported by nothing, except the api as types only from the client and the web app
	const isTypeOnlyApiImport =
		packageName === API_PACKAGE_NAME && isTypeOnly && TYPE_ONLY_API_IMPORTERS.has(workspace.folder)
	if (APP_PACKAGE_NAMES.has(packageName) && !isTypeOnlyApiImport) {
		return "an app is never imported"
	}

	// the package.json declares the package
	const isDeclared = workspace.dependencies.includes(packageName) || workspace.devDependencies.includes(packageName)
	return isDeclared ? undefined : `the package.json does not declare ${packageName}`
}

// the package an import path names: the first two segments of a scoped path, the first segment otherwise
function toPackageName(importPath: string): string {
	const segments = importPath.split("/")
	const segmentCount = importPath.startsWith("@") ? 2 : 1
	return segments.slice(0, segmentCount).join("/")
}

// whether a repo-relative path is the folder or sits inside it
function isInsideFolder(path: string, folder: string): boolean {
	return path === folder || path.startsWith(`${folder}/`)
}

// the workspaces and the one whose package.json is checked
type ToPackageJsonViolationsOptions = { workspaces: Workspace[]; workspace: Workspace }

/**
 * Returns a workspace's package.json violations: tsconfig references that differ from its @carlnotes dependencies, and
 * a universal package that depends on a non-universal one.
 */
export function toPackageJsonViolations({ workspaces, workspace }: ToPackageJsonViolationsOptions): string[] {
	// the @carlnotes names the package.json declares, minus a package with no tsconfig to reference, and the ones the
	// tsconfig references
	const declaredNames = toCarlnotesDependencyNames(workspace).filter(
		(name) => workspaces.find((candidate) => candidate.name === name)?.hasTsconfig ?? true,
	)
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

	// a universal package depends on universal packages only
	if (UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder)) {
		violations.push(...toNonUniversalDependencyViolations({ workspaces, workspace }))
	}
	return violations
}

// the non-universal @carlnotes packages a universal workspace depends on. the api passes as a type-only dev dependency
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
		if (!isUniversal && !isTypeOnlyApi) {
			violations.push(
				`${workspace.folder}: ${workspace.folder}/package.json depends on ${dependencyName}. a universal package depends on universal packages only`,
			)
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
