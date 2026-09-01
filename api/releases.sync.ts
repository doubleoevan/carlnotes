// this script pulls every published GitHub release into the releases table, with the same write the webhook uses.
// it seeds the releases published before the webhook existed, and re-running it repairs what a missed delivery dropped,
// so it is the recovery step when /releases is behind GitHub

import { connectionPool } from "../db"
import { saveRelease, toReleaseUpsert } from "./releases"

// the repository the releases are read from, and the api that lists them
const GITHUB_REPOSITORY = "doubleoevan/carlnotes"
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=100`

/**
 * Store every published release the repository holds. Drafts are skipped, and an existing row is
 * updated instead of duplicated, so this is safe to run at any time and as often as needed.
 */
export async function syncReleases(): Promise<{ storedReleaseCount: number; skippedReleaseCount: number }> {
	// a GitHub token only matters for a private repository. this one is public, so an unauthenticated read works
	const githubToken = Bun.env.GITHUB_TOKEN

	// one page of a hundred, newest first, which covers every release this repository has
	const response = await fetch(GITHUB_RELEASES_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "carlnotes-release-sync",
			...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
		},
	})
	if (!response.ok) {
		throw new Error(`github releases read failed: ${response.status}`)
	}

	// upsert releases into the database and return how many were stored or skipped
	let storedReleaseCount = 0
	let skippedReleaseCount = 0
	const releases = (await response.json()) as Parameters<typeof toReleaseUpsert>[0][]
	for (const release of releases) {
		const releaseRow = toReleaseUpsert(release)
		if (!releaseRow) {
			skippedReleaseCount += 1
			continue
		}
		await saveRelease(releaseRow)
		storedReleaseCount += 1
	}
	return { storedReleaseCount, skippedReleaseCount }
}

// sync releases from GitHub to the database and log the results
if (import.meta.main) {
	const { storedReleaseCount, skippedReleaseCount } = await syncReleases()
	console.log(`releases synced: ${storedReleaseCount} stored, ${skippedReleaseCount} skipped`)
	await connectionPool.end()
}
