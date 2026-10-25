// the source files under a list of folders, skipping installed packages, build output, declarations, and the generated
// route tree
import { readdirSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import type { SourceFile } from "./workspaces"

// the folders and the files the scan skips
const SKIPPED_FOLDER_NAMES = new Set(["node_modules", "dist", ".tsbuild", ".astro", ".expo"])
const SKIPPED_FILE_PATHS = new Set(["apps/web/src/routeTree.gen.ts"])
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|mjs|astro)$/
const DECLARATION_FILE_PATTERN = /\.d\.ts$/

/**
 * Returns every checked source file under the folders, with its repo path and its text.
 */
export function readSourceFiles(folders: string[]): SourceFile[] {
	const filePaths = folders.flatMap((folder) => listSourceFiles(folder))
	return filePaths.map((filePath) => ({ filePath, fileText: readFileSync(filePath, "utf8") }))
}

// list every checked source file under a folder
function listSourceFiles(folder: string): string[] {
	const filePaths: string[] = []
	for (const entry of readdirSync(folder, { withFileTypes: true })) {
		// descend into a folder the scan does not skip
		const entryPath = posix.join(folder, entry.name)
		if (entry.isDirectory()) {
			if (!SKIPPED_FOLDER_NAMES.has(entry.name)) {
				filePaths.push(...listSourceFiles(entryPath))
			}
			continue
		}

		// keep a source file the scan does not skip
		if (isCheckedSourceFile(entryPath)) {
			filePaths.push(entryPath)
		}
	}
	return filePaths
}

// whether a file is source the checks read
function isCheckedSourceFile(filePath: string): boolean {
	return (
		SOURCE_FILE_PATTERN.test(filePath) && !DECLARATION_FILE_PATTERN.test(filePath) && !SKIPPED_FILE_PATHS.has(filePath)
	)
}
