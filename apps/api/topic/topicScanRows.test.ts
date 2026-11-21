// topic scan rows tests: the newest page of a topic whose history is empty reads the stopped scans instead
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { startTopicScanRowsRead } from "./topicScanRows"

// put the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// a topic whose every scan was stopped still reads the month's cost from its newest stopped scan's row
test("the newest page of an empty history reads every scan instead", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const { scanRowsRead } = startTopicScanRowsRead({
		topic: { id: "topic-1", visibility: "public" },
		userId: "owner-1",
		isHeadRead: false,
		isNewestScans: true,
	})
	expect(await scanRowsRead).toEqual([])

	// the page's read, then the read of every scan with no limit
	const scanReads = sentQueries.filter(({ text }) => text.startsWith("select") && text.includes('from "scans"'))
	expect(scanReads.map(({ text }) => / limit \$\d+/.test(text))).toEqual([true, false])
})
