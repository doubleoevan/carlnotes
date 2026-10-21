// the package boundary check flags an import or a package.json that crosses a workspace boundary and lets the rest through
import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
	checkPackageBoundaries,
	isTypeOnlyImport,
	type ResolvePackage,
	toClosureViolations,
	toImportViolations,
	toPackageJsonViolations,
	toParsedImports,
	UNIVERSAL_WORKSPACE_FOLDERS,
	type Workspace,
} from "./packageBoundaries"

// a small workspace map: two universal packages, a server package, and two apps
const CONTRACTS: Workspace = {
	folder: "packages/contracts",
	name: "@carlnotes/contracts",
	dependencies: ["zod"],
	devDependencies: [],
	hasTsconfig: true,
	references: [],
}
const CLIENT: Workspace = {
	folder: "packages/client",
	name: "@carlnotes/client",
	dependencies: ["@carlnotes/contracts", "hono"],
	devDependencies: ["@carlnotes/api"],
	hasTsconfig: true,
	references: ["apps/api", "packages/contracts"],
}
const DB: Workspace = {
	folder: "packages/db",
	name: "@carlnotes/db",
	dependencies: ["@carlnotes/contracts", "drizzle-orm"],
	devDependencies: [],
	hasTsconfig: true,
	references: ["packages/contracts"],
}
const API: Workspace = {
	folder: "apps/api",
	name: "@carlnotes/api",
	dependencies: ["@carlnotes/contracts", "@carlnotes/db"],
	devDependencies: [],
	hasTsconfig: true,
	references: ["packages/contracts", "packages/db"],
}
const WEB: Workspace = {
	folder: "apps/web",
	name: "@carlnotes/web",
	dependencies: ["@carlnotes/client", "@carlnotes/contracts"],
	devDependencies: [],
	hasTsconfig: true,
	references: ["packages/client", "packages/contracts"],
}
const TOKENS: Workspace = {
	folder: "packages/tokens",
	name: "@carlnotes/tokens",
	dependencies: [],
	devDependencies: [],
	hasTsconfig: false,
	references: [],
}
const WORKSPACES = [CONTRACTS, CLIENT, DB, API, WEB]

// a resolver over an in-memory dependency graph. a name outside the graph does not resolve
function toFakeResolver(graph: Record<string, string[]>): ResolvePackage {
	return ({ packageName }) => {
		const dependencyNames = graph[packageName]
		return dependencyNames ? { packageDirectory: `/installed/${packageName}`, dependencyNames } : undefined
	}
}

// the violations of one file's text inside a workspace
function toFileViolations(filePath: string, fileText: string): string[] {
	return toImportViolations({ workspaces: WORKSPACES, sourceFile: { filePath, fileText } })
}

// an import is parsed with its path, the line it starts on, and its type-only flag, across statement shapes
test("toParsedImports reads static, multi-line, side-effect, dynamic, and re-export imports", () => {
	const fileText =
		'import { a } from "react"\nimport {\n\tb,\n\tc,\n} from "./local"\nimport "./sideEffect"\nconst d = await import("./dynamic")\nexport type { E } from "@carlnotes/contracts/chat"\n'
	expect(toParsedImports(fileText)).toEqual([
		{ importPath: "react", lineNumber: 1, isTypeOnly: false },
		{ importPath: "./local", lineNumber: 2, isTypeOnly: false },
		{ importPath: "./sideEffect", lineNumber: 6, isTypeOnly: false },
		{ importPath: "./dynamic", lineNumber: 7, isTypeOnly: false },
		{ importPath: "@carlnotes/contracts/chat", lineNumber: 8, isTypeOnly: true },
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

// an app import fails everywhere, except the api as types only from the client and the web app
test("toImportViolations flags an app import and passes a type-only api import from the client", () => {
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

// a universal package's source imports no bun or node module, and its tests may
test("toImportViolations flags a node import in universal source and passes it in a test and a server package", () => {
	expect(toFileViolations("packages/contracts/time.ts", 'import { randomUUID } from "node:crypto"\n')).toEqual([
		"packages/contracts: packages/contracts/time.ts:1 imports node:crypto. a universal package imports no bun or node module",
	])
	expect(toFileViolations("packages/client/x.ts", 'import { serve } from "bun"\n')).toEqual([
		"packages/client: packages/client/x.ts:1 imports bun. a universal package imports no bun or node module",
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

// the tsconfig references name the same workspaces the package.json declares
test("toPackageJsonViolations flags references that differ from the package.json and passes matching ones", () => {
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: WEB })).toEqual([])
	const missingClient = { ...WEB, references: ["packages/contracts"] }
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: missingClient })).toEqual([
		"apps/web: apps/web/tsconfig.json references @carlnotes/contracts. the package.json declares @carlnotes/client, @carlnotes/contracts",
	])
	const extraDb = { ...WEB, references: [...WEB.references, "packages/db"] }
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: extraDb })).toEqual([
		"apps/web: apps/web/tsconfig.json references @carlnotes/client, @carlnotes/contracts, @carlnotes/db. the package.json declares @carlnotes/client, @carlnotes/contracts",
	])
	const noReferences = { ...CONTRACTS, dependencies: ["@carlnotes/client"] }
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: noReferences })).toEqual([
		"packages/contracts: packages/contracts/tsconfig.json references nothing. the package.json declares @carlnotes/client",
	])
})

// the package.json: a universal package depends on universal packages, with the api as a type-only dev dependency
test("toPackageJsonViolations flags a server package in a universal package.json and passes the client's api dev dependency", () => {
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: CLIENT })).toEqual([])
	const clientOnDb = {
		...CLIENT,
		dependencies: [...CLIENT.dependencies, "@carlnotes/db"],
		references: [...CLIENT.references, "packages/db"],
	}
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: clientOnDb })).toEqual([
		"packages/client: packages/client/package.json depends on @carlnotes/db. a universal package depends on universal packages only",
	])
	const clientRunningApi = { ...CLIENT, dependencies: [...CLIENT.dependencies, "@carlnotes/api"] }
	expect(toPackageJsonViolations({ workspaces: WORKSPACES, workspace: clientRunningApi })).toEqual([
		"packages/client: packages/client/package.json depends on @carlnotes/api. a universal package depends on universal packages only",
	])
})

// the closure walk: the walk follows each installed package's own dependencies and names the chain to a server one
test("toClosureViolations flags a server dependency reached through the chain and passes a clean closure", () => {
	const cleanResolver = toFakeResolver({ "@carlnotes/contracts": ["zod"], zod: [], hono: [] })
	expect(toClosureViolations({ workspace: CLIENT, resolvePackage: cleanResolver })).toEqual({
		violations: [],
		notes: [],
	})
	const leakingResolver = toFakeResolver({
		"@carlnotes/contracts": ["zod"],
		zod: [],
		hono: ["@hono/node-server"],
		"@hono/node-server": ["@temporalio/client"],
	})
	expect(toClosureViolations({ workspace: CLIENT, resolvePackage: leakingResolver })).toEqual({
		violations: [
			"packages/client: packages/client/package.json reaches @temporalio/client through hono -> @hono/node-server -> @temporalio/client. a universal package never depends on a server package",
		],
		notes: [],
	})
})

// a package that does not resolve is noted and skipped, and the walk starts from dependencies alone
test("toClosureViolations notes an unresolved package and skips devDependencies", () => {
	const resolver = toFakeResolver({ "@carlnotes/contracts": ["zod"], zod: [] })
	expect(toClosureViolations({ workspace: CLIENT, resolvePackage: resolver })).toEqual({
		violations: [],
		notes: ["packages/client: hono did not resolve from packages/client, skipped"],
	})
})

// the whole check gathers the import, package.json, and closure rules and passes a clean tree
test("checkPackageBoundaries passes a clean tree and gathers violations across the rules", () => {
	const sourceFiles = [
		{ filePath: "packages/client/apiClient.ts", fileText: 'import type { AppType } from "@carlnotes/api"\n' },
		{ filePath: "apps/web/src/x.ts", fileText: 'import { apiClient } from "@carlnotes/client/apiClient"\n' },
	]
	const resolvePackage = toFakeResolver({
		"@carlnotes/contracts": ["zod"],
		"@carlnotes/db": ["drizzle-orm"],
		zod: [],
		hono: [],
	})
	expect(checkPackageBoundaries({ workspaces: WORKSPACES, sourceFiles, resolvePackage })).toEqual({
		violations: [],
		notes: [],
	})
	const leakingFiles = [
		...sourceFiles,
		{ filePath: "packages/core/x.ts", fileText: 'import { db } from "@carlnotes/db"\nimport "node:fs"\n' },
	]
	const core: Workspace = {
		folder: "packages/core",
		name: "@carlnotes/core",
		dependencies: ["@carlnotes/db"],
		devDependencies: [],
		hasTsconfig: true,
		references: [],
	}
	const { violations } = checkPackageBoundaries({
		workspaces: [...WORKSPACES, core],
		sourceFiles: leakingFiles,
		resolvePackage,
	})
	expect(violations).toEqual([
		"packages/core: packages/core/x.ts:2 imports node:fs. a universal package imports no bun or node module",
		"packages/core: packages/core/tsconfig.json references nothing. the package.json declares @carlnotes/db",
		"packages/core: packages/core/package.json depends on @carlnotes/db. a universal package depends on universal packages only",
		"packages/core: packages/core/package.json reaches drizzle-orm through @carlnotes/db -> drizzle-orm. a universal package never depends on a server package",
	])
})

// a dependency on a package with no tsconfig, such as the CSS-only tokens, needs no reference
test("toPackageJsonViolations lets a dependency on a tsconfig-less package go unreferenced", () => {
	const webWithTokens = { ...WEB, dependencies: [...WEB.dependencies, "@carlnotes/tokens"] }
	expect(toPackageJsonViolations({ workspaces: [CONTRACTS, CLIENT, WEB, TOKENS], workspace: webWithTokens })).toEqual(
		[],
	)
})

// biome.json's noRestrictedGlobals override names the universal packages that hold TypeScript, the same set the rules do
test("the Biome override and the boundary rules name the same universal packages", () => {
	const biomeConfig = JSON.parse(readFileSync("biome.json", "utf8")) as {
		overrides: { includes: string[]; linter?: { rules?: { style?: { noRestrictedGlobals?: unknown } } } }[]
	}
	const universalOverride = biomeConfig.overrides.find((override) => override.linter?.rules?.style?.noRestrictedGlobals)
	const overrideFolders = universalOverride?.includes
		.filter((include) => !include.startsWith("!"))
		.map((include) => include.replace(/\/\*\*$/, ""))
	const typescriptUniversalFolders = [...UNIVERSAL_WORKSPACE_FOLDERS].filter((folder) =>
		existsSync(join(folder, "tsconfig.json")),
	)
	expect(new Set(overrideFolders)).toEqual(new Set(typescriptUniversalFolders))
})
