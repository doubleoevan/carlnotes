// environment setting tests: a whole number above zero and a number of dollars
import { afterEach, describe, expect, test } from "bun:test"
import { readDollarSetting, toPositiveInteger } from "./envSettings"
import { saveEnvSettings } from "./savedEnvSettings"

// unset and empty keep the default, a whole number is used as is, and a word, zero, a negative, or a fraction keeps the default
test("an unset, a valid, and an unreadable value give the default or the value", () => {
	const expectedValues: [string | undefined, number][] = [
		[undefined, 40],
		["", 40],
		["12", 12],
		["forty", 40],
		["0", 40],
		["-5", 40],
		["2.5", 40],
	]
	for (const [value, expectedValue] of expectedValues) {
		expect(toPositiveInteger(value, 40)).toBe(expectedValue)
	}
})

describe("a setting in dollars", () => {
	// a spare setting name, put back after each case
	const settingName = "ENV_SETTINGS_TEST_DOLLARS"
	const restoreEnvSettings = saveEnvSettings([settingName])
	afterEach(restoreEnvSettings)

	test("reads the default when unset, and the configured number when set", () => {
		// unset, then set to twelve and a half dollars
		delete Bun.env[settingName]
		expect(readDollarSetting(settingName, 0.5)).toBe(0.5)
		Bun.env[settingName] = "12.5"
		expect(readDollarSetting(settingName, 0.5)).toBe(12.5)
	})

	test("throws on a value that is not a number of dollars, zero or more", () => {
		// a negative amount and a word
		Bun.env[settingName] = "-1"
		expect(() => readDollarSetting(settingName, 0.5)).toThrow(`${settingName} must be a number of dollars`)
		Bun.env[settingName] = "lots"
		expect(() => readDollarSetting(settingName, 0.5)).toThrow(`${settingName} must be a number of dollars`)
	})
})
