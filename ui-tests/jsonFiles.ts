// the JSON files that the steps write and read: the selection, the image capture manifests, the reports,
// and the baseline manifests
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { posix } from "node:path"

/**
 * Writes a value as tab-indented JSON with a final newline, making the file's folder first.
 */
export function writeJsonFile(filePath: string, fileContent: unknown): void {
	mkdirSync(posix.dirname(filePath), { recursive: true })
	writeFileSync(filePath, `${JSON.stringify(fileContent, null, "\t")}\n`)
}

/**
 * Returns a JSON file's parsed content, as the type that the caller names.
 */
export function readJsonFile<FileContent>(filePath: string): FileContent {
	return JSON.parse(readFileSync(filePath, "utf8")) as FileContent
}
