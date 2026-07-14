// test deps
import { expect, test } from "bun:test"
import { cn } from "./utils"

// Later tailwind classes win over earlier conflicting ones (twMerge behavior).
test("cn merges conflicting tailwind classes", () => {
	expect(cn("p-2", "p-4")).toBe("p-4")
})

// Falsy conditional values are dropped, truthy ones kept (clsx behavior).
test("cn handles conditional class values", () => {
	expect(cn("base", false && "hidden", true && "block")).toBe("base block")
})
