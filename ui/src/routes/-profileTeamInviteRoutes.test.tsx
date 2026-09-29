// the profile, team, join, login, and plans routes as the server renders them, with each head, 404, and noindex, and
// the 404 for a url no page serves
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { PageHead } from "@shared/contracts"
import { SITE_TITLE } from "@shared/seo"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "./-loadRouter"

// the fixture user's id, the private team's id, the live invite's token, and an id and a token the api does not have
const USER_ID = "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c"
const PRIVATE_TEAM_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const INVITE_TOKEN = "invite-token-night-owls"
const MISSING_ID = "00000000-0000-4000-8000-000000000000"
const MISSING_INVITE_TOKEN = "missing-invite-token"

// the user's profile head, as the api returns it for a user with a public topic
const PROFILE_HEAD = {
	title: "carl — CarlNotes",
	cardTitle: "carl — CarlNotes",
	description: "carl on CarlNotes. 1 public topic, 2 followers.",
	canonicalUrl: `https://carlnotes.com/profiles/${USER_ID}`,
	cardUrl: `https://carlnotes.com/profiles/${USER_ID}`,
	imageUrl: `https://carlnotes.com/api/profiles/${USER_ID}/preview.png`,
	feedUrl: null,
	isIndexed: true,
	jsonLd: null,
} satisfies PageHead

// the live invite's head, as the api returns it. an invite is never indexed
const INVITE_HEAD = {
	title: "Join Night owls on CarlNotes",
	cardTitle: "Join Night owls on CarlNotes",
	description: "You are invited to join Night owls. Carl reads its sources and shares the notes.",
	canonicalUrl: null,
	cardUrl: `https://carlnotes.com/invite/${INVITE_TOKEN}`,
	imageUrl: `https://carlnotes.com/api/teams/${PRIVATE_TEAM_ID}/preview.png`,
	feedUrl: null,
	isIndexed: false,
	jsonLd: null,
} satisfies PageHead

// the api's response to each path these tests serve. any other path responds 404
const API_RESPONSES: Record<string, () => Response> = {
	[`/api/profiles/${USER_ID}/head`]: () => Response.json(PROFILE_HEAD),
	[`/api/teams/${PRIVATE_TEAM_ID}/page`]: () =>
		Response.json({ error: "forbidden", teamName: "Night owls", hasRequestedToJoin: false }, { status: 403 }),
	[`/api/invites/${INVITE_TOKEN}/head`]: () => Response.json(INVITE_HEAD),
}

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// a fake fetch that serves the responses above in place of the api
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const requestUrl = input instanceof Request ? input.url : input.toString()
	const apiResponse = API_RESPONSES[new URL(requestUrl).pathname]?.()
	return Promise.resolve(apiResponse ?? Response.json({ error: "not found" }, { status: 404 }))
}

// swap the fake fetch in for these tests, and restore the real fetch after
beforeAll(() => {
	globalThis.fetch = fakeFetch as typeof fetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})

// a profile renders the title and canonical url the api returns for it
test("a profile renders its head", async () => {
	const { router, serverLoadResult } = await loadRouter(`/profiles/${USER_ID}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain("<title>carl — CarlNotes</title>")
	expect(html).toContain(`<link rel="canonical" href="https://carlnotes.com/profiles/${USER_ID}"`)
})

// the route responds 404 for a user the api does not have
test("a missing profile responds 404", async () => {
	const { serverLoadResult } = await loadRouter(`/profiles/${MISSING_ID}`)
	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
})

// a private team has no head, so its gate renders with the site-wide title and noindex
test("a private team renders its gate with noindex and the site-wide title", async () => {
	const { router, serverLoadResult } = await loadRouter(`/teams/${PRIVATE_TEAM_ID}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain(`<title>${SITE_TITLE}</title>`)
	expect(html).toContain('<meta name="robots" content="noindex, follow"')
	expect(html).toContain("Night owls")
	expect(html).not.toContain('rel="canonical"')
	expect(html.match(/<title>/g)).toHaveLength(1)
})

// the route responds 404 for a team the api has neither a head nor a page for
test("a missing team responds 404", async () => {
	const { serverLoadResult } = await loadRouter(`/teams/${MISSING_ID}`)
	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
})

// a live invite renders its card with noindex
test("an invite renders its head with noindex", async () => {
	const { router, serverLoadResult } = await loadRouter(`/invite/${INVITE_TOKEN}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain("<title>Join Night owls on CarlNotes</title>")
	expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
})

// a token with no live invite responds 200 with the site-wide title and noindex
test("an unknown invite token responds 200 with the site-wide title and noindex", async () => {
	const { router, serverLoadResult } = await loadRouter(`/invite/${MISSING_INVITE_TOKEN}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain(`<title>${SITE_TITLE}</title>`)
	expect(html).toContain('<meta name="robots" content="noindex, follow"')
})

// the login page's document renders on the server with its own title, left out of search results
test("the login page renders its title with noindex", async () => {
	const { router } = await loadRouter("/login")
	const html = renderToString(<RouterProvider router={router} />)

	expect(html).toContain("<title>Log in — CarlNotes</title>")
	expect(html).toContain('<meta name="robots" content="noindex, follow"')
})

// the plans page renders its own title, canonical url, description, and card
test("the plans page renders its head", async () => {
	const { router, serverLoadResult } = await loadRouter("/plans")
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain("<title>Plans — CarlNotes</title>")
	expect(html).toContain('<link rel="canonical" href="https://carlnotes.com/plans"')
	expect(html).toContain(
		'<meta name="description" content="Carl turns caffeine into notes worth reading. Compare the CarlNotes plans, monthly or yearly."',
	)
	expect(html).toContain('<meta property="og:title" content="Plans"')
	expect(html).toContain('<meta property="og:url" content="https://carlnotes.com/plans"')
})

// a path that only partly matches a page renders NotFoundPage inside the shell
test("a partly matched url renders NotFoundPage inside the shell with 404", async () => {
	const { router, serverLoadResult } = await loadRouter("/privacy/extra")
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
	expect(html).toContain("<header")
	expect(html).toContain("There&#x27;s no page here")
})

// the route tree responds 404 for a url no page serves
test("an unmatched url responds 404", async () => {
	const { serverLoadResult } = await loadRouter("/nope")
	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
})
