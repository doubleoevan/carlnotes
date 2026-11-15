// the updates routes: a session, the day's recap or null without one, its first route, and a person's recap for an
// admin
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "../authorization"
import { toSignedInApp } from "../testSession"
import * as updates from "./updates"
import { updatesRoute } from "./updatesRoute"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("the recap's read needs a session", async () => {
	const recapSpy = spyOn(updates, "readUpdatesRecap").mockResolvedValue("Carl's line.")
	const response = await updatesRoute.request("/updates/recap")
	expect(response.status).toBe(401)
	expect(recapSpy).not.toHaveBeenCalled()
})

test("the recap's read returns the day's recap, or null without one", async () => {
	const recapSpy = spyOn(updates, "readUpdatesRecap").mockResolvedValueOnce("Carl's line.").mockResolvedValueOnce(null)

	// two reads as one user: the first finds a recap, and the second finds none
	const app = toSignedInApp(updatesRoute, "recap-user-1")
	expect(await (await app.request("/updates/recap")).json()).toEqual({ recap: "Carl's line." })
	expect(await (await app.request("/updates/recap")).json()).toEqual({ recap: null })
	expect(recapSpy).toHaveBeenCalledWith("recap-user-1")
})

test("the recap's first route returns the recap as an opener for the 0.1.0 mobile app", async () => {
	const recapSpy = spyOn(updates, "readUpdatesRecap").mockResolvedValue("Carl's line.")

	// a visitor is turned away, and a signed-in user reads the recap under its first field
	expect((await updatesRoute.request("/updates/opener")).status).toBe(401)
	const app = toSignedInApp(updatesRoute, "recap-user-1")
	expect(await (await app.request("/updates/opener")).json()).toEqual({ opener: "Carl's line." })
	expect(recapSpy).toHaveBeenCalledWith("recap-user-1")
})

test("another person's recap is an admin's read of the person's home recap", async () => {
	const profileRecapSpy = spyOn(updates, "readProfileUpdatesRecap").mockResolvedValue("Carl's line.")
	const recapSpy = spyOn(updates, "readUpdatesRecap")
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValueOnce(false).mockResolvedValueOnce(true)

	// a visitor and a user who is not an admin are turned away
	expect((await updatesRoute.request("/profiles/person-1/recap")).status).toBe(401)
	const app = toSignedInApp(updatesRoute, "recap-user-1")
	expect((await app.request("/profiles/person-1/recap")).status).toBe(403)

	// an admin reads the person's recap, and the admin's own is not read
	expect(await (await app.request("/profiles/person-1/recap")).json()).toEqual({ recap: "Carl's line." })
	expect(isAllowedSpy).toHaveBeenCalledWith("recap-user-1", "admin:console")
	expect(profileRecapSpy).toHaveBeenCalledWith("person-1")
	expect(recapSpy).not.toHaveBeenCalled()
})
