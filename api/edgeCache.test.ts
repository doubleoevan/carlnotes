// edge cache tests: the edge shares a rendered response only if it is a 200 and sets no cookie,
// and its request has no session cookie or authorization header
import { expect, test } from "bun:test"
import { RENDERED_CACHE_TAG, setRenderedCacheHeaders } from "./edgeCache"

// the headers that a rendered response is sent with, given its request's headers
function toRenderedCacheHeaders(requestHeaders: Record<string, string>, response: Response): Headers {
	setRenderedCacheHeaders(new Request("http://localhost/topics/t1/agents", { headers: requestHeaders }), response)
	return response.headers
}

// the browser revalidates every time, and the edge caches a copy for a minute under the tag that the purge clears
test("a 200 for a signed-out request is shared at the edge", () => {
	const responseHeaders = toRenderedCacheHeaders({}, new Response("page"))
	expect(responseHeaders.get("Cache-Control")).toBe("no-cache")
	expect(responseHeaders.get("CDN-Cache-Control")).toBe("max-age=60, stale-while-revalidate=60")
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
