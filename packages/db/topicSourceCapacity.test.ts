// receiving Sources remain outside fetched capacity while the eleventh fetched Source is refused
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { db } from "./index"
import { assertFetchedSourceCapacity, FetchedSourceLimitError } from "./topicSourceCapacity"

afterEach(() => restoreConnectionPool())

test("the locked count excludes receiving Sources and permits the tenth fetched Source", async () => {
	const queries = stubConnectionPool(() => [[9]])
	await expect(
		db.transaction((transaction) => assertFetchedSourceCapacity(transaction, "topic")),
	).resolves.toBeUndefined()
	expect(queries[0]?.text).toContain('"sources"."personal_source_identity" is null')
	expect(queries[0]?.values).toContain("topic")
})

test("ten fetched Sources still prevent adding an eleventh fetched Source", async () => {
	stubConnectionPool(() => [[10]])
	await expect(
		db.transaction((transaction) => assertFetchedSourceCapacity(transaction, "topic")),
	).rejects.toBeInstanceOf(FetchedSourceLimitError)
})
