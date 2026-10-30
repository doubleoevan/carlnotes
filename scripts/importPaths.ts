// the repo file that an import path leads to: a relative path, an app's @/ alias, or a workspace package path, tried
// with the extensions and index files that an import may leave off
import { posix } from "node:path"
import { isInsideFolder, MOBILE_APP_FOLDER, WEB_APP_FOLDER } from "./workspaces"

// the extensions and index files that an import path may leave off.
// an import that names its own extension, such as a stylesheet, an image, or a JSON file, matches with no suffix
const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

// a query or a hash that a bundler reads after the path, such as ?raw or ?url
const IMPORT_QUERY_PATTERN = /[?#].*$/

// a workspace package's name and the module path after it
const WORKSPACE_PACKAGE_IMPORT_PATTERN = /^@carlnotes\/([^/]+)(?:\/(.+))?$/

/** The repo paths that a resolver checks each candidate against, such as a set of paths or a map keyed by path. */
export type KnownFilePaths = { has: (filePath: string) => boolean }

/** Where an import leads: a repo file, a package outside the repo, or a repo path that names no file. */
export type ImportResolution = { kind: "file"; filePath: string } | { kind: "package" } | { kind: "unresolved" }

// the import to resolve, the file that it is written in, and the paths that a candidate must be one of
type ToImportResolutionOptions = { importPath: string; fromFilePath: string; knownFilePaths: KnownFilePaths }

/**
 * Returns where an import leads: the repo file that it names, a package outside the repo, or a repo path with no file.
 */
export function toImportResolution({
	importPath,
	fromFilePath,
	knownFilePaths,
}: ToImportResolutionOptions): ImportResolution {
	// a path outside the repo's own forms is an installed package
	const basePath = toImportBasePath(importPath.replace(IMPORT_QUERY_PATTERN, ""), fromFilePath)
	if (!basePath) {
		return { kind: "package" }
	}

	// the first candidate that is a known file
	const filePath = RESOLUTION_SUFFIXES.map((suffix) => `${basePath}${suffix}`).find((candidatePath) =>
		knownFilePaths.has(candidatePath),
	)
	return filePath ? { kind: "file", filePath } : { kind: "unresolved" }
}

// the repo path that an import names before its extension: a relative path, an app's @/ alias,
// or a workspace package path
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
	const packageMatch = WORKSPACE_PACKAGE_IMPORT_PATTERN.exec(importPath)
	if (packageMatch) {
		return `packages/${packageMatch[1]}/${packageMatch[2] ?? "index"}`
	}
	return null
}
