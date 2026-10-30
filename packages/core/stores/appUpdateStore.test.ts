import { afterEach, expect, test } from "bun:test"
import { clearAppUpdateRequirement, markAppVersionOutdated, readAppUpdateRequirement } from "./appUpdateStore"

// every test starts with the build served
afterEach(() => {
	clearAppUpdateRequirement()
})

test("a 426 with a body opens the notice with its minimum, and a repeat changes nothing", () => {
	markAppVersionOutdated({ rejection: "appVersionOutdated", minimumVersion: "1.2.0", storeUrl: "x" })
	markAppVersionOutdated({ rejection: "appVersionOutdated", minimumVersion: "1.3.0", storeUrl: "x" })
	expect(readAppUpdateRequirement()).toEqual({ minimumVersion: "1.2.0" })
})

test("a 426 without a body opens the notice, and a later body fills in the minimum", () => {
	markAppVersionOutdated(null)
	expect(readAppUpdateRequirement()).toEqual({ minimumVersion: null })
	markAppVersionOutdated({ rejection: "appVersionOutdated", minimumVersion: "1.2.0", storeUrl: "x" })
	expect(readAppUpdateRequirement()).toEqual({ minimumVersion: "1.2.0" })
})

test("check again clears the notice", () => {
	markAppVersionOutdated(null)
	clearAppUpdateRequirement()
	expect(readAppUpdateRequirement()).toBeNull()
})
