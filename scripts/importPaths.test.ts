// the import resolver over fixture paths: the relative, alias, and package forms, the imports that name their own
// extension, a bundler query, an installed package, and a repo path that names no file
import { expect, test } from "bun:test"
import { toImportResolution } from "./importPaths"

// the repo files the fixtures resolve against
const KNOWN_FILE_PATHS = new Set([
	"apps/web/src/pages/NotesPage.tsx",
	"apps/web/src/globals.css",
	"apps/web/src/components/branding/carl.png",
	"apps/web/src/components/common/index.tsx",
	"apps/mobile/src/components/common/Sheet.tsx",
	"packages/core/components/index.ts",
	"packages/nightshift/tokens.css",
	"packages/contracts/fixtures.json",
])

// the fixture file an import from a file leads to, or null for a package or a path with no file
function resolveFrom(importPath: string, fromFilePath: string): string | null {
	const importResolution = toImportResolution({ importPath, fromFilePath, knownFilePaths: KNOWN_FILE_PATHS })
	return importResolution.kind === "file" ? importResolution.filePath : null
}

// a relative path, an app alias, and a workspace package path resolve to the known files
test("imports resolve through the relative, alias, and package forms", () => {
	expect(resolveFrom("../pages/NotesPage", "apps/web/src/routes/index.tsx")).toBe("apps/web/src/pages/NotesPage.tsx")
	expect(resolveFrom("@/components/common/Sheet", "apps/mobile/app/index.tsx")).toBe(
		"apps/mobile/src/components/common/Sheet.tsx",
	)
	expect(resolveFrom("@carlnotes/core/components", "apps/web/src/pages/NotesPage.tsx")).toBe(
		"packages/core/components/index.ts",
	)
	expect(resolveFrom("@/components/common", "apps/web/src/pages/NotesPage.tsx")).toBe(
		"apps/web/src/components/common/index.tsx",
	)
})

// a stylesheet, an image, and a JSON file name their own extension, and a bundler query is read past
test("an import that names its own extension resolves as written, past a bundler query", () => {
	expect(resolveFrom("./globals.css", "apps/web/src/router.tsx")).toBe("apps/web/src/globals.css")
	expect(resolveFrom("@carlnotes/nightshift/tokens.css", "apps/web/src/globals.css")).toBe(
		"packages/nightshift/tokens.css",
	)
	expect(resolveFrom("./carl.png?url", "apps/web/src/components/branding/CarlPortrait.tsx")).toBe(
		"apps/web/src/components/branding/carl.png",
	)
	expect(resolveFrom("@carlnotes/contracts/fixtures.json", "apps/web/src/pages/NotesPage.tsx")).toBe(
		"packages/contracts/fixtures.json",
	)
})

// an installed package resolves to no file, and a repo path with no file is told apart from it
test("an installed package and a repo path with no file are told apart", () => {
	expect(
		toImportResolution({
			importPath: "react",
			fromFilePath: "apps/web/src/pages/NotesPage.tsx",
			knownFilePaths: KNOWN_FILE_PATHS,
		}),
	).toEqual({ kind: "package" })
	expect(
		toImportResolution({
			importPath: "@/components/common/Missing",
			fromFilePath: "apps/web/src/pages/NotesPage.tsx",
			knownFilePaths: KNOWN_FILE_PATHS,
		}),
	).toEqual({ kind: "unresolved" })
	expect(resolveFrom("@/components/common/Missing", "apps/web/src/pages/NotesPage.tsx")).toBeNull()
})
