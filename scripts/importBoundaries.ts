// the import rules the boundary check runs over each source file: the app, mobile, declaration, dev dependency,
// relative import, and runtime module rules, and each app's component browser rule
import { isBuiltin } from "node:module"
import { posix } from "node:path"
import {
	API_PACKAGE_NAME,
	APP_PACKAGE_NAMES,
	IMAGE_APP_FOLDERS,
	isInsideFolder,
	MOBILE_APP_FOLDER,
	type SourceFile,
	STORY_FILE_PATTERN,
	TEST_FILE_PATTERN,
	TYPE_ONLY_API_IMPORTERS,
	UNIVERSAL_PACKAGE_NAMES,
	UNIVERSAL_WORKSPACE_FOLDERS,
	WEB_APP_FOLDER,
	WEB_SOURCE_FOLDER,
	type Workspace,
} from "./workspaces"

/** The web app's component browser folders: the component browser's config and its pages. */
export const WEB_COMPONENT_BROWSER_FOLDERS = new Set([
	`${WEB_APP_FOLDER}/.storybook`,
	`${WEB_APP_FOLDER}/src/nightshift`,
])

/** The mobile app's component browser paths: Storybook's config folder and the route that shows it. */
export const MOBILE_COMPONENT_BROWSER_PATHS = new Set([
	`${MOBILE_APP_FOLDER}/.rnstorybook`,
	`${MOBILE_APP_FOLDER}/app/storybook.tsx`,
])

/** The end of a story file's name. */
export const STORY_FILE_SUFFIX = ".stories.tsx"

// an import of a file in the mobile app's Storybook config folder
const MOBILE_STORYBOOK_CONFIG_IMPORT_PATTERN = /(?:^|\/)\.rnstorybook(?:\/|$)/

// the design system package, and the modules any web file may import: its stylesheet, shared control classes, the coffee mug,
// the sign-in providers' icons, the note body's style, and the theme's variable names, each free of palette values
const NIGHTSHIFT_PACKAGE_NAME = "@carlnotes/nightshift"
const UNRESTRICTED_NIGHTSHIFT_IMPORT_PATHS = new Set([
	`${NIGHTSHIFT_PACKAGE_NAME}/tokens.css`,
	`${NIGHTSHIFT_PACKAGE_NAME}/classNames`,
	`${NIGHTSHIFT_PACKAGE_NAME}/field`,
	`${NIGHTSHIFT_PACKAGE_NAME}/pagination`,
	`${NIGHTSHIFT_PACKAGE_NAME}/coffeeMug`,
	`${NIGHTSHIFT_PACKAGE_NAME}/coffeeCup`,
	`${NIGHTSHIFT_PACKAGE_NAME}/oauthProviderIcons`,
	`${NIGHTSHIFT_PACKAGE_NAME}/noteHtmlStyle`,
	`${NIGHTSHIFT_PACKAGE_NAME}/theme`,
	`${NIGHTSHIFT_PACKAGE_NAME}/assets/carl-avatar.png`,
	`${NIGHTSHIFT_PACKAGE_NAME}/assets/vienna-avatar.png`,
])

/** The import path of a Nightshift component contract, before the component's name. */
export const COMPONENT_CONTRACT_IMPORT_PREFIX = `${NIGHTSHIFT_PACKAGE_NAME}/components/`

// a story file, and Storybook's own packages
const STORY_IMPORT_PATTERN = /\.stories(?:\.tsx?)?$|^(?:storybook|@storybook\/[^/]+)(?:\/|$)/

// a bun or node module
const RUNTIME_MODULE_PATTERN = /^(?:bun|bun:.+|node:.+)$/

// a path alias or a virtual module, which names no installed package: the @/ source alias, an absolute path, and the
// astro and vite virtual modules
const LOCAL_IMPORT_PATTERN = /^(?:@\/|\/|astro:|virtual:)/

// a file the production image never runs: a smoke run, its fixtures, a test harness, or a build tool's config
const DEVELOPMENT_FILE_PATTERN = /(?:\.smoke\.ts|SmokeFixtures\.ts|TestHarness\.tsx?|\.config\.(?:ts|mjs))$/

// an import or export statement with its quoted path, across any number of lines, a side-effect import, an import(),
// or a require(). the match stops before the next import or export keyword. the code has no semicolons to end a
// statement on
const IMPORT_PATTERN =
	/\b(?:import|export)\s(?:(?!(?:import|export)\s)[\s\S])*?from\s*["']([^"']+)["']|\b(?:import|require)\s*\(?\s*["']([^"']+)["']/g

// a type-only import or export statement, and the specifiers of a named import
const TYPE_ONLY_STATEMENT_PATTERN = /^(?:import|export)\s+type\s/
const NAMED_IMPORT_SPECIFIERS_PATTERN = /^import\s*\{([^}]*)\}\s*from/

/** An import found in a file: its statement, its path, the line it starts on, and whether it brings in types only. */
export type ParsedImport = { statementText: string; importPath: string; lineNumber: number; isTypeOnly: boolean }

// the workspaces and the file whose imports are checked
type ToImportViolationsOptions = { workspaces: Workspace[]; sourceFile: SourceFile }

/**
 * Returns one file's violations: an app import, a relative import that leaves the workspace, an undeclared package, a
 * dev dependency in runtime code, and a bun or node import inside a universal package.
 */
export function toImportViolations({ workspaces, sourceFile }: ToImportViolationsOptions): string[] {
	// the workspace the file belongs to. a file outside every workspace has no boundary to cross
	const workspace = workspaces.find((candidate) => isInsideFolder(sourceFile.filePath, candidate.folder))
	if (!workspace) {
		return []
	}

	// check each import against the rules. a third-party path is checked only if the transpiler also finds it or the
	// statement brings in types only, so an import-like sentence inside a string never counts
	const violations: string[] = []
	const scannedImportPaths = toScannedImportPaths(sourceFile)
	for (const parsedImport of toParsedImports(sourceFile.fileText)) {
		const isCheckedImport = scannedImportPaths.has(parsedImport.importPath) || parsedImport.isTypeOnly
		const violation = toImportViolation({ workspace, sourceFile, parsedImport, isCheckedImport })

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
		parsedImports.push({
			statementText: importMatch[0],
			importPath,
			lineNumber,
			isTypeOnly: isTypeOnlyImport(importMatch[0]),
		})
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

// the import paths Bun's transpiler finds in a file, which skips strings and comments. a file it cannot parse, such as
// an astro component, finds none
function toScannedImportPaths(sourceFile: SourceFile): Set<string> {
	try {
		// scan with the loader the file's extension names
		const loader = sourceFile.filePath.endsWith(".tsx") ? "tsx" : "ts"
		const scannedImports = new Bun.Transpiler({ loader }).scanImports(sourceFile.fileText)
		return new Set(scannedImports.map((scannedImport) => scannedImport.path))
	} catch {
		return new Set()
	}
}

// the workspace, the file, the import one rule check runs on, and whether the transpiler finds the import or it brings in types only
type ToImportViolationOptions = {
	workspace: Workspace
	sourceFile: SourceFile
	parsedImport: ParsedImport
	isCheckedImport: boolean
}

// the rule one import breaks, or undefined
function toImportViolation({
	workspace,
	sourceFile,
	parsedImport,
	isCheckedImport,
}: ToImportViolationOptions): string | undefined {
	// each app keeps its stories and Storybook inside its component browser, and the web app keeps the rest of
	// Nightshift's TypeScript there too
	const { importPath, isTypeOnly } = parsedImport
	const componentBrowserViolation = toComponentBrowserImportViolation({ workspace, sourceFile, importPath })
	if (componentBrowserViolation) {
		return componentBrowserViolation
	}

	// a relative import stays inside the workspace
	if (importPath.startsWith(".")) {
		const resolvedPath = posix.normalize(`${posix.dirname(sourceFile.filePath)}/${importPath}`)
		return isInsideFolder(resolvedPath, workspace.folder) ? undefined : "a relative import stays inside its workspace"
	}

	// a bun or node module, a node built-in named with or without its node: prefix, stays out of a universal package,
	// outside its tests
	if (RUNTIME_MODULE_PATTERN.test(importPath) || isBuiltin(importPath)) {
		return UNIVERSAL_WORKSPACE_FOLDERS.has(workspace.folder) && !TEST_FILE_PATTERN.test(sourceFile.filePath)
			? "a universal package imports no bun or node module"
			: undefined
	}

	// a path alias or a virtual module names no package
	if (LOCAL_IMPORT_PATTERN.test(importPath)) {
		return undefined
	}

	// a @carlnotes package follows the workspace rules, and any other package the third-party rules
	const packageName = toPackageName(importPath)
	if (!packageName.startsWith("@carlnotes/")) {
		return isCheckedImport ? toThirdPartyImportViolation({ workspace, sourceFile, packageName, isTypeOnly }) : undefined
	}
	return toCarlnotesImportViolation({ workspace, packageName, isTypeOnly })
}

/**
 * Returns a file's value imports of installed packages, each one the transpiler also finds.
 */
export function toPackageValueImports(sourceFile: SourceFile): ParsedImport[] {
	const scannedImportPaths = toScannedImportPaths(sourceFile)
	return toParsedImports(sourceFile.fileText).filter(
		(parsedImport) =>
			!parsedImport.isTypeOnly &&
			scannedImportPaths.has(parsedImport.importPath) &&
			isPackageImportPath(parsedImport.importPath),
	)
}

/**
 * Returns whether an import path names an installed package: not a relative path, an alias, a virtual module, or a
 * bun or node module.
 */
export function isPackageImportPath(importPath: string): boolean {
	const isRuntimeModule = RUNTIME_MODULE_PATTERN.test(importPath) || isBuiltin(importPath)
	return !importPath.startsWith(".") && !LOCAL_IMPORT_PATTERN.test(importPath) && !isRuntimeModule
}

// the workspace and the file the runtime check reads
type IsImageRuntimeFileOptions = { workspace: Workspace; sourceFile: SourceFile }

/**
 * Returns whether a file is code the production image runs: a file of an app the image runs or of a package, outside
 * the tests, stories, smoke runs, build configs, and component browser. Of the web app, only its source counts.
 */
export function isImageRuntimeFile({ workspace, sourceFile }: IsImageRuntimeFileOptions): boolean {
	// an app the image runs, or a package, and of the web app only the source its builds bundle
	const { filePath } = sourceFile
	const isImageWorkspace = IMAGE_APP_FOLDERS.has(workspace.folder) || workspace.folder.startsWith("packages/")
	if (!isImageWorkspace || (workspace.folder === WEB_APP_FOLDER && !isInsideFolder(filePath, WEB_SOURCE_FOLDER))) {
		return false
	}

	// a test, a story, a smoke run, a build config, and the component browser never run in the image
	const isDevelopmentFile =
		TEST_FILE_PATTERN.test(filePath) || STORY_FILE_PATTERN.test(filePath) || DEVELOPMENT_FILE_PATTERN.test(filePath)
	return !isDevelopmentFile && !isComponentBrowserFile(filePath)
}

/**
 * Returns the package an import path names: the first two segments of a scoped path, the first segment otherwise,
 * without a bundler query such as ?url.
 */
export function toPackageName(importPath: string): string {
	const segments = (importPath.split("?")[0] ?? "").split("/")
	const segmentCount = importPath.startsWith("@") ? 2 : 1
	return segments.slice(0, segmentCount).join("/")
}

// the workspace, the file, the third-party package an import names, and whether the import brings in types only
type ToThirdPartyImportViolationOptions = {
	workspace: Workspace
	sourceFile: SourceFile
	packageName: string
	isTypeOnly: boolean
}

// the third-party rule one import breaks: a package its workspace does not declare, or a dev dependency in runtime code
function toThirdPartyImportViolation({
	workspace,
	sourceFile,
	packageName,
	isTypeOnly,
}: ToThirdPartyImportViolationOptions): string | undefined {
	// the package.json declares the package, or for a type-only import its @types package. one that only a sibling
	// workspace or the root declares fails
	const isRuntimeDeclared =
		workspace.dependencies.includes(packageName) || workspace.peerDependencies.includes(packageName)
	const isTypesDeclared = isTypeOnly && workspace.devDependencies.includes(toTypesPackageName(packageName))
	if (!isRuntimeDeclared && !workspace.devDependencies.includes(packageName) && !isTypesDeclared) {
		return `the package.json does not declare ${packageName}`
	}

	// code the image runs imports a value from a dependency. the production install leaves dev dependencies out
	const isRuntimeValueImport = !isTypeOnly && isImageRuntimeFile({ workspace, sourceFile })
	return isRuntimeValueImport && !isRuntimeDeclared
		? `the production install leaves out a dev dependency. move ${packageName} to dependencies`
		: undefined
}

// the DefinitelyTyped package that holds a package's types: @types/hast for hast, @types/scope__name for @scope/name
function toTypesPackageName(packageName: string): string {
	return `@types/${packageName.replace(/^@/, "").replace("/", "__")}`
}

// the workspace, the @carlnotes package an import names, and whether the import brings in types only
type ToCarlnotesImportViolationOptions = { workspace: Workspace; packageName: string; isTypeOnly: boolean }

// the @carlnotes rule one import breaks: the app rule, the mobile rule, or the declaration rule
function toCarlnotesImportViolation({
	workspace,
	packageName,
	isTypeOnly,
}: ToCarlnotesImportViolationOptions): string | undefined {
	// an app is imported by nothing, except the api as types only from the api client package and the web app
	const isTypeOnlyApiImport =
		packageName === API_PACKAGE_NAME && isTypeOnly && TYPE_ONLY_API_IMPORTERS.has(workspace.folder)
	if (APP_PACKAGE_NAMES.has(packageName) && !isTypeOnlyApiImport) {
		return "an app is never imported"
	}

	// the mobile app imports @carlnotes packages only among the universal four
	if (workspace.folder === MOBILE_APP_FOLDER && !UNIVERSAL_PACKAGE_NAMES.has(packageName)) {
		return "the mobile app imports only the universal packages"
	}

	// the package.json declares the package
	const isDeclared = workspace.dependencies.includes(packageName) || workspace.devDependencies.includes(packageName)
	return isDeclared ? undefined : `the package.json does not declare ${packageName}`
}

// the workspace, the file, and the import path the component browser rule checks
type ToComponentBrowserImportViolationOptions = { workspace: Workspace; sourceFile: SourceFile; importPath: string }

// the component browser rule one import breaks: a story, Storybook, or the mobile Storybook config outside a story or
// the component browser, and a web import of a Nightshift module outside the unrestricted ones and the contracts
function toComponentBrowserImportViolation({
	workspace,
	sourceFile,
	importPath,
}: ToComponentBrowserImportViolationOptions): string | undefined {
	// the mobile app imports a story, Storybook, or Storybook's config only from a story or the component browser
	const isComponentBrowserSourceFile = isComponentBrowserFile(sourceFile.filePath)
	if (workspace.folder === MOBILE_APP_FOLDER) {
		const isMobileStorybookImport =
			STORY_IMPORT_PATTERN.test(importPath) || MOBILE_STORYBOOK_CONFIG_IMPORT_PATTERN.test(importPath)
		return isMobileStorybookImport && !isComponentBrowserSourceFile
			? "the mobile app imports a story or Storybook only from a story or the component browser"
			: undefined
	}

	// only the web app's files are checked past here
	if (workspace.folder !== WEB_APP_FOLDER) {
		return undefined
	}

	// a story or Storybook outside the component browser
	if (STORY_IMPORT_PATTERN.test(importPath) && !isComponentBrowserSourceFile) {
		return "the web app imports a story or Storybook only from a story or the component browser"
	}

	// a Nightshift module other than the unrestricted ones and the contracts, outside a test and the component browser
	const isNightshiftModuleImport =
		importPath.startsWith(`${NIGHTSHIFT_PACKAGE_NAME}/`) &&
		!UNRESTRICTED_NIGHTSHIFT_IMPORT_PATHS.has(importPath) &&
		!importPath.startsWith(COMPONENT_CONTRACT_IMPORT_PREFIX)
	const isNightshiftImporter = isComponentBrowserSourceFile || TEST_FILE_PATTERN.test(sourceFile.filePath)

	// name the rule that import breaks
	return isNightshiftModuleImport && !isNightshiftImporter
		? "the web app imports this nightshift module only from a test, a story, or the component browser"
		: undefined
}

// whether a repo-relative path is a component browser file in either app: a story, or a file in the component
// browser's config, its pages, or the mobile route that shows it
function isComponentBrowserFile(filePath: string): boolean {
	const componentBrowserPaths = [...WEB_COMPONENT_BROWSER_FOLDERS, ...MOBILE_COMPONENT_BROWSER_PATHS]
	const isInComponentBrowserPath = componentBrowserPaths.some((componentBrowserPath) =>
		isInsideFolder(filePath, componentBrowserPath),
	)
	return isInComponentBrowserPath || filePath.endsWith(STORY_FILE_SUFFIX)
}
