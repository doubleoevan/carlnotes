// the raised shadow's utility writes both shadows in order. the card glow mixes the live primary color on the web, and
// the mobile glow holds the same mixes resolved to hex
import { expect, test } from "bun:test"
import { toCardGlowPropertyLine, toRaisedShadowUtilityCss } from "./elevation"

test("the raised shadow's utility writes both shadows", () => {
	expect(toRaisedShadowUtilityCss()).toContain(
		"box-shadow: 0px 2px 5px 0px rgba(0, 0, 0, 0.2), 0px 8px 15px -6px rgba(0, 0, 0, 0.34);",
	)
})

test("the web's light card glow mixes the live primary color", () => {
	expect(toCardGlowPropertyLine({ mode: "light", isResolved: false })).toBe(
		"--card-glow-shadow: 0px 0px 0px 1px color-mix(in oklab, var(--primary) 35%, transparent), 0px 0px 36px 6px color-mix(in oklab, var(--primary) 88%, black);",
	)
})

test("the mobile light card glow resolves each mix to hex", () => {
	expect(toCardGlowPropertyLine({ mode: "light", isResolved: true })).toBe(
		"--card-glow-shadow: 0px 0px 0px 1px #d9974a59, 0px 0px 36px 6px #b77f3d;",
	)
})
