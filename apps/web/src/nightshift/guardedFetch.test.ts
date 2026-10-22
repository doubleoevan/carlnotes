// a story's fetch rejects a call to its own api, by relative or absolute url, and passes any other url through
import { expect, mock, test } from "bun:test"
import { toGuardedFetch } from "./guardedFetch"

// the origin a story runs on
const STORY_ORIGIN = "http://localhost:6006"

// a fetch that records each url it is called with
function toRecordingFetch(): { originalFetch: typeof fetch; fetchedUrls: string[] } {
	const fetchedUrls: string[] = []
	const recordFetch = mock(async (input: Parameters<typeof fetch>[0]) => {
		fetchedUrls.push(String(input))
		return new Response("ok")
	})
	return { originalFetch: Object.assign(recordFetch, { preconnect: fetch.preconnect }), fetchedUrls }
}

test("toGuardedFetch rejects a relative or same-origin api url and never calls the original fetch", async () => {
	// both forms of an api url reject with the path and the fix
	const { originalFetch, fetchedUrls } = toRecordingFetch()
	const guardedFetch = toGuardedFetch({ originalFetch, origin: STORY_ORIGIN })
	await expect(guardedFetch("/api/topics")).rejects.toThrow(
		"a story fetched /api/topics. mock the client that calls it",
	)
	await expect(guardedFetch(`${STORY_ORIGIN}/api/teams`)).rejects.toThrow("a story fetched /api/teams")
	expect(fetchedUrls).toEqual([])
})

test("toGuardedFetch passes another origin's api and this origin's other paths through", async () => {
	// an external api and static files, even one whose name starts with api, all reach the original fetch
	const { originalFetch, fetchedUrls } = toRecordingFetch()
	const guardedFetch = toGuardedFetch({ originalFetch, origin: STORY_ORIGIN })
	await guardedFetch("https://example.com/api/topics")
	await guardedFetch("/favicon.svg")
	await guardedFetch("/apiary.svg")
	expect(fetchedUrls).toEqual(["https://example.com/api/topics", "/favicon.svg", "/apiary.svg"])
})
