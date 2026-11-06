import { expect, test } from "bun:test"
import { MCP_VIEWS } from "@carlnotes/contracts/mcpViews"
import { toFrozenManifestText, toFrozenMcpViews, toRaisedVersionSource } from "./mcpViewFreeze"

test("the manifest gains the frozen version after the stored ones", () => {
	const storedVersion = { version: 9, mcpViews: MCP_VIEWS.slice(0, 2) }
	const frozenVersion = { version: 10, mcpViews: [...MCP_VIEWS] }
	const manifestText = toFrozenManifestText([storedVersion], frozenVersion)
	expect(JSON.parse(manifestText)).toEqual([storedVersion, frozenVersion])
	expect(manifestText.endsWith("]\n")).toBe(true)
})

test("the current version rises past the frozen one, and a module that moved on stops the freeze", () => {
	const mcpViewsSource = "// the version\nexport const MCP_VIEW_VERSION = 9\n\nexport const MCP_VIEW_META_KEY = 1\n"
	expect(toRaisedVersionSource(mcpViewsSource, 9)).toContain("export const MCP_VIEW_VERSION = 10\n")
	expect(() => toRaisedVersionSource(mcpViewsSource, 8)).toThrow("does not name version 8")
})

test("a frozen bundle holds the named MCP views, or every current one", () => {
	expect(toFrozenMcpViews(undefined)).toEqual([...MCP_VIEWS])
	expect(toFrozenMcpViews("search,findings")).toEqual(["search", "findings"])
	expect(() => toFrozenMcpViews("search,brew")).toThrow("brew is not an MCP view")
})
