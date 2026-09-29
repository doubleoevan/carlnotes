// fail on a value import of the api, the worker, or the db folder under ui/src. the ui imports server modules as
// types only, and biome cannot tell a type import from a value one
import { readFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"

// the repo's top-level folders the ui may import as types only
const SERVER_FOLDERS = new Set(["api", "worker", "db"])

// an import or export statement with its quoted path, across any number of lines, a side-effect import, or an
// import(). the match stops before the next import or export keyword. the code has no semicolons to end a statement
// on. a type position names a server type with import type instead of import()
const IMPORT_PATTERN =
	/(?:import|export)\s(?:(?!(?:import|export)\s)[\s\S])*?from\s*["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["']/g

// a type-only import or export statement
const TYPE_ONLY_IMPORT_PATTERN = /^(?:import|export)\s+type\s/

// the file whose imports are checked: its path from the repo root, and its text
type ToServerValueImportsOptions = { filePath: string; fileText: string }

/**
 * Returns each value import of a server folder in a file's text, with the line it starts on.
 */
export function toServerValueImports({ filePath, fileText }: ToServerValueImportsOptions): {
	lineNumber: number
	firstLine: string
}[] {
	// each import whose path resolves into a server folder and that is not type-only
	const serverValueImports: { lineNumber: number; firstLine: string }[] = []
	for (const importMatch of fileText.matchAll(IMPORT_PATTERN)) {
		// record a value import with its line number and its first line, and skip a type-only one
		const importPath = importMatch[1] ?? importMatch[2] ?? ""
		if (isServerPath(filePath, importPath) && !TYPE_ONLY_IMPORT_PATTERN.test(importMatch[0])) {
			const lineNumber = fileText.slice(0, importMatch.index).split("\n").length
			serverValueImports.push({ lineNumber, firstLine: importMatch[0].split("\n")[0] ?? "" })
		}
	}
	return serverValueImports
}

// whether a relative import path from a file lands in a server folder, once its . and .. segments resolve
function isServerPath(filePath: string, importPath: string): boolean {
	// a package or an alias path is not a relative path into the repo
	if (!importPath.startsWith(".")) {
		return false
	}
	const repoPath = relative(process.cwd(), resolve(dirname(filePath), importPath))
	return SERVER_FOLDERS.has(repoPath.split(sep)[0] ?? "")
}

// check every ui file if run as a script
if (import.meta.main) {
	// each value import of a server folder, as file:line
	const violations: string[] = []
	for (const filePath of new Bun.Glob("ui/src/**/*.{ts,tsx}").scanSync(".")) {
		for (const serverValueImport of toServerValueImports({ filePath, fileText: readFileSync(filePath, "utf8") })) {
			violations.push(`${filePath}:${serverValueImport.lineNumber}: ${serverValueImport.firstLine}`)
		}
	}

	// report every violation, then fail
	if (violations.length > 0) {
		console.error("ui boundary: the ui imports the api, the worker, and the database as types only. use import type:")
		for (const violation of violations) {
			console.error(`  ${violation}`)
		}
		process.exit(1)
	}

	// report a clean run
	console.log("ui boundary: no value import of api, worker, or db under ui/src")
}
