// reaction summary tests: each count names its users, a user with no username stays uncounted by name
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadReactionSummary } from "./reactionRows"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a count names its users, and leaves out a user with no username", async () => {
	// two rows of one type on a Topic, in the read's column order
	stubConnectionPool(() => [
		[null, null, "topic-1", null, null, "like", "user-1", 2, true, "pourover", null, null],
		[null, null, "topic-1", null, null, "like", "user-2", 2, true, null, null, null],
	])

	const summary = await loadReactionSummary("user-1", { kind: "topic", id: "topic-1" })
	expect(summary).toEqual({
		counts: [
			{
				reactionType: "like",
				count: 2,
				users: [{ userId: "user-1", username: "pourover", avatarSource: null, avatarVersion: null }],
			},
		],
		ownReactionType: "like",
	})
})
