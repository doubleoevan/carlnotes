// the preview's in-memory Storage saves, reads, lists, and removes items the way the browser's own does
import { expect, test } from "bun:test"
import { toMemoryStorage } from "./memoryStorage"

test("toMemoryStorage saves, reads, lists, and removes items", () => {
	// two items saved, one read back as a string
	const memoryStorage = toMemoryStorage()
	memoryStorage.setItem("add-to-ai:last", "cursor")
	memoryStorage.setItem("theme", "dark")
	expect(memoryStorage.getItem("add-to-ai:last")).toBe("cursor")
	expect(memoryStorage.length).toBe(2)
	expect(memoryStorage.key(1)).toBe("theme")

	// a removed item reads as null, and clear empties the rest
	memoryStorage.removeItem("add-to-ai:last")
	expect(memoryStorage.getItem("add-to-ai:last")).toBeNull()
	memoryStorage.clear()
	expect(memoryStorage.length).toBe(0)
	expect(memoryStorage.key(0)).toBeNull()
})

test("each memory storage keeps its own items", () => {
	// an item saved in one storage is absent from another
	const firstStorage = toMemoryStorage()
	firstStorage.setItem("theme", "dark")
	expect(toMemoryStorage().getItem("theme")).toBeNull()
})
