// the releases table's reads and writes, the two pages rendered from them, and the routes that serve
// those: /releases, each release's own page, the /changelog redirect, and the signed GitHub webhook.
// a release is authored on GitHub and read here

import { desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { releases } from "../db/schema"
import { toContentHtml, toPageHtml } from "./content"
import { appUrl } from "./pages"

// what a release body puts above its auto-generated pull request list. the index renders only what
// sits above it, and a body written without it renders whole
const SUMMARY_SENTINEL = "<!-- more -->"

// the actions that put a release on the page. published fires on a first publish,
// released fires on a prerelease promoted to a full release
const STORE_RELEASE_ACTIONS = new Set(["published", "released"])

// the header GitHub signs its webhook payload with, and the prefix that signature includes
const SIGNATURE_HEADER = "x-hub-signature-256"
const SIGNATURE_PREFIX = "sha256="

// one release as the pages and the feed read it
export type ReleaseRow = typeof releases.$inferSelect

// what a write needs, which is the same shape the webhook and the sync script both produce
export type ReleaseUpsert = {
	tag: string
	name: string
	body: string
	releasedAt: Date
	htmlUrl: string
	isPrerelease: boolean
}

/**
 * Store one release under its tag. The one write path the webhook and the sync script share,
 * so a re-delivery and a re-run both land on the existing row instead of adding a second.
 */
export async function saveRelease(release: ReleaseUpsert): Promise<void> {
	await db
		.insert(releases)
		.values(release)
		.onConflictDoUpdate({
			target: releases.tag,
			// every field but the tag is refreshed, so a re-run corrects whatever drifted
			set: {
				name: release.name,
				body: release.body,
				releasedAt: release.releasedAt,
				htmlUrl: release.htmlUrl,
				isPrerelease: release.isPrerelease,
			},
		})

	// every store is logged, so the page falling behind GitHub is visible in the platform logs
	console.log("release stored", release.tag)
}

/**
 * Every release the pages may show, newest first. A prerelease is stored but never read,
 * and a draft never reaches the table at all.
 */
export async function loadReleases(): Promise<ReleaseRow[]> {
	return db.select().from(releases).where(eq(releases.isPrerelease, false)).orderBy(desc(releases.releasedAt))
}

/**
 * The summary a release leads with: what sits above the sentinel, or the whole body without one.
 */
export function toReleaseSummary(body: string): string {
	const sentinelAt = body.indexOf(SUMMARY_SENTINEL)
	return sentinelAt === -1 ? body : body.slice(0, sentinelAt)
}

/**
 * Whether a signature header matches the body under the signing secret. False when either is missing,
 * so an unsigned request and an unconfigured environment both fail closed.
 */
export async function isSignedByGitHub(body: string, signature: string | undefined): Promise<boolean> {
	const secret = Bun.env.GITHUB_WEBHOOK_SECRET
	if (!secret || !signature?.startsWith(SIGNATURE_PREFIX)) {
		return false
	}

	// the same HMAC GitHub computed over the raw body
	const signingKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	const bodyDigest = await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(body))

	// the compare is constant time, so a wrong signature leaks nothing by how long it takes to reject.
	// the lengths are checked first because timingSafeEqual throws on a mismatched pair
	const expectedSignature = SIGNATURE_PREFIX + Buffer.from(bodyDigest).toString("hex")
	return (
		expectedSignature.length === signature.length &&
		crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
	)
}

// the release payload GitHub sends, narrowed to what a row needs
type ReleasePayload = {
	action?: string
	release?: {
		// the tag a row is keyed by, the title, and the body Markdown
		tag_name?: string
		name?: string | null
		body?: string | null
		// created_at is the target commit's date, which is the day the work shipped.
		// a draft never reaches the table, and a prerelease is stored but filtered out of every read
		created_at?: string | null
		html_url?: string
		prerelease?: boolean
		draft?: boolean
	}
}

/**
 * One GitHub release object as a row, or null when it is a draft or is missing what a row needs.
 */
export function toReleaseUpsert(release: ReleasePayload["release"]): ReleaseUpsert | null {
	if (!release || release.draft || !release.tag_name || !release.created_at || !release.html_url) {
		return null
	}
	// an untitled release falls back to its tag, which GitHub shows the same way
	return {
		tag: release.tag_name,
		name: release.name || release.tag_name,
		body: release.body ?? "",
		releasedAt: new Date(release.created_at),
		htmlUrl: release.html_url,
		isPrerelease: release.prerelease ?? false,
	}
}

// one release as a card on the index: its name, its date, and the summary above the sentinel
function toReleaseCard(release: ReleaseRow): string {
	const releasedOn = release.releasedAt.toISOString().slice(0, 10)
	return `<article class="post-card"><h2><a href="/releases/${encodeURIComponent(release.tag)}">${Bun.escapeHTML(release.name)}</a></h2><div class="post-date">${releasedOn}</div>${toPageHtml(toReleaseSummary(release.body))}</article>`
}

/**
 * The releases index: every published release newest first, each linking to its own page.
 */
export async function serveReleaseIndex(): Promise<string> {
	const releaseCards = (await loadReleases()).map(toReleaseCard).join("")
	return toContentHtml({
		title: "Releases",
		description: "What shipped, and what changed.",
		canonicalUrl: `${appUrl()}/releases`,
		jsonLd: "",
		bodyHtml: `<h1>Releases</h1>${releaseCards}`,
	})
}

/**
 * One release's own page, rendered whole, or null for a tag no published release holds.
 */
export async function serveRelease(tag: string): Promise<string | null> {
	const release = (await loadReleases()).find((row) => row.tag === tag)
	if (!release) {
		return null
	}

	// the whole body renders here, generated list included, to show a reader this one release
	const releasedOn = release.releasedAt.toISOString().slice(0, 10)
	return toContentHtml({
		title: release.name,
		description: `What shipped in ${release.name}.`,
		canonicalUrl: `${appUrl()}/releases/${encodeURIComponent(release.tag)}`,
		jsonLd: "",
		bodyHtml: `<article><h1>${Bun.escapeHTML(release.name)}</h1><div class="post-date">${releasedOn}</div>${toPageHtml(release.body)}<p><a href="${Bun.escapeHTML(release.htmlUrl)}">This release on GitHub</a></p></article>`,
	})
}

// the release routes: the index, one release's page, and the webhook that writes the table
export const releasesRoute = new Hono()
	.get("/releases", async (context) => {
		return context.html(await serveReleaseIndex())
	})
	.get("/releases/:tag", async (context) => {
		const page = await serveRelease(context.req.param("tag"))
		return page ? context.html(page) : context.notFound()
	})
	// the changelog path is the conventional one, so a link written against it reaches the page
	.get("/changelog", (context) => context.redirect("/releases", 301))
	.post("/api/webhooks/github", async (context) => {
		// the raw body is what the signature covers, so it is read before anything parses it
		const body = await context.req.text()
		if (!(await isSignedByGitHub(body, context.req.header(SIGNATURE_HEADER)))) {
			return context.json({ rejected: "signature" }, 401)
		}

		// a webhook set to form encoding sends payload=<encoded>, which is not json. the reply names the
		// content type to change
		let payload: ReleasePayload
		try {
			payload = JSON.parse(body) as ReleasePayload
		} catch {
			return context.json(
				{ rejected: "expected a json body, so set the webhook content type to application/json" },
				400,
			)
		}

		// only a publication writes. every other action is acknowledged and dropped, so editing a
		// typo in a published release never re-fires anything downstream
		if (!payload.action || !STORE_RELEASE_ACTIONS.has(payload.action)) {
			return context.json({ ignored: payload.action ?? "unknown" })
		}
		const release = toReleaseUpsert(payload.release)
		if (!release) {
			return context.json({ ignored: "draft" })
		}
		await saveRelease(release)
		return context.json({ stored: release.tag })
	})
