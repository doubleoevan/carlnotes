// store tests for the object content key helper
import { expect, test } from "bun:test"
import { toResourceContentKey } from "./store"

// the resource content key is stable and namespaced by resource id, mirroring the attachment key layout
test("resourceContentKey namespaces content under the resource id", () => {
	expect(toResourceContentKey("abc123")).toBe("resources/abc123/content.md")
	expect(toResourceContentKey("abc123")).toBe(toResourceContentKey("abc123"))
})
