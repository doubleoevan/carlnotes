// the client parity rules: every api capability the web reaches is reachable from the mobile app or listed in the
// inventory with its reason, decided by walking each app's imports from its routes through the shared packages
import { posix } from "node:path"
import { toParsedImports } from "./importBoundaries"
import {
	isInsideFolder,
	MOBILE_APP_FOLDER,
	MOBILE_ROUTES_FOLDER,
	type SourceFile,
	STORY_FILE_PATTERN,
	TEST_FILE_PATTERN,
	WEB_APP_FOLDER,
} from "./workspaces"

// the api client modules whose exported functions are the capabilities, and the inventory the check reads
export const CLIENT_PACKAGE_FOLDER = "packages/client"
export const PARITY_INVENTORY_PATH = "apps/mobile/parity.md"
export const PARITY_INVENTORY_HEADING = "## Web-only client capabilities"

// where the web's walk starts: its route files
const WEB_ROUTES_FOLDER = "apps/web/src/routes"

// an import() or a require(), a side-effect import, and the specifiers of a statement: the braces, and a namespace
const CALLED_IMPORT_PATTERN = /^(?:import|require)\s*\(/
const SIDE_EFFECT_IMPORT_PATTERN = /^import\s*["']/
const SPECIFIER_TEXT_PATTERN = /^(?:import|export)\s+([\s\S]*?)\s+from\s*["']/
const NAMED_SPECIFIERS_PATTERN = /\{([^}]*)\}/
const NAMESPACE_SPECIFIER_PATTERN = /^\*|\*\s+as\s+\w+/

// an exported function or constant of an api client module
const CLIENT_EXPORT_PATTERN = /^export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm

// a table row of the inventory: the capability in backticks, its status, and its reason or prompt
const INVENTORY_ROW_PATTERN = /^\|\s*`([^`]+)`\s*\|\s*[^|]*\|\s*([^|]*)\|/

// the extensions and index file an import path may leave off
const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", "/index.ts"]

// a capability of an api client module, named module.function
export type ClientCapability = { key: string; modulePath: string; exportName: string }

// one inventory row: the capability it lists, and the reason or prompt that keeps it web-only
export type ParityInventoryEntry = { capability: string; reason: string }

// what the check found: each failure, and the capabilities one app alone reaches
export type ClientParityReport = {
	violations: string[]
	webOnlyCapabilities: string[]
	mobileOnlyCapabilities: string[]
}

// the import a file names: its path, and the specifiers it brings in, "*" for a namespace import
type NamedImport = { importPath: string; names: string[] }

// the files the check reads, and the inventory rows
type CheckClientParityOptions = { sourceFiles: SourceFile[]; inventoryEntries: ParityInventoryEntry[] }

/**
 * Returns the parity report: a capability the web reaches and the app does not, unless listed, a listed capability the
 * app now reaches or that no longer exists, a row without a reason, and the capabilities one app alone reaches.
 */
export function checkClientParity({ sourceFiles, inventoryEntries }: CheckClientParityOptions): ClientParityReport {
	// the capabilities, the files by path, and what each app reaches
	const capabilities = toClientCapabilities(sourceFiles)
	const filesByPath = new Map(sourceFiles.map((sourceFile) => [sourceFile.filePath, sourceFile]))
	const webReachedCapabilities = toReachedCapabilities({ filesByPath, capabilities, appFolder: WEB_APP_FOLDER })
	const mobileReachedCapabilities = toReachedCapabilities({ filesByPath, capabilities, appFolder: MOBILE_APP_FOLDER })

	// the capabilities one app alone reaches
	const webOnlyCapabilities = [...webReachedCapabilities.keys()].filter((key) => !mobileReachedCapabilities.has(key))
	const mobileOnlyCapabilities = [...mobileReachedCapabilities.keys()].filter((key) => !webReachedCapabilities.has(key))
	webOnlyCapabilities.sort()
	mobileOnlyCapabilities.sort()

	// a web-only capability needs an inventory row with a reason
	const violations: string[] = []
	const listedCapabilities = new Set(inventoryEntries.map((inventoryEntry) => inventoryEntry.capability))
	for (const key of webOnlyCapabilities) {
		if (!listedCapabilities.has(key)) {
			violations.push(
				`${key} is reached by the web through ${webReachedCapabilities.get(key)} and by no mobile screen. add it to ${PARITY_INVENTORY_PATH} with its reason or prompt, or reach it from the app`,
			)
		}
	}

	// a row names a capability that exists, that the app still does not reach, and gives a reason
	const capabilityKeys = new Set(capabilities.map((capability) => capability.key))
	for (const inventoryEntry of inventoryEntries) {
		if (!capabilityKeys.has(inventoryEntry.capability)) {
			violations.push(`${PARITY_INVENTORY_PATH} lists ${inventoryEntry.capability}, which no api client module exports`)
		} else if (mobileReachedCapabilities.has(inventoryEntry.capability)) {
			violations.push(
				`${PARITY_INVENTORY_PATH} lists ${inventoryEntry.capability}, which the app now reaches. retire the row`,
			)
		}

		// and says why it stays web-only, or which prompt owns it
		if (inventoryEntry.reason.trim() === "") {
			violations.push(`${PARITY_INVENTORY_PATH} lists ${inventoryEntry.capability} with no reason or prompt`)
		}
	}
	return { violations, webOnlyCapabilities, mobileOnlyCapabilities }
}

/**
 * Returns the inventory's capability rows: the table under the web-only heading, one row per listed capability.
 */
export function parseParityInventory(markdown: string): ParityInventoryEntry[] {
	// the table lines after the heading, up to the next heading
	const headingIndex = markdown.indexOf(PARITY_INVENTORY_HEADING)
	if (headingIndex === -1) {
		return []
	}
	const section = markdown.slice(headingIndex + PARITY_INVENTORY_HEADING.length).split(/\n## /)[0] ?? ""

	// each row with a backticked capability
	const inventoryEntries: ParityInventoryEntry[] = []
	for (const line of section.split("\n")) {
		const rowMatch = INVENTORY_ROW_PATTERN.exec(line)
		// a row lists its capability and its reason
		if (rowMatch) {
			inventoryEntries.push({ capability: rowMatch[1] ?? "", reason: rowMatch[2]?.trim() ?? "" })
		}
	}
	return inventoryEntries
}

/**
 * Returns every api client capability: each exported function or constant of a client module, keyed module.name.
 */
export function toClientCapabilities(sourceFiles: SourceFile[]): ClientCapability[] {
	const capabilities: ClientCapability[] = []
	for (const sourceFile of sourceFiles) {
		// only a client module that is not a test
		if (!isInsideFolder(sourceFile.filePath, CLIENT_PACKAGE_FOLDER) || TEST_FILE_PATTERN.test(sourceFile.filePath)) {
			continue
		}

		// each export, under the module's name
		const moduleName = posix.basename(sourceFile.filePath).replace(/\.tsx?$/, "")
		for (const exportMatch of sourceFile.fileText.matchAll(CLIENT_EXPORT_PATTERN)) {
			const exportName = exportMatch[1] ?? exportMatch[2] ?? ""
			capabilities.push({ key: `${moduleName}.${exportName}`, modulePath: sourceFile.filePath, exportName })
		}
	}
	return capabilities
}

/**
 * Returns each import a file names, with the specifiers it brings in. A type-only import is left out, a side-effect
 * import brings in no name, and an import() or a require() brings in the whole module.
 */
export function toNamedImports(fileText: string): NamedImport[] {
	const namedImports: NamedImport[] = []
	for (const { statementText, importPath, isTypeOnly } of toParsedImports(fileText)) {
		// a type-only statement reaches nothing at runtime
		if (isTypeOnly) {
			continue
		}

		// a called import reaches the whole module, and a side-effect import names nothing
		if (CALLED_IMPORT_PATTERN.test(statementText)) {
			namedImports.push({ importPath, names: ["*"] })
		} else if (SIDE_EFFECT_IMPORT_PATTERN.test(statementText)) {
			namedImports.push({ importPath, names: [] })
		} else {
			// a static import or re-export reaches what its specifiers name
			const specifierText = SPECIFIER_TEXT_PATTERN.exec(statementText)?.[1] ?? ""
			namedImports.push({ importPath, names: toSpecifierNames(specifierText) })
		}
	}
	return namedImports
}

/**
 * Returns the file an import path names inside the repo, or null for a package outside it.
 */
export function resolveImportPath({
	importPath,
	fromFilePath,
	filesByPath,
}: {
	importPath: string
	fromFilePath: string
	filesByPath: Map<string, SourceFile>
}): string | null {
	// the path before the extension and index tries
	const basePath = toImportBasePath(importPath, fromFilePath)
	if (!basePath) {
		return null
	}

	// the first candidate that is a file the check read
	for (const suffix of RESOLUTION_SUFFIXES) {
		const candidatePath = `${basePath}${suffix}`
		if (filesByPath.has(candidatePath)) {
			return candidatePath
		}
	}
	return null
}

// what the freeze and the purchase guard ask: the capabilities one app reaches, from the files the check reads
type ToAppReachedCapabilitiesOptions = { sourceFiles: SourceFile[]; appFolder: string }

/**
 * Returns the capability keys an app reaches through its own imports and the shared packages, each with the file that
 * first imported it.
 */
export function toAppReachedCapabilities({
	sourceFiles,
	appFolder,
}: ToAppReachedCapabilitiesOptions): Map<string, string> {
	const filesByPath = new Map(sourceFiles.map((sourceFile) => [sourceFile.filePath, sourceFile]))
	return toReachedCapabilities({ filesByPath, capabilities: toClientCapabilities(sourceFiles), appFolder })
}

// the capabilities an app reaches, each with the file that first imported it, walking from the app's routes
function toReachedCapabilities({
	filesByPath,
	capabilities,
	appFolder,
}: {
	filesByPath: Map<string, SourceFile>
	capabilities: ClientCapability[]
	appFolder: string
}): Map<string, string> {
	// the capabilities by module, and the walk's queue from the route files
	const capabilitiesByModule = Map.groupBy(capabilities, (capability) => capability.modulePath)
	const routesFolder = appFolder === WEB_APP_FOLDER ? WEB_ROUTES_FOLDER : MOBILE_ROUTES_FOLDER
	const queue = [...filesByPath.keys()].filter(
		(filePath) => isInsideFolder(filePath, routesFolder) && isShippedFile(filePath),
	)
	const visitedPaths = new Set(queue)
	const reachedCapabilities = new Map<string, string>()

	// follow each reached file's imports: a client module adds the capabilities it names, any other file joins the walk
	while (queue.length > 0) {
		const filePath = queue.shift() as string
		for (const { importedPath, names } of toShippedImports(filePath, filesByPath)) {
			// the capabilities an import of a client module names, each recorded with the first file that named it
			for (const capability of capabilitiesByModule.get(importedPath) ?? []) {
				recordReachedCapability({ reachedCapabilities, capability, names, filePath })
			}

			// walk on through a file the app has not reached yet
			if (!visitedPaths.has(importedPath)) {
				visitedPaths.add(importedPath)
				queue.push(importedPath)
			}
		}
	}
	return reachedCapabilities
}

// a file's imports that resolve to a shipped file the check read, each with the names it brings in
function toShippedImports(
	filePath: string,
	filesByPath: Map<string, SourceFile>,
): { importedPath: string; names: string[] }[] {
	const fileText = filesByPath.get(filePath)?.fileText ?? ""
	return toNamedImports(fileText).flatMap(({ importPath, names }) => {
		const importedPath = resolveImportPath({ importPath, fromFilePath: filePath, filesByPath })
		return importedPath && isShippedFile(importedPath) ? [{ importedPath, names }] : []
	})
}

// record a capability an import names, by name or through a namespace import, with the first file that named it
function recordReachedCapability({
	reachedCapabilities,
	capability,
	names,
	filePath,
}: {
	reachedCapabilities: Map<string, string>
	capability: ClientCapability
	names: string[]
	filePath: string
}): void {
	// the first file to name a capability is the one the report cites
	const isNamed = names.includes("*") || names.includes(capability.exportName)
	if (isNamed && !reachedCapabilities.has(capability.key)) {
		reachedCapabilities.set(capability.key, filePath)
	}
}

/**
 * Returns true for a file the app ships: not a test, a test fixtures module, or a story.
 */
export function isShippedFile(filePath: string): boolean {
	return !TEST_FILE_PATTERN.test(filePath) && !STORY_FILE_PATTERN.test(filePath)
}

// the specifiers' imported names: each braced specifier's own name, a default import, and "*" for a namespace import
function toSpecifierNames(specifierText: string): string[] {
	// a namespace import reaches the whole module
	if (NAMESPACE_SPECIFIER_PATTERN.test(specifierText)) {
		return ["*"]
	}

	// the braced names, without a type specifier and without an alias
	const bracedText = NAMED_SPECIFIERS_PATTERN.exec(specifierText)?.[1] ?? ""
	const names = bracedText
		.split(",")
		.map((specifier) => specifier.trim())
		.filter((specifier) => specifier !== "" && !specifier.startsWith("type "))
		.map((specifier) => specifier.split(/\s+as\s+/)[0] ?? specifier)

	// a default import before the braces, or alone
	const defaultName = specifierText.replace(NAMED_SPECIFIERS_PATTERN, "").replace(",", "").trim()
	return defaultName ? [...names, "default"] : names
}

// the repo path an import names before its extension: a relative path, an app's @/ alias, or a workspace package path
function toImportBasePath(importPath: string, fromFilePath: string): string | null {
	// a relative import, from the importing file's folder
	if (importPath.startsWith(".")) {
		return posix.normalize(posix.join(posix.dirname(fromFilePath), importPath))
	}

	// an app's alias to its src folder
	if (importPath.startsWith("@/")) {
		const appFolder = [WEB_APP_FOLDER, MOBILE_APP_FOLDER].find((folder) => isInsideFolder(fromFilePath, folder))
		return appFolder ? `${appFolder}/src/${importPath.slice(2)}` : null
	}

	// a workspace package's module, or its index
	const packageMatch = /^@carlnotes\/([^/]+)(?:\/(.+))?$/.exec(importPath)
	if (packageMatch) {
		return `packages/${packageMatch[1]}/${packageMatch[2] ?? "index"}`
	}
	return null
}
