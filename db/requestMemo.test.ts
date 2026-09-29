// the per-request memo: two requests running at once each keep a memo of their own
import { expect, test } from "bun:test"
import { memoizeInRequest, runWithRequestMemo } from "./requestMemo"

// a read that counts its calls and returns the call's number
function createCountingRead(): { read: () => Promise<number>; readCount: () => number } {
	let readCount = 0
	return {
		read: async () => {
			readCount += 1
			return readCount
		},
		readCount: () => readCount,
	}
}

// two requests running at once each read for themselves
test("two requests keep their own memos", async () => {
	const countingRead = createCountingRead()
	const readValues = await Promise.all(
		[1, 2].map(() => runWithRequestMemo(() => memoizeInRequest("user-access:user-1", countingRead.read))),
	)

	expect(readValues.toSorted()).toEqual([1, 2])
	expect(countingRead.readCount()).toBe(2)
})
