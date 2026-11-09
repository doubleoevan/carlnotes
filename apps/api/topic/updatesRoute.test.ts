// the updates route: a session, a valid length, and a Topic the user may read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { UpdatesResponse } from "@carlnotes/contracts/updates"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as updates from "./updates"
import { updatesRoute } from "./updatesRoute"

// the list every request here returns
const UPDATES_RESULT: UpdatesResponse = {
	opener: "Carl's line.",
	findings: [],
	moreCount: 0,
	morePath: "/topics",
	topics: [],
	podcastEpisodes: [],
}

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("a request without a session is rejected and writes nothing", async () => {
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const response = await updatesRoute.request("/updates", toJsonRequest({}))
	expect(response.status).toBe(401)
	expect(buildSpy).not.toHaveBeenCalled()
})

test("a request with no length builds the 15 minute list across Topics", async () => {
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const response = await toSignedInApp(updatesRoute, "user-1").request("/updates", toJsonRequest({}))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual(UPDATES_RESULT)
	expect(buildSpy.mock.calls[0]?.[0]).toMatchObject({ userId: "user-1", minutes: 15, topicId: null })
})

test.each([5, 15, 30])("a %i minute list is valid", async (minutes) => {
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const app = toSignedInApp(updatesRoute, "user-1")
	const response = await app.request("/updates", toJsonRequest({ minutes, topicId: "topic-1" }))
	expect(response.status).toBe(200)
	expect(buildSpy.mock.calls[0]?.[0]).toMatchObject({ minutes, topicId: "topic-1" })
})

test.each([0, 10, 60, "15"])("a length of %p is invalid input", async (minutes) => {
	const buildSpy = spyOn(updates, "buildUpdates").mockResolvedValue(UPDATES_RESULT)
	const response = await toSignedInApp(updatesRoute, "user-1").request("/updates", toJsonRequest({ minutes }))
	expect(response.status).toBe(400)
	expect(buildSpy).not.toHaveBeenCalled()
})

test("a Topic the user may not read reads as a missing one", async () => {
	spyOn(updates, "buildUpdates").mockResolvedValue(null)
	const response = await toSignedInApp(updatesRoute, "user-1").request(
		"/updates",
		toJsonRequest({ topicId: "private-topic" }),
	)
	expect(response.status).toBe(404)
})
