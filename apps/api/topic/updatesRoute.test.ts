// the updates routes: a session, the day's opener or null without one, and a person's stored opener for an admin
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "../authorization"
import { toSignedInApp } from "../testSession"
import * as updates from "./updates"
import * as updatesOpener from "./updatesOpener"
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

test("another person's opener is an admin's read of the cache alone", async () => {
	const storedOpenerSpy = spyOn(updatesOpener, "readStoredUpdatesOpener").mockResolvedValue("Carl's stored line.")
	const openerSpy = spyOn(updates, "readUpdatesOpener")
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValueOnce(false).mockResolvedValueOnce(true)

	// a visitor and a user who is not an admin are turned away
	expect((await updatesRoute.request("/profiles/person-1/opener")).status).toBe(401)
	const app = toSignedInApp(updatesRoute, "opener-user-1")
	expect((await app.request("/profiles/person-1/opener")).status).toBe(403)

	// an admin reads the person's stored opener, and no opener is written
	expect(await (await app.request("/profiles/person-1/opener")).json()).toEqual({ opener: "Carl's stored line." })
	expect(isAllowedSpy).toHaveBeenCalledWith("opener-user-1", "admin:console")
	expect(storedOpenerSpy).toHaveBeenCalledWith("person-1")
	expect(openerSpy).not.toHaveBeenCalled()
})
