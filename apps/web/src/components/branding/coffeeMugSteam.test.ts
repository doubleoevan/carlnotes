// the web's steam keyframes move the way Nightshift's steam motion says
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MD_BREAKPOINT_REM } from "@carlnotes/nightshift/breakpoints"
import { coffeeMugSteamMotion } from "@carlnotes/nightshift/coffeeMug"

// the stylesheet that holds the steam keyframes, the steam class, and the phone and reduced-motion rules
const ANIMATIONS_CSS = readFileSync(join(import.meta.dir, "../../animations.css"), "utf8")

// the keyframes start, peak, and end at the motion's offsets, opacity, and widening
test("the steam keyframes rise, widen, and fade by Nightshift's steam motion", () => {
	const { startOffsetY, endOffsetY, endWidthScale, peakFraction, peakOpacity } = coffeeMugSteamMotion
	expect(ANIMATIONS_CSS).toContain(`transform: translateY(${startOffsetY}px) scaleX(1);`)
	expect(ANIMATIONS_CSS).toContain(`${peakFraction * 100}% {\n\t\topacity: ${peakOpacity};`)
	expect(ANIMATIONS_CSS).toContain(`transform: translateY(${endOffsetY}px) scaleX(${endWidthScale});`)
})

// the steam class runs once a period, and holds still at the resting opacity on a phone and under reduced motion
test("each wisp rises once a period, and holds still on a phone and under reduced motion", () => {
	const { periodMs, restingOpacity } = coffeeMugSteamMotion
	const stillSteamRule = `.coffee-mug-steam {\n\t\tanimation: none;\n\t\topacity: ${restingOpacity};`
	expect(ANIMATIONS_CSS).toContain(`animation: coffee-mug-steam ${periodMs / 1000}s ease-in-out infinite;`)

	// the phone rule holds the steam still below the md breakpoint, and the reduced-motion rule holds it still anywhere
	const phoneRuleStart = ANIMATIONS_CSS.indexOf(`@media (width < ${MD_BREAKPOINT_REM}rem) {`)
	const phoneRuleEnd = ANIMATIONS_CSS.indexOf("@media", phoneRuleStart + 1)
	const reducedMotionRuleStart = ANIMATIONS_CSS.indexOf("@media (prefers-reduced-motion: reduce) {")
	const phoneStillSteamStart = ANIMATIONS_CSS.indexOf(stillSteamRule, phoneRuleStart)

	// each rule holds the still steam inside its own block
	expect(phoneRuleStart).toBeGreaterThan(-1)
	expect(phoneStillSteamStart).toBeGreaterThan(phoneRuleStart)
	expect(phoneStillSteamStart).toBeLessThan(phoneRuleEnd)
	expect(ANIMATIONS_CSS.indexOf(stillSteamRule, reducedMotionRuleStart)).toBeGreaterThan(reducedMotionRuleStart)
})
