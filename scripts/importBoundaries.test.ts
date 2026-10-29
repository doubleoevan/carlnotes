// the import rules flag an import that crosses a workspace boundary and let the rest through
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { posix } from "node:path"
import {
	isTypeOnlyImport,
	STORY_FILE_SUFFIX,
	toImportViolations,
	toParsedImports,
	WEB_COMPONENT_BROWSER_FOLDERS,
} from "./importBoundaries"
import type { Workspace } from "./workspaces"
import { FIXTURE_WORKSPACES, WEB_WORKSPACE } from "./workspaceTestFixtures"

// the check that returns one file's violations inside a workspace map
function toFileViolationsCheck(workspaces: Workspace[]): (filePath: string, fileText: string) => string[] {
	return (filePath, fileText) => toImportViolations({ workspaces, sourceFile: { filePath, fileText } })
}

// the violations of one file's text inside the whole map
const toFileViolations = toFileViolationsCheck(FIXTURE_WORKSPACES)

// an import is parsed with its path, the line it starts on, and its type-only flag, across statement shapes
test("toParsedImports reads static, multi-line, side-effect, dynamic, re-export, and require imports", () => {
	const fileText =
		'import { a } from "react"\nimport {\n\tb,\n\tc,\n} from "./local"\nimport "./sideEffect"\nconst d = await import("./dynamic")\nexport type { E } from "@carlnotes/contracts/chat"\nconst f = require("./required")\n'
	expect(toParsedImports(fileText)).toMatchObject([
		{ importPath: "react", lineNumber: 1, isTypeOnly: false },
		{ importPath: "./local", lineNumber: 2, isTypeOnly: false },
		{ importPath: "./sideEffect", lineNumber: 6, isTypeOnly: false },
		{ importPath: "./dynamic", lineNumber: 7, isTypeOnly: false },
		{ importPath: "@carlnotes/contracts/chat", lineNumber: 8, isTypeOnly: true },
		{ importPath: "./required", lineNumber: 9, isTypeOnly: false },
	])
})

// a statement is type-only with import type, export type, or every specifier marked type
test("isTypeOnlyImport accepts statement-level and all-specifier type imports and rejects a value import", () => {
	expect(isTypeOnlyImport('import type { AppType } from "@carlnotes/api"')).toBe(true)
	expect(isTypeOnlyImport('export type { AppType } from "@carlnotes/api"')).toBe(true)
	expect(isTypeOnlyImport('import { type AppType, type Auth } from "@carlnotes/api"')).toBe(true)
	expect(isTypeOnlyImport('import { type AppType, auth } from "@carlnotes/api"')).toBe(false)
	expect(isTypeOnlyImport('import auth, { type AppType } from "@carlnotes/api"')).toBe(false)
	expect(isTypeOnlyImport('import "@carlnotes/api"')).toBe(false)
})

// an app import fails everywhere, except the api as types only from the api client package and the web app
test("toImportViolations flags an app import and passes a type-only api import from the api client package", () => {
	expect(toFileViolations("apps/api/x.ts", 'import { scan } from "@carlnotes/worker/scan"\n')).toEqual([
		"apps/api: apps/api/x.ts:1 imports @carlnotes/worker/scan. an app is never imported",
	])
	expect(
		toFileViolations("packages/client/authClient.ts", 'import type { auth } from "@carlnotes/api/auth"\n'),
	).toEqual([])
	expect(toFileViolations("packages/client/authClient.ts", 'import { auth } from "@carlnotes/api/auth"\n')).toEqual([
		"packages/client: packages/client/authClient.ts:1 imports @carlnotes/api/auth. an app is never imported",
	])
	expect(toFileViolations("packages/db/x.ts", 'import type { AppType } from "@carlnotes/api"\n')).toEqual([
		"packages/db: packages/db/x.ts:1 imports @carlnotes/api. an app is never imported",
	])
})

// the mobile app imports @carlnotes packages only among the universal four. the api's types are no exception
test("toImportViolations flags a non-universal import from the mobile app and passes a universal one", () => {
	// a server package fails the mobile rule. the api's types fail the app rule
	expect(
		toFileViolations("apps/mobile/app/(tabs)/index.tsx", 'import { topics } from "@carlnotes/db/schema"\n'),
	).toEqual([
		"apps/mobile: apps/mobile/app/(tabs)/index.tsx:1 imports @carlnotes/db/schema. the mobile app imports only the universal packages",
	])
	expect(
		toFileViolations("apps/mobile/app/(tabs)/index.tsx", 'import type { AppType } from "@carlnotes/api"\n'),
	).toEqual(["apps/mobile: apps/mobile/app/(tabs)/index.tsx:1 imports @carlnotes/api. an app is never imported"])

	// a declared universal import passes
	expect(
		toFileViolations(
			"apps/mobile/app/(tabs)/index.tsx",
			'import { searchSite } from "@carlnotes/client/searchClient"\n',
		),
	).toEqual([])
})

// the web app imports Nightshift's stylesheet, class merge, coffee mug, sign-in providers' icons, and contracts
// anywhere, and its other modules only from a test, a story, or the component browser
test("toImportViolations flags a Nightshift module in a web app page and passes it in a test, a story, and Storybook", () => {
	// the web app with nightshift declared, so only the component browser rule can fail an import
	const webWithNightshift: Workspace = {
		...WEB_WORKSPACE,
		dependencies: [...WEB_WORKSPACE.dependencies, "@carlnotes/nightshift"],
	}
	const toWebViolations = toFileViolationsCheck([webWithNightshift])
	const colorsImport = 'import { latte } from "@carlnotes/nightshift/colors"\n'

	// a page fails, and every allowed importer passes
	expect(toWebViolations("apps/web/src/pages/HomePage.tsx", colorsImport)).toEqual([
		"apps/web: apps/web/src/pages/HomePage.tsx:1 imports @carlnotes/nightshift/colors. the web app imports this nightshift module only from a test, a story, or the component browser",
	])
	expect(toWebViolations("apps/web/src/hooks/useTheme.test.ts", colorsImport)).toEqual([])
	expect(toWebViolations("apps/web/src/components/primitives/button.stories.tsx", colorsImport)).toEqual([])
	expect(toWebViolations("apps/web/.storybook/manager.ts", colorsImport)).toEqual([])
	expect(toWebViolations("apps/web/src/nightshift/TokenSwatches.tsx", colorsImport)).toEqual([])

	// the two host portraits are shared host portrait imports
	for (const host of ["carl", "vienna"]) {
		expect(
			toWebViolations(
				"apps/web/src/components/branding/HostAvatar.tsx",
				`import portrait from "@carlnotes/nightshift/assets/${host}-avatar.png"\n`,
			),
		).toEqual([])
	}

	// the stylesheet, the class merge, the coffee mug, the sign-in providers' icons, and a component contract pass
	// anywhere
	expect(
		toWebViolations(
			"apps/web/src/components/primitives/button.tsx",
			'import { buttonBoxVariants } from "@carlnotes/nightshift/components/button"\n',
		),
	).toEqual([])
	expect(toWebViolations("apps/web/src/routes/__root.tsx", 'import "@carlnotes/nightshift/tokens.css"\n')).toEqual([])
	expect(
		toWebViolations(
			"apps/web/src/components/common/Pagination.tsx",
			'import { paginationClasses } from "@carlnotes/nightshift/pagination"\n',
		),
	).toEqual([])
	expect(
		toWebViolations("apps/web/src/pages/HomePage.tsx", 'import { cn } from "@carlnotes/nightshift/classNames"\n'),
	).toEqual([])
	expect(
		toWebViolations(
			"apps/web/src/components/branding/CoffeeMug.tsx",
			'import { COFFEE_MUG_CUP_PATH } from "@carlnotes/nightshift/coffeeMug"\n',
		),
	).toEqual([])
	expect(
		toWebViolations(
			"apps/web/src/components/session/OAuthProviderIcons.tsx",
			'import { googleIconPaths } from "@carlnotes/nightshift/oauthProviderIcons"\n',
		),
	).toEqual([])
})

// a story and Storybook stay inside the component browser, so neither reaches the app's own code
test("toImportViolations flags a story or Storybook in app code and passes them in a story and the component browser", () => {
	// a route that imports a story, and a page that imports Storybook, fail
	expect(
		toFileViolations(
			"apps/web/src/routes/index.tsx",
			'import { Default } from "../components/layout/Footer.stories"\n',
		),
	).toEqual([
		"apps/web: apps/web/src/routes/index.tsx:1 imports ../components/layout/Footer.stories. the web app imports a story or Storybook only from a story or the component browser",
	])
	expect(toFileViolations("apps/web/src/pages/HomePage.tsx", 'import { fn } from "storybook/test"\n')).toEqual([
		"apps/web: apps/web/src/pages/HomePage.tsx:1 imports storybook/test. the web app imports a story or Storybook only from a story or the component browser",
	])

	// a story and the component browser's config may import both
	expect(
		toFileViolations("apps/web/src/components/layout/Layout.stories.tsx", 'import { fn } from "storybook/test"\n'),
	).toEqual([])
	expect(
		toFileViolations(
			"apps/web/.storybook/preview.tsx",
			'import { withThemeByClassName } from "@storybook/addon-themes"\n',
		),
	).toEqual([])
})

// the mobile app keeps its stories, Storybook, and Storybook's config inside its component browser
test("toImportViolations flags Storybook in a mobile screen and passes it in a story, the config, and the route", () => {
	// a screen that imports Storybook or the config's stories index, and a module that imports a story, fail
	expect(
		toFileViolations("apps/mobile/app/(tabs)/settings.tsx", 'import { view } from "@storybook/react-native"\n'),
	).toEqual([
		"apps/mobile: apps/mobile/app/(tabs)/settings.tsx:1 imports @storybook/react-native. the mobile app imports a story or Storybook only from a story or the component browser",
	])
	expect(
		toFileViolations(
			"apps/mobile/app/(tabs)/index.tsx",
			'import { view } from "../../.rnstorybook/storybook.requires"\n',
		),
	).toHaveLength(1)
	expect(
		toFileViolations(
			"apps/mobile/src/authClient.ts",
			'import { Default } from "./components/primitives/button.stories"\n',
		),
	).toHaveLength(1)

	// a story, the config, and the route that shows it pass
	const storybookTypesImport = 'import type { Meta } from "@storybook/react-native"\n'
	expect(toFileViolations("apps/mobile/src/components/primitives/button.stories.tsx", storybookTypesImport)).toEqual([])
	expect(toFileViolations("apps/mobile/.rnstorybook/main.ts", storybookTypesImport)).toEqual([])
	expect(
		toFileViolations("apps/mobile/app/storybook.tsx", 'import { view } from "../.rnstorybook/storybook.requires"\n'),
	).toEqual([])
})

// a relative import resolves against the file and must stay inside the workspace folder
test("toImportViolations flags a relative import that leaves the workspace and passes one that stays", () => {
	expect(toFileViolations("apps/web/src/lib/x.ts", 'import { y } from "../../../../packages/core/lib/y"\n')).toEqual([
		"apps/web: apps/web/src/lib/x.ts:1 imports ../../../../packages/core/lib/y. a relative import stays inside its workspace",
	])
	expect(
		toFileViolations("apps/web/src/routes/a.tsx", 'import { P } from "../../src/pages/P"\nimport "./b"\n'),
	).toEqual([])
})

// a @carlnotes import is declared in the importing workspace's package.json
test("toImportViolations flags an undeclared @carlnotes import and passes a declared one", () => {
	expect(toFileViolations("apps/web/src/x.ts", 'import { db } from "@carlnotes/db"\n')).toEqual([
		"apps/web: apps/web/src/x.ts:1 imports @carlnotes/db. the package.json does not declare @carlnotes/db",
	])
	const fileText = 'import { apiClient } from "@carlnotes/client/apiClient"\nimport { useState } from "react"\n'
	expect(toFileViolations("apps/web/src/x.ts", fileText)).toEqual([])
})

// a universal package's source imports no bun or node module, bare or prefixed, and its tests may
test("toImportViolations flags a node import in universal source and passes it in a test and a server package", () => {
	expect(toFileViolations("packages/contracts/time.ts", 'import { randomUUID } from "node:crypto"\n')).toEqual([
		"packages/contracts: packages/contracts/time.ts:1 imports node:crypto. a universal package imports no bun or node module",
	])
	expect(toFileViolations("packages/client/x.ts", 'import { serve } from "bun"\n')).toEqual([
		"packages/client: packages/client/x.ts:1 imports bun. a universal package imports no bun or node module",
	])
	expect(toFileViolations("packages/contracts/x.ts", 'import { readFileSync } from "fs"\n')).toEqual([
		"packages/contracts: packages/contracts/x.ts:1 imports fs. a universal package imports no bun or node module",
	])
	expect(toFileViolations("packages/contracts/time.test.ts", 'import { test } from "bun:test"\n')).toEqual([])
	expect(
		toFileViolations("packages/contracts/timeTestFixtures.ts", 'import { readFileSync } from "node:fs"\n'),
	).toEqual([])
	expect(toFileViolations("packages/db/x.ts", 'import { readFileSync } from "node:fs"\n')).toEqual([])
})

// a file outside every workspace has no boundary to cross
test("toImportViolations ignores a file outside the workspaces", () => {
	expect(toFileViolations("scripts/x.ts", 'import { db } from "@carlnotes/db"\n')).toEqual([])
})

// globals.css keeps the component browser's files out of tailwind's scan, the same files the boundary rules name
test("globals.css and the boundary rules name the same component browser files", () => {
	// every source the stylesheet leaves out, resolved from the stylesheet's folder to a repo path
	const globalsCss = readFileSync("apps/web/src/globals.css", "utf8")
	const excludedPaths = [...globalsCss.matchAll(/@source not "([^"]+)"/g)].map((sourceMatch) =>
		posix.join("apps/web/src", sourceMatch[1] ?? ""),
	)

	// the folders match the rules' folders, and the one glob names every story file
	expect(new Set(excludedPaths.filter((excludedPath) => !excludedPath.includes("*")))).toEqual(
		WEB_COMPONENT_BROWSER_FOLDERS,
	)
	expect(excludedPaths.filter((excludedPath) => excludedPath.includes("*"))).toEqual([
		`apps/web/src/**/*${STORY_FILE_SUFFIX}`,
	])
})
