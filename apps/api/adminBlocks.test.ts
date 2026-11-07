// admin block route tests: only an admin sets or clears an admin block, and an unknown user is a 404
import { afterEach, expect, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { Hono } from "hono"
import { adminBlocksRoute } from "./adminBlocks"
import type { AppEnv } from "./currentUser"
import { toSignedInApp } from "./testSession"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("an admin sets a block that records when and who, and clears it", async () => {
	// the admin's access row, and the blocked user's row back from each update
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "users"') ? [["user-2"]] : [ADMIN_USER_ACCESS_ROW],
	)
	const adminApp = toSignedInApp(adminBlocksRoute, "admin-1")
	expect((await adminApp.request("/admin/users/user-2/block", { method: "POST" })).status).toBe(200)
	expect((await adminApp.request("/admin/users/user-2/block", { method: "DELETE" })).status).toBe(200)

	// the admin block names the admin, and clearing it names nobody
	const [blockQuery, clearQuery] = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(blockQuery?.values).toContain("admin-1")
	expect(blockQuery?.values).toContain("user-2")
	expect(clearQuery?.values).not.toContain("admin-1")
})

test("a user who is not an admin and a visitor block nobody", async () => {
	const sentQueries = stubConnectionPool(() => [FREE_USER_ACCESS_ROW])
	const userResponse = await toSignedInApp(adminBlocksRoute, "owner-1").request("/admin/users/user-2/block", {
		method: "POST",
	})
	const visitorResponse = await new Hono<AppEnv>()
		.route("/", adminBlocksRoute)
		.request("/admin/users/user-2/block", { method: "POST" })
	expect([userResponse.status, visitorResponse.status]).toEqual([403, 401])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("update"))).toBe(false)
})

test("blocking a user who does not exist is a 404", async () => {
	stubConnectionPool(({ text }) => (text.startsWith('update "users"') ? [] : [ADMIN_USER_ACCESS_ROW]))
	const response = await toSignedInApp(adminBlocksRoute, "admin-1").request("/admin/users/missing/block", {
		method: "POST",
	})
	expect(response.status).toBe(404)
})
