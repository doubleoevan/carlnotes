// the contains pattern lowercases the query and matches each typed wildcard literally
import { expect, test } from "bun:test"
import { toContainsLikePattern } from "./likePattern"

test("a query becomes a lowercased contains pattern", () => {
	expect(toContainsLikePattern("Robot Vacuums")).toBe("%robot vacuums%")
})

test("a typed wildcard and the escape character are matched literally", () => {
	expect(toContainsLikePattern("100%_off\\now")).toBe("%100\\%\\_off\\\\now%")
})
