// tests for a card element drawn in a child process: the png comes back, and a draw that fails or runs long rejects
import { expect, test } from "bun:test"
import { toCardElementPngInChildProcess } from "./cardElementPngProcess"

// a small element in the app's body font
const CARD_ELEMENT = {
	type: "div",
	props: { style: { display: "flex", fontFamily: "Karla", fontSize: 40 }, children: "A card" },
}

test("an element drawn in a child process comes back as a png of its size", async () => {
	const png = await toCardElementPngInChildProcess({ cardElement: CARD_ELEMENT, width: 300, height: 200 })

	// a png starts with its signature, and its header holds the width and the height
	expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	const header = new DataView(png.buffer, png.byteOffset)
	expect([header.getUint32(16), header.getUint32(20)]).toEqual([300, 200])
}, 30_000)

test("a draw that fails in the child process rejects with its reason", async () => {
	// an image at no size is one that resvg cannot rasterize
	const draw = toCardElementPngInChildProcess({ cardElement: CARD_ELEMENT, width: 0, height: 0 })
	await expect(draw).rejects.toThrow("the card element could not be drawn")
}, 30_000)

test("a draw past its time limit is stopped and rejects", async () => {
	const draw = toCardElementPngInChildProcess({ cardElement: CARD_ELEMENT, width: 300, height: 200 }, 1)
	await expect(draw).rejects.toThrow("was not drawn within 1 ms")
}, 30_000)
