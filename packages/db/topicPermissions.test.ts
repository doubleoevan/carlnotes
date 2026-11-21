// topic permission tests: a team topic's edit role is read once per request on the pool, and every time otherwise
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { runWithRequestMemo } from "./requestMemo"
import { toTopicEditRole } from "./topicPermissions"

// a team topic whose owner is someone else
const TEAM_TOPIC = { ownerId: "owner-1", teamId: "team-1" }

// the pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a request reads a team topic's edit role once however often it asks", async () => {
	const sentQueries = stubConnectionPool()
	await runWithRequestMemo(async () => {
		await Promise.all([toTopicEditRole("editor-1", TEAM_TOPIC), toTopicEditRole("editor-1", TEAM_TOPIC)])
		await toTopicEditRole("editor-1", TEAM_TOPIC)
	})
	expect(sentQueries).toHaveLength(1)
})

test("outside a request, each ask reads the edit role", async () => {
	const sentQueries = stubConnectionPool()
	await toTopicEditRole("editor-1", TEAM_TOPIC)
	await toTopicEditRole("editor-1", TEAM_TOPIC)
	expect(sentQueries).toHaveLength(2)
})
