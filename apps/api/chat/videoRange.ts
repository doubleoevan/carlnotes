// the byte-range arithmetic used to stream a shared video

// one parsed range against a stored file's byteSize: the whole file, one byte slice of it, or an unsatisfiable request
export type VideoRange =
	| { kind: "whole" }
	| { kind: "slice"; start: number; end: number; byteSize: number }
	| { kind: "unsatisfiable"; byteSize: number }

/**
 * Parse ah http request's Range header against the stored byteSize. Only the single-range bytes form is honored.
 * A missing header, a form this doesn't serve, or a missing byteSize all stream the whole file,
 * and a start past the end is unsatisfiable so the player can re-ask with the byteSize the 416 names.
 */
export function toVideoRange(rangeHeader: string | undefined, byteSize: number | null): VideoRange {
	// without a range, or without the stored byteSize a range needs, the whole file streams
	const range = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/i)
	if (!range || !byteSize) {
		return { kind: "whole" }
	}

	// an open end reads to the last byte, and an end past the file clamps to it
	const start = Number(range[1])
	const end = range[2] ? Math.min(Number(range[2]), byteSize - 1) : byteSize - 1
	if (start >= byteSize || start > end) {
		return { kind: "unsatisfiable", byteSize }
	}
	return { kind: "slice", start, end, byteSize }
}
