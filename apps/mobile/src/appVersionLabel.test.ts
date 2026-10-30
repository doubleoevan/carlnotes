import { expect, test } from "bun:test"
import { toAppVersionLabel } from "./appVersionLabel"

test("a store build names its version and build", () => {
	expect(toAppVersionLabel({ appVersion: "1.2.0", nativeBuildVersion: "34", updateId: null })).toBe(
		"CarlNotes 1.2.0 (34)",
	)
})

test("a loaded update is named by the start of its id", () => {
	expect(toAppVersionLabel({ appVersion: "1.2.0", nativeBuildVersion: "34", updateId: "1a2b3c4d-5e6f-7a8b" })).toBe(
		"CarlNotes 1.2.0 (34) · update 1a2b3c4d",
	)
})

test("a build without a version reads as development", () => {
	expect(toAppVersionLabel({ appVersion: null, nativeBuildVersion: null, updateId: null })).toBe(
		"CarlNotes development",
	)
})
