// theme preference tests: a saved palette is restored, and anything else follows the device
import { expect, test } from "bun:test"
import { toThemePreference } from "./themePreference"

// the two palettes come back as saved, and nothing stored or an unknown value means the system's appearance
test("a stored palette is restored and anything else follows the device", () => {
	expect(toThemePreference("light")).toBe("light")
	expect(toThemePreference("dark")).toBe("dark")
	expect(toThemePreference(null)).toBe("system")
	expect(toThemePreference("sepia")).toBe("system")
})
