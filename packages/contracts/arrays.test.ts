// the array helpers: chunks keep their order, and the last chunk holds the rest
import { expect, test } from "bun:test"
import { toChunks } from "./arrays"

test("items split into chunks of the size in order, the last holding the rest, and no items into none", () => {
	expect(toChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
	expect(toChunks([1, 2], 2)).toEqual([[1, 2]])
	expect(toChunks([], 2)).toEqual([])
})
