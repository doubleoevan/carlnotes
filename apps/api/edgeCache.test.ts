// edge cache tests: the edge shares a rendered response only if it is a 200 or a permanent redirect and sets no
// cookie, and its request has no session cookie or authorization header
import { expect, test } from "bun:test"
import { toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { RENDERED_CACHE_TAG, RENDERED_EDGE_CACHE_CONTROL, setRenderedCacheHeaders } from "./edgeCache"

// the headers that a rendered response is sent with, given its request's headers
function toRenderedCacheHeaders(requestHeaders: Record<string, string>, response: Response): Headers {
	setRenderedCacheHeaders(new Request("http://localhost/topics/t1/agents", { headers: requestHeaders }), response)
	return response.headers
}

// the browser revalidates every time, and the edge caches a copy for a minute under the tag that the purge clears
test("a 200 for a signed-out request is shared at the edge", () => {
	const responseHeaders = toRenderedCacheHeaders({}, new Response("page"))
	expect(responseHeaders.get("Cache-Control")).toBe("no-cache")
	expect(responseHeaders.get("CDN-Cache-Control")).toBe(RENDERED_EDGE_CACHE_CONTROL)
	expect(RENDERED_EDGE_CACHE_CONTROL).toBe("max-age=60, stale-while-revalidate=60, stale-if-error=120")
	expect(responseHeaders.get("Cache-Tag")).toBe(RENDERED_CACHE_TAG)
})

// the same url shows a signed-in user something else, so the edge never caches their copy
test("a request with a session cookie, under either name, is private", () => {
	for (const sessionCookie of ["better-auth.session_token=abc", "__Secure-better-auth.session_token=abc"]) {
		const responseHeaders = toRenderedCacheHeaders({ cookie: sessionCookie }, new Response("page"))
		expect(responseHeaders.get("Cache-Control")).toBe("private, no-cache")
		expect(responseHeaders.get("CDN-Cache-Control")).toBeNull()
		expect(responseHeaders.get("Cache-Tag")).toBeNull()
	}
})

// a credentialed request, a failed render, and a response that sets a cookie are never cached at the edge
test("an authorization header, a status other than 200, or a Set-Cookie makes the response private", () => {
	// one response for each case: an authorization header, a 404, and a Set-Cookie header
	const authorizedHeaders = toRenderedCacheHeaders({ authorization: "Bearer abc" }, new Response("page"))
	const notFoundHeaders = toRenderedCacheHeaders({}, new Response("missing", { status: 404 }))
	const setCookieHeaders = toRenderedCacheHeaders({}, new Response("page", { headers: { "Set-Cookie": "a=b" } }))

	// the edge caches none of them
	for (const responseHeaders of [authorizedHeaders, notFoundHeaders, setCookieHeaders]) {
		expect(responseHeaders.get("Cache-Control")).toBe("private, no-cache")
		expect(responseHeaders.get("CDN-Cache-Control")).toBeNull()
	}
})

// a permanent redirect, such as a topic's old slug, is shared like a page, and a temporary redirect stays private
test("a permanent redirect for a signed-out request is shared, and a temporary one is private", () => {
	for (const status of [301, 308]) {
		const redirectHeaders = toRenderedCacheHeaders(
			{},
			new Response(null, { status, headers: { Location: "/topics/t1" } }),
		)
		expect(redirectHeaders.get("Cache-Control")).toBe("no-cache")
		expect(redirectHeaders.get("CDN-Cache-Control")).toBe(RENDERED_EDGE_CACHE_CONTROL)
	}
	const temporaryHeaders = toRenderedCacheHeaders({}, new Response(null, { status: 302, headers: { Location: "/" } }))
	expect(temporaryHeaders.get("Cache-Control")).toBe("private, no-cache")
})

// a topic's image files share one tag, so a topic leaving the public set purges every file at once
test("a topic image's cache tag names the topic", () => {
	expect(toTopicImageCacheTag("topic-1")).toBe("topic-image:topic-1")
})

// a profile page and its payloads carry the profile's own tag, which a change to its pins purges
test("a profile page and its payload are tagged with the profile's user, and the home with its own tag", () => {
	const toCacheTag = (path: string): string | null => {
		const response = new Response("page")
		setRenderedCacheHeaders(new Request(`http://localhost${path}`), response)
		return response.headers.get("Cache-Tag")
	}

	// the page, its payload, and the home each carry their own tag beside the rendered one
	expect(toCacheTag("/profiles/user-1")).toBe(`${RENDERED_CACHE_TAG},profile:user-1`)
	expect(toCacheTag("/api/profiles/user-1")).toBe(`${RENDERED_CACHE_TAG},profile:user-1`)
	expect(toCacheTag("/")).toBe(`${RENDERED_CACHE_TAG},home`)

	// a Topic Post's page carries the post's own tag, with or without its slug, and its Topic's page does not
	expect(toCacheTag("/topics/topic-1/home-espresso/posts/post-1/dialing-in")).toBe(
		`${RENDERED_CACHE_TAG},topic-post:post-1`,
	)
	expect(toCacheTag("/topics/topic-1/home-espresso/posts/post-1")).toBe(`${RENDERED_CACHE_TAG},topic-post:post-1`)
	expect(toCacheTag("/topics/topic-1/home-espresso")).toBe(RENDERED_CACHE_TAG)
})
