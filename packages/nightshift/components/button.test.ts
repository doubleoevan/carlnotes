// each Button size's height in rem is the height its box classes draw
import { expect, test } from "bun:test"
import { buttonBoxVariants, buttonHeightsRem, buttonSizeNames } from "./button"

// a size's box classes draw its height as h-* or size-*, in quarter-rem steps
test("each Button size's height matches the height its box classes draw", () => {
	for (const sizeName of buttonSizeNames) {
		const heightStep = buttonHeightsRem[sizeName] * 4
		const boxClasses = buttonBoxVariants({ size: sizeName }).split(" ")
		const isHeightDrawn = boxClasses.includes(`h-${heightStep}`) || boxClasses.includes(`size-${heightStep}`)
		expect(isHeightDrawn, sizeName).toBe(true)
	}
})
