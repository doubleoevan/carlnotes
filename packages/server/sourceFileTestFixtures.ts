// the source files under repo folders, for the tests that scan them
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// a source file's path from the repo root, and its text
export type SourceFileText = { path: string; text: string }

// the repo root, two folders above this package
const REPO_ROOT = join(import.meta.dir, "..", "..")

/**
 * Returns every .ts and .tsx file under the given repo folders outside the tests, the smoke scripts, the build output,
 * and the installed packages, each with its path from the repo root and its text.
 */
export function listSourceFiles(folders: string[]): SourceFileText[] {
	return folders.flatMap((folder) =>
		readdirSync(join(REPO_ROOT, folder), { recursive: true })
			.map(String)
			.filter(
				(name) =>
					/\.(ts|tsx)$/.test(name) &&
					!/\.(test|smoke)\./.test(name) &&
					!name.includes(".tsbuild") &&
					!name.includes("node_modules"),
			)
			.map((name) => ({ path: `${folder}/${name}`, text: readFileSync(join(REPO_ROOT, folder, name), "utf8") })),
	)
}
