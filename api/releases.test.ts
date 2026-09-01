// the release notes rules that hold without a database: the summary split, the webhook's signature
// check, and what a GitHub release object becomes as a row
import { expect, test } from "bun:test"
import { isSignedByGitHub, releasesRoute, toReleaseSummary, toReleaseUpsert } from "./releases"

// the header GitHub signs with, and the signature it would send for a body
const SIGNATURE_HEADER = "x-hub-signature-256"
async function toSignature(body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode("shhh"),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
	return `sha256=${Buffer.from(digest).toString("hex")}`
}

// put the secret back as it was. assigning undefined would store the string "undefined", which every
// truthiness check then reads as a configured secret
function restoreSecret(previousSecret: string | undefined): void {
	if (previousSecret === undefined) {
		delete Bun.env.GITHUB_WEBHOOK_SECRET
		return
	}
	Bun.env.GITHUB_WEBHOOK_SECRET = previousSecret
}

// one published release as GitHub sends it
const PUBLISHED = {
	tag_name: "v0.4.0",
	name: "v0.4.0 — The topic feed",
	body: "The summary.\n\n<!-- more -->\n\n<details>the list</details>",
	created_at: "2026-07-21T00:00:00Z",
	html_url: "https://github.com/doubleoevan/carlnotes/releases/tag/v0.4.0",
	prerelease: false,
	draft: false,
}

// the index shows what leads a body, never the generated list folded under the sentinel
test("the summary is what sits above the sentinel", () => {
	expect(toReleaseSummary(PUBLISHED.body).trim()).toBe("The summary.")
})

// a body written without the sentinel is still readable instead of empty
test("a body with no sentinel is its own summary", () => {
	expect(toReleaseSummary("Just the summary.")).toBe("Just the summary.")
})

// a row is dated by the commit the tag points at, not by when someone pressed publish
test("a published release becomes a row", () => {
	const row = toReleaseUpsert(PUBLISHED)
	expect(row?.tag).toBe("v0.4.0")
	expect(row?.isPrerelease).toBe(false)
	expect(row?.releasedAt).toEqual(new Date("2026-07-21T00:00:00Z"))
})

// a draft never appears on the page, so it never reaches the table either
test("a draft is not a row", () => {
	expect(toReleaseUpsert({ ...PUBLISHED, draft: true })).toBeNull()
})

// an untitled release still needs something to show, and GitHub shows the tag
test("an untitled release falls back to its tag", () => {
	expect(toReleaseUpsert({ ...PUBLISHED, name: null })?.name).toBe("v0.4.0")
})

// a prerelease is stored with its flag, so promoting it later takes no special write
test("a prerelease is stored as one", () => {
	expect(toReleaseUpsert({ ...PUBLISHED, prerelease: true })?.isPrerelease).toBe(true)
})

// an unsigned request is rejected, and so is one that arrives with no secret configured
test("an unsigned request fails closed", async () => {
	const previousSecret = Bun.env.GITHUB_WEBHOOK_SECRET
	try {
		Bun.env.GITHUB_WEBHOOK_SECRET = "shhh"
		expect(await isSignedByGitHub("{}", undefined)).toBe(false)
		expect(await isSignedByGitHub("{}", "sha256=deadbeef")).toBe(false)

		// with no secret set the route rejects instead of trusting the payload
		Bun.env.GITHUB_WEBHOOK_SECRET = ""
		expect(await isSignedByGitHub("{}", "sha256=deadbeef")).toBe(false)
	} finally {
		restoreSecret(previousSecret)
	}
})

// a form-encoded webhook is the misconfiguration most likely to reach us, so it says so
test("a form encoded body is refused with the reason", async () => {
	const previousSecret = Bun.env.GITHUB_WEBHOOK_SECRET
	try {
		Bun.env.GITHUB_WEBHOOK_SECRET = "shhh"
		const body = "payload=%7B%22action%22%3A%22published%22%7D"
		const response = await releasesRoute.request("/api/webhooks/github", {
			method: "POST",
			body,
			headers: { [SIGNATURE_HEADER]: await toSignature(body) },
		})

		// the reason names the setting to change instead of leaving a bare failure
		expect(response.status).toBe(400)
		expect(await response.text()).toContain("application/json")
	} finally {
		restoreSecret(previousSecret)
	}
})

// the signature GitHub actually sends is accepted
test("a correctly signed request passes", async () => {
	const previousSecret = Bun.env.GITHUB_WEBHOOK_SECRET
	try {
		Bun.env.GITHUB_WEBHOOK_SECRET = "shhh"

		// the same HMAC GitHub computes over the raw body
		const body = JSON.stringify({ action: "published" })
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode("shhh"),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		)
		const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
		expect(await isSignedByGitHub(body, `sha256=${Buffer.from(digest).toString("hex")}`)).toBe(true)
	} finally {
		restoreSecret(previousSecret)
	}
})
