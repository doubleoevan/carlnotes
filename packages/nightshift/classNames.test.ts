// the class merge resolves Tailwind conflicts, knows the shadow-raised utility, and drops falsy values
import { expect, test } from "bun:test"
import { cn } from "./classNames"

// twMerge makes later Tailwind classes win over earlier conflicting ones
test("cn merges conflicting Tailwind classes", () => {
	expect(cn("p-2", "p-4")).toBe("p-4")
})

// the shadow-raised utility merges as a shadow, so a later shadow-none replaces it
test("cn lets shadow-none replace the shadow-raised utility", () => {
	expect(cn("rounded-lg shadow-raised", "bg-sunken shadow-none")).toBe("rounded-lg bg-sunken shadow-none")
	expect(cn("shadow-none", "shadow-raised")).toBe("shadow-raised")
})

// clsx drops falsy conditional values and keeps truthy ones
test("cn handles conditional class values", () => {
	expect(cn("base", false && "hidden", true && "block")).toBe("base block")
})
