// where the docs markdown lives, relative to the repo root that every process runs from, and the pages under it
import { readdir } from "node:fs/promises"

// the docs markdown folder
export const DOCS_CONTENT_DIRECTORY = "apps/docs/src/content/docs"

/**
 * Returns every docs page's path, relative to the docs folder.
 */
export async function listDocsMarkdownPaths(): Promise<string[]> {
	return (await readdir(DOCS_CONTENT_DIRECTORY, { recursive: true })).filter((path) => path.endsWith(".md"))
}
