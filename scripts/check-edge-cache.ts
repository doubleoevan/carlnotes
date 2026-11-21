// read-only check, run after a release: request each path the origin marks shared twice and fail if the second
// response's cf-cache-status says the edge never stores it. a public card read with a made-up session cookie must be
// served from the edge too. it sends GET requests alone.
// usage: bun run check:edge [origin] [extra path ...], with the origin https://carlnotes.com by default
import {
	MADE_UP_SESSION_COOKIE,
	toEdgeCacheFailure,
	toOwnerSharedPaths,
	toSharedPaths,
	toSitemapPages,
} from "./edgeCacheCheck"

// the origin to check, and any further shared paths named after it, such as a status read
const [origin = "https://carlnotes.com", ...extraPaths] = Bun.argv.slice(2)

// a generic client name, and how long one request may take
const REQUEST_HEADERS = { "User-Agent": "carlnotes-edge-check" }
const REQUEST_TIMEOUT_MS = 30_000

// one checked path: its result line, and why it failed if it did
type PathCheck = { line: string; failure: string | null }

// send one GET without following a redirect, and read its body so the connection is free for the next request
async function sendGet(path: string, headers: Record<string, string> = {}): Promise<Response> {
	const response = await fetch(`${origin}${path}`, {
		headers: { ...REQUEST_HEADERS, ...headers },
		redirect: "manual",
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	await response.arrayBuffer()
	return response
}

// send one GET that follows a redirect, and throw an error that names the read if it fails
async function fetchRead(path: string, readName: string): Promise<Response> {
	const response = await fetch(`${origin}${path}`, {
		headers: REQUEST_HEADERS,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	if (!response.ok) {
		throw new Error(`${readName} failed with ${response.status}`)
	}
	return response
}

// request a path twice, and judge the second response
async function checkPath(
	path: string,
	{ headers = {}, isHitRequired = false }: { headers?: Record<string, string>; isHitRequired?: boolean } = {},
): Promise<PathCheck> {
	// the first request fills the edge, and the second shows whether the edge kept it
	await sendGet(path, headers)
	const response = await sendGet(path, headers)
	const cacheStatus = response.headers.get("cf-cache-status")
	const failure = toEdgeCacheFailure({ status: response.status, cacheStatus, isHitRequired })
	return { line: `${failure ? "FAIL" : "ok  "} ${response.status} ${cacheStatus ?? "-"} ${path}`, failure }
}

// the topic card's versioned url, which its unversioned url redirects to, or null if there is no topic to show. an
// origin that serves the card without the redirect has the unversioned url checked instead
async function toVersionedCardPath(topicId: string | undefined): Promise<string | null> {
	if (!topicId) {
		return null
	}
	// a Location may name the whole url, so the check keeps its path and query
	const cardPath = `/api/topics/${topicId}/preview.png`
	const location = (await sendGet(cardPath)).headers.get("Location")
	if (!location) {
		return cardPath
	}
	const versionedCardUrl = new URL(location, origin)
	return `${versionedCardUrl.pathname}${versionedCardUrl.search}`
}

// the public Topic owner's shared paths, read from the Topic's page read, or none if there is no Topic or owner
async function toTopicOwnerSharedPaths(topicId: string | undefined): Promise<string[]> {
	if (!topicId) {
		return []
	}

	// the owner of the Topic that its page read holds
	const topicPageResponse = await fetchRead(`/api/topics/${topicId}/page`, `the Topic page read of ${topicId}`)
	const topicPageRead = (await topicPageResponse.json().catch(() => null)) as {
		topic?: { owner?: { userId?: string } | null }
	} | null
	const ownerUserId = topicPageRead?.topic?.owner?.userId
	return ownerUserId ? toOwnerSharedPaths(ownerUserId) : []
}

// find the listed pages in the live sitemap, and the paths to check from them and from the first Topic's owner
const sitemapResponse = await fetchRead("/sitemap.xml", "the sitemap read")
const sitemapPages = toSitemapPages(await sitemapResponse.text())
const ownerSharedPaths = await toTopicOwnerSharedPaths(sitemapPages.topic?.topicId)
const sharedPaths = [...toSharedPaths(sitemapPages), ...ownerSharedPaths, ...extraPaths]

// check every shared path one at a time, so the check never bursts against the origin
const pathChecks: PathCheck[] = []
for (const sharedPath of sharedPaths) {
	pathChecks.push(await checkPath(sharedPath))
}

// a public card read with a session cookie is served from the edge, no matter what the cookie is
const versionedCardPath = await toVersionedCardPath(sitemapPages.topic?.topicId)
if (versionedCardPath) {
	const cardCheck = await checkPath(versionedCardPath, {
		headers: { Cookie: MADE_UP_SESSION_COOKIE },
		isHitRequired: true,
	})
	pathChecks.push({ ...cardCheck, line: `${cardCheck.line} (with a made-up session cookie)` })
}

// print every result, then name each failing path and fail
console.log(`edge cache check of ${origin}\n${pathChecks.map((pathCheck) => pathCheck.line).join("\n")}`)
const failedChecks = pathChecks.filter((pathCheck) => pathCheck.failure)
if (failedChecks.length > 0) {
	console.error(
		`\n${failedChecks.length} path(s) the edge does not store:\n${failedChecks.map((pathCheck) => pathCheck.line).join("\n")}`,
	)
	process.exit(1)
}
console.log("\nevery shared path is stored at the edge")
