// the updates route: a session, and the day's opener or null without one
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toSignedInApp } from "../testSession"
import * as updates from "./updates"
import { updatesRoute } from "./updatesRoute"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("the opener's read needs a session", async () => {
	const openerSpy = spyOn(updates, "readUpdatesOpener").mockResolvedValue("Carl's line.")
	const response = await updatesRoute.request("/updates/opener")
	expect(response.status).toBe(401)
	expect(openerSpy).not.toHaveBeenCalled()
})

test("the opener's read returns the day's opener, or null without one", async () => {
	const openerSpy = spyOn(updates, "readUpdatesOpener")
		.mockResolvedValueOnce("Carl's line.")
		.mockResolvedValueOnce(null)

	// two reads as one user: the first finds an opener, and the second finds none
	const app = toSignedInApp(updatesRoute, "opener-user-1")
	expect(await (await app.request("/updates/opener")).json()).toEqual({ opener: "Carl's line." })
	expect(await (await app.request("/updates/opener")).json()).toEqual({ opener: null })
	expect(openerSpy).toHaveBeenCalledWith("opener-user-1")
})
