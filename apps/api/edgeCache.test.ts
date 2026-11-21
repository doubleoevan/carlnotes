// edge cache tests: the edge shares a rendered response only if it is a 200 or a permanent redirect and sets no
// cookie, and its request has no session cookie or authorization header. each page carries its own tags, and a page
// read is shared only once its setting is on
import { expect, test } from "bun:test"
import { toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { Hono } from "hono"
import type { AppEnv } from "./currentUser"
import {
	RENDERED_CACHE_TAG,
	RENDERED_EDGE_CACHE_CONTROL,
	renderedPageReadCacheHeaders,
	setPollCacheHeaders,
	setRenderedCacheHeaders,
} from "./edgeCache"

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
	expect(responseHeaders.get("Cache-Tag")).toBe(`${RENDERED_CACHE_TAG},topic:t1`)
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

// a profile page and its payloads carry the profile's own tag, which a change to its featured items purges
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

	// a Topic Post's page carries its Topic's tag and the post's own, with or without its slug, and its Topic's page
	// carries the Topic's tag alone
	expect(toCacheTag("/topics/topic-1/home-espresso/posts/post-1/dialing-in")).toBe(
		`${RENDERED_CACHE_TAG},topic:topic-1,topic-post:post-1`,
	)
	expect(toCacheTag("/topics/topic-1/home-espresso/posts/post-1")).toBe(
		`${RENDERED_CACHE_TAG},topic:topic-1,topic-post:post-1`,
	)
	expect(toCacheTag("/topics/topic-1/home-espresso")).toBe(`${RENDERED_CACHE_TAG},topic:topic-1`)
})

// a Topic's pages and page reads carry the Topic's tag, a team's page and page read the team's, and a Topic Post's page
// read the post's, so a visibility change or a delete purges each at once
test("a topic's, a team's, a Topic Post's, and a Dashboard's pages and page reads carry their own tags", () => {
	const toCacheTag = (path: string): string | null => {
		const response = new Response("page")
		setRenderedCacheHeaders(new Request(`http://localhost${path}`), response)
		return response.headers.get("Cache-Tag")
	}

	// a topic's page read, a podcast episode page, and its page read carry the topic's tag
	expect(toCacheTag("/api/topics/topic-1/page")).toBe(`${RENDERED_CACHE_TAG},topic:topic-1`)
	expect(toCacheTag("/topics/topic-1/home-espresso/episodes/2026/3")).toBe(`${RENDERED_CACHE_TAG},topic:topic-1`)
	expect(toCacheTag("/api/topics/topic-1/episodes/2026/3/page")).toBe(`${RENDERED_CACHE_TAG},topic:topic-1`)

	// a team's page and its page read, then a Topic Post's page read and a profile's page read
	expect(toCacheTag("/teams/team-1")).toBe(`${RENDERED_CACHE_TAG},team:team-1`)
	expect(toCacheTag("/api/teams/team-1/page")).toBe(`${RENDERED_CACHE_TAG},team:team-1`)
	expect(toCacheTag("/api/topic-posts/post-1/page")).toBe(`${RENDERED_CACHE_TAG},topic-post:post-1`)
	expect(toCacheTag("/api/profiles/user-1/page")).toBe(`${RENDERED_CACHE_TAG},profile:user-1`)

	// a Dashboard's page read carries the Dashboard's tag, and an unknown kind carries none
	expect(toCacheTag("/api/dashboards/teamDashboard/team-1/page")).toBe(
		`${RENDERED_CACHE_TAG},dashboard:teamDashboard:team-1`,
	)
	expect(toCacheTag("/api/dashboards/noteDashboard/team-1/page")).toBe(RENDERED_CACHE_TAG)
})

// a page read is private until the setting turns on its edge headers, and then it is shared like its page
test("a page read is shared at the edge only once the setting is on", async () => {
	// one app that sends a page read through the middleware
	const pageReadApp = new Hono().get("/api/topics/:id/page", renderedPageReadCacheHeaders, (context) =>
		context.json({ head: null }),
	)
	const previousSetting = Bun.env.PAGE_READS_EDGE_CACHED

	// with the setting off the response is private and has no edge header
	Bun.env.PAGE_READS_EDGE_CACHED = "false"
	const privateResponse = await pageReadApp.request("/api/topics/topic-1/page")
	expect(privateResponse.headers.get("Cache-Control")).toBe("private, no-cache")
	expect(privateResponse.headers.get("CDN-Cache-Control")).toBeNull()

	// with the setting on a visitor's read is shared under the topic's tag, and a signed-in read stays private
	Bun.env.PAGE_READS_EDGE_CACHED = "true"
	const sharedResponse = await pageReadApp.request("/api/topics/topic-1/page")
	expect(sharedResponse.headers.get("CDN-Cache-Control")).toBe(RENDERED_EDGE_CACHE_CONTROL)
	expect(sharedResponse.headers.get("Cache-Tag")).toBe(`${RENDERED_CACHE_TAG},topic:topic-1`)
	const signedInResponse = await pageReadApp.request("/api/topics/topic-1/page", {
		headers: { cookie: "better-auth.session_token=abc" },
	})
	expect(signedInResponse.headers.get("Cache-Control")).toBe("private, no-cache")

	// a Topic Post's page read carries the tag its route added beside its post's
	const topicPostApp = new Hono<AppEnv>().get("/api/topic-posts/:id/page", renderedPageReadCacheHeaders, (context) => {
		context.set("pageCacheTags", ["topic:topic-1"])
		return context.json({ head: null })
	})
	const topicPostResponse = await topicPostApp.request("/api/topic-posts/post-1/page")
	expect(topicPostResponse.headers.get("Cache-Tag")).toBe(`${RENDERED_CACHE_TAG},topic-post:post-1,topic:topic-1`)

	// put the setting back as it was
	if (previousSetting === undefined) {
		delete Bun.env.PAGE_READS_EDGE_CACHED
	} else {
		Bun.env.PAGE_READS_EDGE_CACHED = previousSetting
	}
})

// a visitor's poll of a public subject is shared at the edge for three seconds once the setting is on, and every other
// poll stays in the browser
test("a public poll read or status read without credentials is shared for three seconds only once the setting is on", () => {
	const previousSetting = Bun.env.PAGE_READS_EDGE_CACHED

	// the headers a poll read's response is sent with, given whether its subject is public and its request's headers
	const toPollCacheHeaders = (isPublic: boolean, requestHeaders: Record<string, string> = {}): Headers => {
		const response = new Response("{}")
		setPollCacheHeaders(
			new Request("http://localhost/api/status/topics/t1/scan", { headers: requestHeaders }),
			response,
			isPublic,
		)
		return response.headers
	}
	try {
		// with the setting off even a public read is private
		Bun.env.PAGE_READS_EDGE_CACHED = "false"
		expect(toPollCacheHeaders(true).get("Cache-Control")).toBe("private, no-cache")
		expect(toPollCacheHeaders(true).get("CDN-Cache-Control")).toBeNull()

		// with the setting on a public read without credentials is shared for three seconds, under no tag
		Bun.env.PAGE_READS_EDGE_CACHED = "true"
		const sharedHeaders = toPollCacheHeaders(true)
		expect(sharedHeaders.get("Cache-Control")).toBe("no-cache")
		expect(sharedHeaders.get("CDN-Cache-Control")).toBe("max-age=3")
		expect(sharedHeaders.get("Cache-Tag")).toBeNull()

		// a subject that is not public, and a read with a session cookie, stay private
		for (const privateHeaders of [
			toPollCacheHeaders(false),
			toPollCacheHeaders(true, { cookie: "better-auth.session_token=abc" }),
		]) {
			expect(privateHeaders.get("Cache-Control")).toBe("private, no-cache")
			expect(privateHeaders.get("CDN-Cache-Control")).toBeNull()
		}
	} finally {
		// put the setting back as it was
		if (previousSetting === undefined) {
			delete Bun.env.PAGE_READS_EDGE_CACHED
		} else {
			Bun.env.PAGE_READS_EDGE_CACHED = previousSetting
		}
	}
})
