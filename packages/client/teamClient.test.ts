// team client tests: a team avatar upload that never reaches the server fails with the generic rejection, and a rejected
// one returns the reason the server names. a team create and a team update each read a rejection by its status
import { afterEach, expect, test } from "bun:test"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"
import { fetchTeamPage, sendCreateTeam, sendTeamAvatar, sendUpdateTeam } from "./teamClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// only an access rejection is an answer about the team. any other rejected read throws, so the team screen shows its
// error state instead of a missing team
test("fetchTeamPage reads the gate from a 403, a missing team from a 404, and throws on any other rejection", async () => {
	stubFetch(Response.json({ teamName: "Espresso club", hasRequestedToJoin: false }, { status: 403 }))
	expect(await fetchTeamPage("team-1")).toEqual({
		status: "gated",
		teamName: "Espresso club",
		hasRequestedToJoin: false,
	})
	stubFetch(new Response(null, { status: 404 }))
	expect(await fetchTeamPage("team-1")).toEqual({ status: "missing" })

	// a server error
	stubFetch(new Response(null, { status: 500 }))
	await expect(fetchTeamPage("team-1")).rejects.toThrow("team page load failed: 500")
})

test("a team avatar upload fails on a network error and returns the server's reason on a rejection", async () => {
	// the request never reaches the server
	stubFailingFetch()
	expect(await sendTeamAvatar("team-1", new File(["image"], "avatar.png"))).toBe("failed")

	// the server rejects the image and names why
	stubFetch(Response.json({ error: "too-large" }, { status: 400 }))
	expect(await sendTeamAvatar("team-1", new File(["image"], "avatar.png"))).toBe("too-large")
})

// a created team returns its id. a taken name is the 409 and the daily team limit the 429, each its own rejection, and
// any other rejected status or a request that never reaches the server is a failure, never the plan limit
test("sendCreateTeam returns the id, and reads a taken name, the team limit, and a failure apart", async () => {
	const createTeamPayload = { name: "Espresso club", topicIds: [] }
	stubFetch(Response.json({ teamId: "team-1" }))
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ teamId: "team-1" })

	// the two rejections the route names
	stubFetch(Response.json({ error: "name-taken" }, { status: 409 }))
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ rejection: "name-taken" })
	stubFetch(Response.json({ error: "team limit reached" }, { status: 429 }))
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ rejection: "quota" })

	// a validation error, a server error, and a request that never reaches the server
	stubFetch(Response.json({ error: "bad request" }, { status: 400 }))
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ rejection: "failed" })
	stubFetch(new Response("no", { status: 500 }))
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ rejection: "failed" })
	stubFailingFetch()
	expect(await sendCreateTeam(createTeamPayload)).toEqual({ rejection: "failed" })
})

// a team update is saved on an ok response alone. a taken name names itself, and any other rejected status or a request
// that never reaches the server is a failed save, never a silent success
test("sendUpdateTeam reads a saved edit, a taken name, and a failed save apart", async () => {
	stubFetch(Response.json({ ok: true }))
	expect(await sendUpdateTeam("team-1", { name: "Espresso club" })).toBeNull()
	stubFetch(Response.json({ error: "name-taken" }, { status: 409 }))
	expect(await sendUpdateTeam("team-1", { name: "Taken" })).toBe("name-taken")

	// a forbidden edit, a server error, and a request that never reaches the server
	stubFetch(Response.json({ error: "forbidden" }, { status: 403 }))
	expect(await sendUpdateTeam("team-1", { name: "Espresso club" })).toBe("failed")
	stubFetch(new Response("no", { status: 500 }))
	expect(await sendUpdateTeam("team-1", { name: "Espresso club" })).toBe("failed")
	stubFailingFetch()
	expect(await sendUpdateTeam("team-1", { name: "Espresso club" })).toBe("failed")
})
