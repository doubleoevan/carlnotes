// the per-request memo: two requests running at once each keep a memo of their own, and a request that only reads reads
// each row once by its id
import { expect, test } from "bun:test"
import { memoizeInRequest, memoizeRowsById, runWithRequestMemo, runWithRowMemo } from "./requestMemo"

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

// a read of rows by id that records the ids each call read, and finds a row for every id but "missing"
function createRowRead(): { readMissing: (ids: string[]) => Promise<Map<string, string>>; readIds: string[][] } {
	const readIds: string[][] = []
	return {
		readMissing: async (ids) => {
			readIds.push(ids)
			return new Map(ids.filter((id) => id !== "missing").map((id) => [id, `row ${id}`]))
		},
		readIds,
	}
}

test("a request that only reads reads each row once, and a later stage reads only the ids no stage read", async () => {
	const rowRead = createRowRead()
	const rowsById = await runWithRowMemo(async () => {
		await memoizeRowsById("films", ["a", "b"], rowRead.readMissing)
		return memoizeRowsById("films", ["b", "c", "missing"], rowRead.readMissing)
	})

	// the second stage read c and the missing id alone, and leaves the missing id out
	expect(rowRead.readIds).toEqual([
		["a", "b"],
		["c", "missing"],
	])
	expect([...rowsById]).toEqual([
		["b", "row b"],
		["c", "row c"],
	])
})

test("outside a row memo, every call reads every id", async () => {
	const rowRead = createRowRead()
	await memoizeRowsById("films", ["a"], rowRead.readMissing)
	await memoizeRowsById("films", ["a"], rowRead.readMissing)
	expect(rowRead.readIds).toEqual([["a"], ["a"]])
})
