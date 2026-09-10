// store a release-notes/<tag>.local.md body in the releases table with its screenshots inlined, so /releases reads
// as it will before the release exists on GitHub. a later publish of the tag replaces the row

import { readFile } from "node:fs/promises"
import { connectionPool } from "../db"
import { saveRelease } from "./releases"

// the raw GitHub prefix the release convention writes image urls with, and the repository path each one names
const RAW_IMAGE_PREFIX = "https://raw.githubusercontent.com/doubleoevan/carlnotes/main/"
const RAW_IMAGE_PATTERN = /https:\/\/raw\.githubusercontent\.com\/doubleoevan\/carlnotes\/main\/([^\s)]+\.png)/g

/**
 * Inlines every repository image in the releaseBody as a data url, so the preview shows images the push has not published.
 */
export async function toPreviewBody(releaseBody: string): Promise<string> {
	// each image path once, read from the repository root
	const imagePaths = new Set(
		[...releaseBody.matchAll(RAW_IMAGE_PATTERN)].flatMap((imageMatch) => (imageMatch[1] ? [imageMatch[1]] : [])),
	)
	let previewBody = releaseBody
	for (const imagePath of imagePaths) {
		const imageBytes = await readFile(imagePath)
		previewBody = previewBody.replaceAll(
			`${RAW_IMAGE_PREFIX}${imagePath}`,
			`data:image/png;base64,${imageBytes.toString("base64")}`,
		)
	}
	return previewBody
}

// store the preview row under the tag and say where to read it
if (import.meta.main) {
	// the tag and the title come from the command line, the same two the gh release command takes
	const [tag, name] = Bun.argv.slice(2)
	if (!tag || !name) {
		console.error('usage: bun run releases:preview <tag> "<title>"')
		process.exit(1)
	}
	try {
		// read the local release notes and save the preview release
		const releaseBody = await readFile(`release-notes/${tag}.local.md`, "utf8")
		await saveRelease({
			tag,
			name,
			body: await toPreviewBody(releaseBody),
			releasedAt: new Date(),
			htmlUrl: `https://github.com/doubleoevan/carlnotes/releases/tag/${tag}`,
			isPrerelease: false,
		})
		console.log(
			`preview stored. read it at http://localhost:3000/releases/${tag} and on http://localhost:3000/releases`,
		)
	} finally {
		await connectionPool.end()
	}
}
