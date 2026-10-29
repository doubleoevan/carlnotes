// user block tests: a block is written once and clears the cached mention count, a self block is rejected, an unblock
// removes the row, and the list shapes each blocked person
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { toJsonRequest, toSignedInApp } from "./testSession"
import { userBlocksRoute } from "./userBlocks"

// put the spied Redis delete and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a block of a known user inserts the pair, ignoring a repeat, and drops the user's cached mention count
test("a block is written once and clears the mention count", async () => {
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "users"') ? [["vienna"]] : []))
	const response = await toSignedInApp(userBlocksRoute, "user-1").request("/users/user-2/block", toJsonRequest({}))
	expect(response.status).toBe(200)

	// the insert names the pair and tolerates a repeat, and the cached count goes
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "user_blocks"'))
	expect(insertQuery?.values).toEqual(["user-1", "user-2"])
	expect(insertQuery?.text).toContain("on conflict do nothing")
	expect(deleteRedisKeysSpy).toHaveBeenCalledWith("unseen-chat-mention-count:user-1")
})

// a user cannot block their own account, and an unknown account is not found
test("a self block and an unknown user are rejected", async () => {
	stubConnectionPool(() => [])
	const selfResponse = await toSignedInApp(userBlocksRoute, "user-1").request("/users/user-1/block", toJsonRequest({}))
	expect(selfResponse.status).toBe(400)
	const unknownResponse = await toSignedInApp(userBlocksRoute, "user-1").request(
		"/users/user-9/block",
		toJsonRequest({}),
	)
	expect(unknownResponse.status).toBe(404)
})

// an unblock deletes the pair and the list shapes each blocked person with the block's time
test("an unblock removes the pair, and the list names each blocked person", async () => {
	spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "user_blocks"') ? [["user-2", "vienna", "2026-10-29T10:00:00.000Z"]] : [],
	)
	const unblockResponse = await toSignedInApp(userBlocksRoute, "user-1").request("/users/user-2/block", {
		method: "DELETE",
	})
	expect(unblockResponse.status).toBe(200)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "user_blocks"'))
	expect(deleteQuery?.values).toEqual(["user-1", "user-2"])

	// the list
	const listResponse = await toSignedInApp(userBlocksRoute, "user-1").request("/users/me/blocks")
	expect(await listResponse.json()).toEqual({
		blockedUsers: [{ id: "user-2", username: "vienna", blockedAt: "2026-10-29T10:00:00.000Z" }],
	})
})
