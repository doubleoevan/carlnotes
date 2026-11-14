// the scan dispatch limit setting: how many Scans one sweep may hand to Temporal
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "./savedEnvSettings"
import { scanDispatchLimit } from "./scanSettings"

// the setting, put back after each test
const restoreEnvSettings = saveEnvSettings(["SCAN_DISPATCH_LIMIT"])
afterEach(restoreEnvSettings)

// unset, empty, and an unreadable value read as 100 Scans, a whole number is used, and zero reads as none
test("the scan dispatch limit defaults to 100, reads a whole number, and reads zero as none", () => {
	// unset and empty read as the default
	delete Bun.env.SCAN_DISPATCH_LIMIT
	expect(scanDispatchLimit()).toBe(100)
	Bun.env.SCAN_DISPATCH_LIMIT = ""
	expect(scanDispatchLimit()).toBe(100)

	// zero and a whole number are used as they are
	Bun.env.SCAN_DISPATCH_LIMIT = "0"
	expect(scanDispatchLimit()).toBe(0)
	Bun.env.SCAN_DISPATCH_LIMIT = "40"
	expect(scanDispatchLimit()).toBe(40)

	// a negative number and a word read as the default
	Bun.env.SCAN_DISPATCH_LIMIT = "-1"
	expect(scanDispatchLimit()).toBe(100)
	Bun.env.SCAN_DISPATCH_LIMIT = "lots"
	expect(scanDispatchLimit()).toBe(100)
})
