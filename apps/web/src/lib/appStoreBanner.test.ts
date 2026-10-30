import { expect, test } from "bun:test"
import { toAppStoreBannerMeta } from "./appStoreBanner"

test("the banner names the record and the page once the id is set, and nothing before", () => {
	expect(toAppStoreBannerMeta("/topics/t1", "123456")).toEqual([
		{ name: "apple-itunes-app", content: "app-id=123456, app-argument=https://carlnotes.com/topics/t1" },
	])
	expect(toAppStoreBannerMeta("/topics/t1", null)).toEqual([])
})

test("a comma or semicolon in the path cannot add a banner field", () => {
	expect(toAppStoreBannerMeta("/topics/t1/x,affiliate-data=1;y", "123456")[0]?.content).toBe(
		"app-id=123456, app-argument=https://carlnotes.com/topics/t1/x%2Caffiliate-data=1%3By",
	)
})
