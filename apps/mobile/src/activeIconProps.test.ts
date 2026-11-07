import { describe, expect, test } from "bun:test"
import { toActiveIconProps } from "./activeIconProps"

describe("toActiveIconProps", () => {
	test("an active icon fills with the primary color in place of its resting color", () => {
		expect(toActiveIconProps(true, "size-4 text-muted-foreground")).toEqual({
			className: "size-4 text-primary",
			fill: "currentColor",
		})
	})

	test("an inactive icon keeps its outline and its resting color", () => {
		expect(toActiveIconProps(false, "size-4 text-muted-foreground")).toEqual({
			className: "size-4 text-muted-foreground",
			fill: "none",
		})
	})
})
