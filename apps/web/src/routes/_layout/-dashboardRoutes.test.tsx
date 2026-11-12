// the Dashboard routes are leaves beside the profile and team pages, so each of those pages renders its own body
import { expect, test } from "bun:test"
import { createMemoryHistory, createRouter } from "@tanstack/react-router"
import { routeTree } from "@/routeTree.gen"

test("the Dashboard pages are leaves beside the profile and team pages", () => {
	const { routesById } = createRouter({ routeTree, history: createMemoryHistory() })

	// each Dashboard page hangs off the public layout, and Team Dashboard's menu row off the signed-in one
	for (const id of [
		"/_layout/profiles/$userId_/specials/topics",
		"/_layout/profiles/$userId_/specials/podcasts",
		"/_layout/teams/$teamId_/specials",
	] as const) {
		expect(routesById[id].parentRoute.id).toBe("/_layout")
	}
	expect(routesById["/_layout/_signedIn/teams/specials"].parentRoute.id).toBe("/_layout/_signedIn")

	// the profile and team pages hold no child route, so each renders its own body
	expect(routesById["/_layout/profiles/$userId"].children).toBeUndefined()
	expect(routesById["/_layout/teams/$teamId"].children).toBeUndefined()
})
