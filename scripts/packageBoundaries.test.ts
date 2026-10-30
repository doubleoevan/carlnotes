// the package boundary check flags a package.json or a runtime closure that crosses a workspace boundary, and gathers
// every rule across the tree
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
	checkPackageBoundaries,
	type ResolvePackage,
	toClosureViolations,
	toPackageJsonViolations,
	toWebClosureViolations,
} from "./packageBoundaries"
import { UNIVERSAL_WORKSPACE_FOLDERS, type Workspace } from "./workspaces"
import {
	CLIENT_WORKSPACE,
	CONTRACTS_WORKSPACE,
	FIXTURE_WORKSPACES,
	MOBILE_WORKSPACE,
	WEB_WORKSPACE,
} from "./workspaceTestFixtures"

// a resolver over an in-memory dependency graph. a name outside the graph does not resolve
function toFakeResolver(graph: Record<string, string[]>): ResolvePackage {
	return ({ packageName }) => {
		const dependencyNames = graph[packageName]
		return dependencyNames ? { packageDirectory: `/installed/${packageName}`, dependencyNames } : undefined
	}
}

// the tsconfig references name the same workspaces the package.json declares
test("toPackageJsonViolations flags references that differ from the package.json and passes matching ones", () => {
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: WEB_WORKSPACE })).toEqual([])
	const missingClient = { ...WEB_WORKSPACE, references: ["packages/contracts"] }
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: missingClient })).toEqual([
		"apps/web: apps/web/tsconfig.json references @carlnotes/contracts. the package.json declares @carlnotes/client, @carlnotes/contracts",
	])
	const extraDb = { ...WEB_WORKSPACE, references: [...WEB_WORKSPACE.references, "packages/db"] }
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: extraDb })).toEqual([
		"apps/web: apps/web/tsconfig.json references @carlnotes/client, @carlnotes/contracts, @carlnotes/db. the package.json declares @carlnotes/client, @carlnotes/contracts",
	])
	const noReferences = { ...CONTRACTS_WORKSPACE, dependencies: ["@carlnotes/client"] }
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: noReferences })).toEqual([
		"packages/contracts: packages/contracts/tsconfig.json references nothing. the package.json declares @carlnotes/client",
	])
})

// the package.json: a universal package depends on universal packages, with the api as a type-only dev dependency
test("toPackageJsonViolations flags a server package in a universal package.json and passes the api client package's api dev dependency", () => {
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: CLIENT_WORKSPACE })).toEqual([])
	const clientOnDb = {
		...CLIENT_WORKSPACE,
		dependencies: [...CLIENT_WORKSPACE.dependencies, "@carlnotes/db"],
		references: [...CLIENT_WORKSPACE.references, "packages/db"],
	}
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: clientOnDb })).toEqual([
		"packages/client: packages/client/package.json depends on @carlnotes/db. a universal package depends on universal packages only",
	])
	const clientRunningApi = { ...CLIENT_WORKSPACE, dependencies: [...CLIENT_WORKSPACE.dependencies, "@carlnotes/api"] }
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: clientRunningApi })).toEqual([
		"packages/client: packages/client/package.json depends on @carlnotes/api. a universal package depends on universal packages only",
	])
})

// the mobile app's package.json declares universal packages only. even a dev dependency on the api fails
test("toPackageJsonViolations flags a non-universal dependency of the mobile app and passes the universal ones", () => {
	// the clean mobile app passes
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: MOBILE_WORKSPACE })).toEqual([])

	// a server package fails
	const mobileOnDb = {
		...MOBILE_WORKSPACE,
		dependencies: [...MOBILE_WORKSPACE.dependencies, "@carlnotes/db"],
		references: [...MOBILE_WORKSPACE.references, "packages/db"],
	}
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: mobileOnDb })).toEqual([
		"apps/mobile: apps/mobile/package.json depends on @carlnotes/db. the mobile app depends on the universal packages only",
	])

	// the api fails even as a dev dependency. only the api client package and the web app may declare it
	const mobileOnApi = {
		...MOBILE_WORKSPACE,
		devDependencies: ["@carlnotes/api"],
		references: [...MOBILE_WORKSPACE.references, "apps/api"],
	}
	expect(toPackageJsonViolations({ workspaces: FIXTURE_WORKSPACES, workspace: mobileOnApi })).toEqual([
		"apps/mobile: apps/mobile/package.json depends on @carlnotes/api. the mobile app depends on the universal packages only",
	])
})

// the closure walk: the walk follows each installed package's own dependencies and names the chain to a server one
test("toClosureViolations flags a server dependency reached through the chain and passes a clean closure", () => {
	const cleanResolver = toFakeResolver({ "@carlnotes/contracts": ["zod"], zod: [], hono: [] })
	expect(toClosureViolations({ workspace: CLIENT_WORKSPACE, resolvePackage: cleanResolver })).toEqual({
		violations: [],
		notes: [],
	})
	const leakingResolver = toFakeResolver({
		"@carlnotes/contracts": ["zod"],
		zod: [],
		hono: ["@hono/node-server"],
		"@hono/node-server": ["@temporalio/client"],
	})
	expect(toClosureViolations({ workspace: CLIENT_WORKSPACE, resolvePackage: leakingResolver })).toEqual({
		violations: [
			"packages/client: packages/client/package.json reaches @temporalio/client through hono -> @hono/node-server -> @temporalio/client. a universal package never depends on a server package",
		],
		notes: [],
	})
})

// a package that does not resolve is noted and skipped, and the walk starts from dependencies alone
test("toClosureViolations notes an unresolved package and skips devDependencies", () => {
	const resolver = toFakeResolver({ "@carlnotes/contracts": ["zod"], zod: [] })
	expect(toClosureViolations({ workspace: CLIENT_WORKSPACE, resolvePackage: resolver })).toEqual({
		violations: [],
		notes: ["packages/client: hono did not resolve from packages/client, skipped"],
	})
})

// the web app declares each package that runtime code in its @carlnotes closure imports, outside tests and packages it
// never reaches
test("toWebClosureViolations flags a package the web app's closure imports that the web app does not declare", () => {
	// zod in contracts and hono in the api client package, a test's import, and a server package the web never reaches
	const sourceFiles = [
		{ filePath: "packages/contracts/chat.ts", fileText: 'import { z } from "zod"\n' },
		{ filePath: "packages/contracts/chat.test.ts", fileText: 'import fc from "fast-check"\n' },
		{ filePath: "packages/client/apiClient.ts", fileText: 'import { hc } from "hono/client"\n' },
		{ filePath: "packages/db/index.ts", fileText: 'import { sql } from "drizzle-orm"\n' },
	]

	// the web app without zod and hono fails on both
	expect(toWebClosureViolations({ workspaces: FIXTURE_WORKSPACES, sourceFiles })).toEqual([
		"apps/web: packages/client/apiClient.ts:1 imports hono. the web server build leaves it external. declare it in apps/web/package.json dependencies",
		"apps/web: packages/contracts/chat.ts:1 imports zod. the web server build leaves it external. declare it in apps/web/package.json dependencies",
	])

	// the web app that declares both passes
	const webWithExternals = { ...WEB_WORKSPACE, dependencies: [...WEB_WORKSPACE.dependencies, "zod", "hono"] }
	const workspaces = FIXTURE_WORKSPACES.map((workspace) => (workspace === WEB_WORKSPACE ? webWithExternals : workspace))
	expect(toWebClosureViolations({ workspaces, sourceFiles })).toEqual([])
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
	expect(checkPackageBoundaries({ workspaces: FIXTURE_WORKSPACES, sourceFiles, resolvePackage })).toEqual({
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
		peerDependencies: [],
		references: [],
	}
	const { violations } = checkPackageBoundaries({
		workspaces: [...FIXTURE_WORKSPACES, core],
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

// biome.json's noRestrictedGlobals override names the universal packages, the same set the rules do
test("the Biome override and the boundary rules name the same universal packages", () => {
	// the folders the override includes, without their glob
	const biomeConfig = JSON.parse(readFileSync("biome.json", "utf8")) as {
		overrides: { includes: string[]; linter?: { rules?: { style?: { noRestrictedGlobals?: unknown } } } }[]
	}
	const universalOverride = biomeConfig.overrides.find((override) => override.linter?.rules?.style?.noRestrictedGlobals)
	const overrideFolders = universalOverride?.includes
		.filter((include) => !include.startsWith("!"))
		.map((include) => include.replace(/\/\*\*$/, ""))

	// they match the rules' set
	expect(new Set(overrideFolders)).toEqual(UNIVERSAL_WORKSPACE_FOLDERS)

	// the mobile override denies Bun and the browser globals. process stays allowed for the EXPO_PUBLIC values
	const mobileOverride = biomeConfig.overrides.find((override) => override.includes.includes("apps/mobile/**"))
	const mobileRestrictedGlobals = mobileOverride?.linter?.rules?.style?.noRestrictedGlobals as
		| { options: { deniedGlobals: Record<string, string> } }
		| undefined
	const deniedGlobals = Object.keys(mobileRestrictedGlobals?.options.deniedGlobals ?? {})

	// the denied set holds Bun and the browser globals. process is not denied
	expect(deniedGlobals).toContain("Bun")
	expect(deniedGlobals).toContain("window")
	expect(deniedGlobals).not.toContain("process")
})

// the patched markdown-to-jsx keeps react-native out of its lockfile peers. bun links peers from the lockfile's
// manifest entry. an update of the package would write the registry's peers back and link the React Native closure
// into the image, so this test fails first
test("the markdown-to-jsx lock entry names no react-native peer", () => {
	const lockfileText = readFileSync("bun.lock", "utf8")
	const markdownEntryLine = lockfileText
		.split("\n")
		.find((line) => line.includes('"markdown-to-jsx": ["markdown-to-jsx@'))
	expect(markdownEntryLine).toBeDefined()
	expect(markdownEntryLine).not.toContain("react-native")
})
