import { describe, expect, test } from "bun:test"
import { toTableColumnWidths } from "./tableColumns"

describe("table column sizing", () => {
	const columns = { name: 192, visibility: 112, updated: 112 }
	test("keeps space for scrolling beside a fixed first column at large text sizes", () => {
		const widths = toTableColumnWidths({ columns, viewportWidth: 320, fontScale: 2 })
		expect(widths).toEqual({ name: 153.6, visibility: 224, updated: 224 })
	})
	test("fills a wide table and leaves no overflow", () => {
		const widths = toTableColumnWidths({ columns, viewportWidth: 768, fontScale: 1 })
		expect(Object.values(widths).reduce((total, width) => total + width, 0)).toBe(768)
		expect(widths.visibility).toBe(112)
	})
})
