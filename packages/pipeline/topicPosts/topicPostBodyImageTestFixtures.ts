// body image test fixtures: a png small enough to inline, and a png whose header declares more pixels than it holds

// a one pixel png
export const ONE_PIXEL_PNG_BYTES = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
	(character) => character.charCodeAt(0),
)

// one png chunk: its length, its type, its data, and the crc over the type and data
function toPngChunk(type: string, data: Uint8Array): Uint8Array {
	// the length, the type, and the data in order
	const chunk = new Uint8Array(12 + data.length)
	const view = new DataView(chunk.buffer)
	view.setUint32(0, data.length)
	chunk.set(new TextEncoder().encode(type), 4)
	chunk.set(data, 8)

	// the crc closes the chunk
	view.setUint32(8 + data.length, Bun.hash.crc32(chunk.subarray(4, 8 + data.length)))
	return chunk
}

/**
 * Returns a tiny png whose header declares a huge size, as a decompression bomb would.
 */
export function toBombPng(side: number): Uint8Array {
	// the header: width, height, 8 bits, truecolor, and the default compression, filter, and interlace
	const header = new Uint8Array(13)
	const headerView = new DataView(header.buffer)
	headerView.setUint32(0, side)
	headerView.setUint32(4, side)
	header.set([8, 2, 0, 0, 0], 8)

	// the signature, the header, one empty data chunk, and the end
	const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	const chunks = [
		signature,
		toPngChunk("IHDR", header),
		toPngChunk("IDAT", new Uint8Array()),
		toPngChunk("IEND", new Uint8Array()),
	]
	return new Uint8Array(chunks.flatMap((chunk) => [...chunk]))
}
