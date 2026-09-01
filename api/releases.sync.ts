// this script pulls every published GitHub release into the releases table, through the same write the
// webhook uses. it seeds the releases published before the webhook existed, and re-running it repairs
// anything a missed delivery dropped, so it is the recovery step when /releases is behind GitHub

import { connectionPool } from "../db"
import { saveRelease, toReleaseUpsert } from "./releases"

// the repository the releases are read from, and the api that lists them
const REPOSITORY = "doubleoevan/carlnotes"
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`

/**
 * Store every published release the repository holds. Drafts are skipped, and an existing row is
 * refreshed rather than duplicated, so this is safe to run at any time and as often as needed.
 */
export async function syncReleases(): Promise<{ stored: number; skipped: number }> {
	// a token only matters for a private repository. this one is public, so an unauthenticated read works
	const token = Bun.env.GITHUB_TOKEN

	// ponytail: one page of a hundred releases, no pagination. follow the Link header's rel=next if this
	// repository ever passes a hundred releases, and reconcile deletions in the same pass
	const response = await fetch(RELEASES_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "carlnotes-release-sync",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	})
	if (!response.ok) {
		throw new Error(`github releases read failed: ${response.status}`)
	}

	// a draft has no tag to key on and never appears on the page, so it is counted and passed over
	const payload = (await response.json()) as Parameters<typeof toReleaseUpsert>[0][]
	let stored = 0
	let skipped = 0
	for (const release of payload) {
		const row = toReleaseUpsert(release)
		if (!row) {
			skipped += 1
			continue
		}
		await saveRelease(row)
		stored += 1
	}
	return { stored, skipped }
}

// running the file syncs and reports. importing it leaves the pool alone for the caller to manage
if (import.meta.main) {
	const { stored, skipped } = await syncReleases()
	console.log(`releases synced: ${stored} stored, ${skipped} skipped`)
	await connectionPool.end()
}
