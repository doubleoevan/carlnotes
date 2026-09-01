// the range arithmetic a shared video streams by: every edge a player's Range header can ask for
import { expect, test } from "bun:test"
import { toVideoRange } from "./videoRange"

// a player may write the bytes unit in any case
test("the bytes unit matches case-insensitively", () => {
	expect(toVideoRange("Bytes=0-99", 1000)).toEqual({ kind: "slice", start: 0, end: 99, byteSize: 1000 })
})

// no header means a plain progressive stream of the whole file
test("no range header streams the whole file", () => {
	expect(toVideoRange(undefined, 2451)).toEqual({ kind: "whole" })
})

// a row stored without a size cannot answer a range, so the whole file streams
test("a missing stored size streams the whole file", () => {
	expect(toVideoRange("bytes=0-99", null)).toEqual({ kind: "whole" })
	expect(toVideoRange("bytes=0-99", 0)).toEqual({ kind: "whole" })
})

// the single bounded form serves exactly the asked-for slice
test("a bounded range slices as asked", () => {
	expect(toVideoRange("bytes=0-99", 2451)).toEqual({ kind: "slice", start: 0, end: 99, byteSize: 2451 })
})

// an open end reads to the file's last byte
test("an open-ended range reads to the last byte", () => {
	expect(toVideoRange("bytes=100-", 500)).toEqual({ kind: "slice", start: 100, end: 499, byteSize: 500 })
})

// an end past the file clamps instead of failing, which is what players probing ahead expect
test("an end past the file clamps to the last byte", () => {
	expect(toVideoRange("bytes=0-9999", 500)).toEqual({ kind: "slice", start: 0, end: 499, byteSize: 500 })
})

// a start at or past the end has no bytes to serve, so the 416 names the size for the re-ask
test("a start past the file is unsatisfiable", () => {
	expect(toVideoRange("bytes=500-", 500)).toEqual({ kind: "unsatisfiable", byteSize: 500 })
	expect(toVideoRange("bytes=300-200", 500)).toEqual({ kind: "unsatisfiable", byteSize: 500 })
})

// forms this doesn't serve fall back to the whole file instead of guessing at them
test("malformed and multi-range headers stream the whole file", () => {
	expect(toVideoRange("bytes=abc", 500)).toEqual({ kind: "whole" })
	expect(toVideoRange("bytes=0-1,5-9", 500)).toEqual({ kind: "whole" })
	expect(toVideoRange("bytes=-100", 500)).toEqual({ kind: "whole" })
})
