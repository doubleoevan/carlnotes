// chat mention tests: saving a chat room's chat mentions as seen deletes the user's cached unseen count
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as redis from "../../db/redis"
import { saveSeenChatMentions, toUnseenChatMentionCountKey } from "./mentions"

// the connection pool's own query, put back after each test with the spied Redis functions
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the delete names the same Redis key that the unseen count is cached under
test("saving a chat room's chat mentions as seen deletes the user's cached unseen count", async () => {
	// a connection pool that accepts the update, and a spy on the Redis key delete
	stubConnectionPool()
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKey").mockResolvedValue(undefined)

	// save the chat room's chat mentions as seen and check that the delete names the user's unseen count key
	await saveSeenChatMentions("user-1", "topic-1", "team-1")
	expect(deleteRedisKeySpy).toHaveBeenCalledWith(toUnseenChatMentionCountKey("user-1"))
})
