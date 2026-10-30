// the files that a set of roots reaches through runtime imports, read with the parser and resolver that the boundary
// and parity checks use, and each in-repo import that names no file
import { toParsedImports } from "../scripts/importBoundaries"
import { type KnownFilePaths, toImportResolution } from "../scripts/importPaths"

// the files whose imports are followed. a stylesheet, an image, or a data file is a leaf of the graph
const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs)$/

/** The files that a set of roots reaches, and each in-repo import on the way that names no file. */
export type ReachedFiles = { filePaths: Set<string>; unresolvedImports: string[] }

/** A reader of one file's runtime imports: the files that they resolve to, and the ones that resolve to nothing. */
export type DirectImportReader = (filePath: string) => { importedPaths: string[]; unresolvedImports: string[] }

/**
 * Returns a reader of each file's runtime imports, which reads and parses a file once no matter how often it is asked.
 */
export function toDirectImportReader({
	knownFilePaths,
	readFileText,
}: {
	knownFilePaths: KnownFilePaths
	readFileText: (filePath: string) => string
}): DirectImportReader {
	// each file's imports, parsed the first time the file is asked for
	const directImportsByPath = new Map<string, ReturnType<DirectImportReader>>()
	return (filePath) => {
		// a file read before returns its imports from the cache
		const knownDirectImports = directImportsByPath.get(filePath)
		if (knownDirectImports) {
			return knownDirectImports
		}

		// parse a new file once and keep its imports
		const directImports = toDirectImports({ filePath, knownFilePaths, readFileText })
		directImportsByPath.set(filePath, directImports)
		return directImports
	}
}

/**
 * Returns every file that the roots reach through runtime imports, roots included, and each import that names no file.
 */
export function toReachedFiles(rootPaths: string[], readDirectImports: DirectImportReader): ReachedFiles {
	// walk outward from the roots, visiting each file once
	const filePaths = new Set(rootPaths)
	const unresolvedImports: string[] = []
	const queue = [...rootPaths]
	while (queue.length > 0) {
		const filePath = queue.shift() as string
		const directImports = readDirectImports(filePath)
		unresolvedImports.push(...directImports.unresolvedImports)

		// queue each imported file that the walk has not reached yet
		for (const importedPath of directImports.importedPaths) {
			if (!filePaths.has(importedPath)) {
				filePaths.add(importedPath)
				queue.push(importedPath)
			}
		}
	}

	return { filePaths, unresolvedImports }
}

// one file's runtime imports, resolved. a type-only import is skipped, and a package outside the repo ends the path
function toDirectImports({
	filePath,
	knownFilePaths,
	readFileText,
}: {
	filePath: string
	knownFilePaths: KnownFilePaths
	readFileText: (filePath: string) => string
}): ReturnType<DirectImportReader> {
	// a file that is not code imports nothing that the graph follows
	if (!CODE_FILE_PATTERN.test(filePath)) {
		return { importedPaths: [], unresolvedImports: [] }
	}

	// resolve each runtime import, keeping the repo files and the repo paths that name no file
	const importedPaths: string[] = []
	const unresolvedImports: string[] = []
	for (const { importPath, isTypeOnly } of toParsedImports(readFileText(filePath))) {
		// a type-only import reaches nothing at runtime
		if (isTypeOnly) {
			continue
		}

		// keep a repo file, and record a repo path that names no file
		const importResolution = toImportResolution({ importPath, fromFilePath: filePath, knownFilePaths })
		if (importResolution.kind === "file") {
			importedPaths.push(importResolution.filePath)
		} else if (importResolution.kind === "unresolved") {
			unresolvedImports.push(`${importPath} in ${filePath}`)
		}
	}

	return { importedPaths, unresolvedImports }
}
