// the ui boundary check flags a value import of a server folder and lets a type-only import through
import { expect, test } from "bun:test"
import { toServerValueImports } from "./check-ui-boundary"

// a route file, three folders below the repo root, and a file one folder below ui/src
const ROUTE_FILE_PATH = "ui/src/routes/page.tsx"
const UI_FILE_PATH = "ui/src/page.tsx"

// a value import is flagged on the line it starts on, even if it spans several lines
test("toServerValueImports flags a multi-line value import", () => {
	const fileText = 'import { useState } from "react"\nimport {\n\tauth,\n\tsession,\n} from "../../../api/auth"\n'
	expect(toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText })).toEqual([
		{ lineNumber: 2, firstLine: "import {" },
	])
})

// an import type passes, and an inline type specifier still leaves a value import statement
test("toServerValueImports passes import type and flags an inline type specifier", () => {
	expect(
		toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText: 'import type { AppType } from "../../../api"\n' }),
	).toEqual([])
	expect(
		toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText: 'import { type AppType } from "../../../api"\n' }),
	).toEqual([{ lineNumber: 1, firstLine: 'import { type AppType } from "../../../api"' }])
})

// a value re-export and a side-effect import are flagged, and an export type passes
test("toServerValueImports flags a re-export and a side-effect import", () => {
	const fileText =
		'export { auth } from "../../api/auth"\nimport "../../db"\nexport type { AppType } from "../../api"\n'
	expect(toServerValueImports({ filePath: UI_FILE_PATH, fileText })).toEqual([
		{ lineNumber: 1, firstLine: 'export { auth } from "../../api/auth"' },
		{ lineNumber: 2, firstLine: 'import "../../db"' },
	])
})

// a path that stays inside the ui, even one named like a server folder, is not a server import
test("toServerValueImports ignores paths outside the server folders", () => {
	const fileText =
		'import { cn } from "../lib/utils"\nimport { toDbLabel } from "../dbLabels"\nimport { x } from "./api"\n'
	expect(toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText })).toEqual([])
})

// an import() of a server folder is flagged, since a loader could run it on the server
test("toServerValueImports flags a dynamic import", () => {
	expect(
		toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText: 'const { db } = await import("../../../db")\n' }),
	).toEqual([{ lineNumber: 1, firstLine: 'import("../../../db"' }])
})

// a path with redundant segments still resolves into the server folder it names
test("toServerValueImports flags a path with redundant segments", () => {
	const fileText = 'import { db } from "./../../../db"\nimport { auth } from "../../../ui/../api/auth"\n'
	expect(toServerValueImports({ filePath: ROUTE_FILE_PATH, fileText })).toEqual([
		{ lineNumber: 1, firstLine: 'import { db } from "./../../../db"' },
		{ lineNumber: 2, firstLine: 'import { auth } from "../../../ui/../api/auth"' },
	])
})
