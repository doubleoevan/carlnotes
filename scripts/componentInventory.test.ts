// the component inventory rules over fixture files: a pair that renders its same-name core component, one that
// adapts it, a listed pair, each kind of unshared pair, a primitive with and without a contract, and each kind of failing row
import { expect, test } from "bun:test"
import { checkComponentInventory } from "./componentInventory"
import type { InventoryRow } from "./parityInventory"
import type { SourceFile } from "./workspaces"

// a component file in an app's common folder or its primitives folder
function toAppFile(appFolder: string, fileName: string, fileText = ""): SourceFile {
	const folder = fileName === fileName.toLowerCase() ? "primitives" : "common"
	return { filePath: `${appFolder}/src/components/${folder}/${fileName}.tsx`, fileText }
}

// the same component file in both apps, each with its own text
function toPairFiles(fileName: string, webText = "", mobileText = webText): SourceFile[] {
	return [toAppFile("apps/web", fileName, webText), toAppFile("apps/mobile", fileName, mobileText)]
}

// the core modules the pairs import
const CORE_FILES: SourceFile[] = ["Shared", "Adapted", "OneSide", "TypeOnly"].map((name) => ({
	filePath: `packages/core/components/${name}.tsx`,
	fileText: `export function ${name}() {}\nexport type ${name}Elements = {}\nexport type ${name}Props = {}\n`,
}))

// a pair that renders its same-name core component, one whose web side adapts it, a listed pair, and both primitives
const SHARED_PAIR = toPairFiles("Shared", 'import { Shared as SharedCore } from "@carlnotes/core/components/Shared"\n')
const ADAPTED_PAIR = toPairFiles(
	"Adapted",
	'import type { AdaptedElements } from "@carlnotes/core/components/Adapted"\n',
	'import { Adapted } from "@carlnotes/core/components/Adapted"\n',
)
const LISTED_PAIR = toPairFiles("Listed")
const PRIMITIVE_FILES = [...toPairFiles("button"), ...toPairFiles("select")]
const STORY_FILE: SourceFile = { filePath: "apps/web/src/components/common/Probe.stories.tsx", fileText: "" }
const PASSING_FILES = [...CORE_FILES, ...SHARED_PAIR, ...ADAPTED_PAIR, ...LISTED_PAIR, ...PRIMITIVE_FILES, STORY_FILE]

// the rows the passing fixture needs
const LISTED_ROW: InventoryRow = { name: "Listed", status: "not yet shared", reason: "each app builds its own" }
const SELECT_ROW: InventoryRow = { name: "select", status: "platform difference", reason: "a Radix menu and a sheet" }

// shared and listed pairs, a contracted primitive, and a listed one pass, with each counted
test("shared, adapted, and listed pairs pass and are counted", () => {
	const { violations, counts } = checkComponentInventory({
		sourceFiles: PASSING_FILES,
		contractNames: ["button"],
		inventoryRows: [LISTED_ROW, SELECT_ROW],
	})
	expect(violations).toEqual([])
	expect(counts).toEqual({
		pairCount: 3,
		sharedCount: 2,
		listedCountByKind: { "platform API": 0, "platform difference": 0, "not yet shared": 1 },
		listedPrimitiveCount: 1,
	})
})

// a pair that shares nothing, one shared on one side, one that shares another core component, one that imports only a
// prop type, plain on the web and renamed to an adapter name on mobile, and a primitive without a contract each fail
// unless listed
test("each unshared pair and an uncontracted primitive fail unless listed", () => {
	const sourceFiles = [
		...PASSING_FILES,
		...toPairFiles("Probe"),
		...toPairFiles("OneSide", 'import { OneSide } from "@carlnotes/core/components/OneSide"\n', ""),
		...toPairFiles("PartShared", 'import { Shared } from "@carlnotes/core/components/Shared"\n'),
		...toPairFiles(
			"TypeOnly",
			'import type { TypeOnlyProps } from "@carlnotes/core/components/TypeOnly"\n',
			'import type { TypeOnlyProps as TypeOnlyElements } from "@carlnotes/core/components/TypeOnly"\n',
		),
	]
	const { violations } = checkComponentInventory({
		sourceFiles,
		contractNames: ["button"],
		inventoryRows: [LISTED_ROW],
	})
	expect(violations).toHaveLength(5)
	expect(violations[0]).toContain(
		"OneSide is built separately: apps/web/src/components/common/OneSide.tsx and apps/mobile/src/components/common/OneSide.tsx do not both import packages/core/components/OneSide.tsx",
	)
	expect(violations[1]).toStartWith("PartShared is built separately")
	expect(violations[2]).toStartWith("Probe is built separately")
	expect(violations[2]).toContain('apps/mobile/parity.md under "## Separately built components"')
	expect(violations[3]).toStartWith("TypeOnly is built separately")
	expect(violations[4]).toContain("select is a primitive in both apps")
	expect(violations[4]).toContain("packages/nightshift/components/select.ts")
})

// a row with a blank reason, an unknown kind, a duplicate, and rows for a shared pair, a contracted primitive, and a name
// one app lacks each fail
test("a stale, duplicated, or incomplete row fails", () => {
	const sourceFiles = [...PASSING_FILES, toAppFile("apps/web", "Gone")]
	const inventoryRows: InventoryRow[] = [
		{ ...LISTED_ROW, reason: "  " },
		{ ...SELECT_ROW, status: "later" },
		LISTED_ROW,
		{ name: "Shared", status: "not yet shared", reason: "shared since" },
		{ name: "button", status: "platform difference", reason: "contracted since" },
		{ name: "Gone", status: "not yet shared", reason: "deleted from mobile" },
	]
	const { violations } = checkComponentInventory({ sourceFiles, contractNames: ["button"], inventoryRows })
	expect(violations).toEqual([
		"apps/mobile/parity.md lists Listed with no reason",
		'apps/mobile/parity.md lists select with the kind "later". use platform API, platform difference, not yet shared',
		"apps/mobile/parity.md lists Listed more than once",
		"apps/mobile/parity.md lists Shared, which both apps now share through packages/core/components/Shared.tsx. retire the row",
		"apps/mobile/parity.md lists button, which now has a Nightshift contract. retire the row",
		"apps/mobile/parity.md lists Gone, which apps/mobile no longer defines. retire the row",
	])
})
