// topic route tests: a visitor's hidden topic page responds 403 with the gate for an invite topic alone, and 404 for a
// private or missing one
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as feeds from "./feeds"
import * as helpers from "./helpers"
import { topicsRoute } from "./topicsRoute"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// only an invite topic's gate is shown, and a private topic looks missing
test("a visitor's hidden topic page is a 403 gate for an invite topic and a 404 for a private one", async () => {
	// a visitor's page read that finds nothing visible, and an invite topic's gate
	spyOn(feeds, "readVisitorTopicPage").mockResolvedValue(null)
	const loadTopicGateResponseSpy = spyOn(helpers, "loadTopicGateResponse").mockResolvedValue({
		error: "forbidden",
		gatedVisibility: "invite",
		topicName: "Coffee",
	})

	// an invite topic's gate names the topic
	const inviteResponse = await topicsRoute.request("/topics/t1")
	expect(inviteResponse.status).toBe(403)
	expect(await inviteResponse.json()).toEqual({ error: "forbidden", gatedVisibility: "invite", topicName: "Coffee" })

	// a private topic has no gate, like a missing one, and reads as missing
	loadTopicGateResponseSpy.mockResolvedValue(null)
	const privateResponse = await topicsRoute.request("/topics/t1")
	expect(privateResponse.status).toBe(404)
	expect(await privateResponse.json()).toEqual({ error: "not found" })
})
