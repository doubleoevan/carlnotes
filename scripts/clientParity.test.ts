// the client parity rules over fixture files: a capability reached through a core hook, a reached file whose other
// export is not reached, each import form, an unlisted web-only capability, a stale row, and the mobile-only report
import { expect, test } from "bun:test"
import { checkClientParity, parseParityInventory, resolveImportPath, toNamedImports } from "./clientParity"
import type { SourceFile } from "./workspaces"

// an api client module with two capabilities, a core hook that calls one, and each app's routes
const CLIENT_MODULE: SourceFile = {
	filePath: "packages/client/noteClient.ts",
	fileText:
		"export async function fetchNotes(): Promise<void> {}\nexport async function sendNoteRead(): Promise<void> {}\n",
}
const CORE_HOOK: SourceFile = {
	filePath: "packages/core/hooks/useNoteBadges.ts",
	fileText: 'import { sendNoteRead } from "@carlnotes/client/noteClient"\n',
}
const WEB_ROUTE: SourceFile = {
	filePath: "apps/web/src/routes/index.tsx",
	fileText: 'import { NotesPage } from "@/pages/NotesPage"\n',
}
const WEB_PAGE: SourceFile = {
	filePath: "apps/web/src/pages/NotesPage.tsx",
	fileText:
		'import { fetchNotes } from "@carlnotes/client/noteClient"\nimport { useNoteBadges } from "@carlnotes/core/hooks/useNoteBadges"\n',
}
const MOBILE_ROUTE: SourceFile = {
	filePath: "apps/mobile/app/index.tsx",
	fileText: 'import { useNoteBadges } from "@carlnotes/core/hooks/useNoteBadges"\n',
}
const SOURCE_FILES = [CLIENT_MODULE, CORE_HOOK, WEB_ROUTE, WEB_PAGE, MOBILE_ROUTE]

// a capability the web page imports and no mobile screen reaches fails unless listed, and a hook reaches the other
test("a web-only capability fails unless listed, and a core hook reaches a capability for both apps", () => {
	const unlistedReport = checkClientParity({ sourceFiles: SOURCE_FILES, inventoryEntries: [] })
	expect(unlistedReport.webOnlyCapabilities).toEqual(["noteClient.fetchNotes"])
	expect(unlistedReport.violations).toHaveLength(1)
	expect(unlistedReport.violations[0]).toContain(
		"noteClient.fetchNotes is reached by the web through apps/web/src/pages/NotesPage.tsx",
	)

	// listed with a reason, it passes
	const listedReport = checkClientParity({
		sourceFiles: SOURCE_FILES,
		inventoryEntries: [{ capability: "noteClient.fetchNotes", reason: "the app lists notes" }],
	})
	expect(listedReport.violations).toEqual([])
})

// a row that names a capability the app reaches, one that no longer exists, or one with no reason fails
test("a stale, unknown, or reasonless inventory row fails", () => {
	const report = checkClientParity({
		sourceFiles: SOURCE_FILES,
		inventoryEntries: [
			{ capability: "noteClient.fetchNotes", reason: " " },
			{ capability: "noteClient.sendNoteRead", reason: "Prompt 55" },
			{ capability: "noteClient.fetchComments", reason: "Prompt 55" },
		],
	})
	expect(report.violations).toEqual([
		"apps/mobile/parity.md lists noteClient.fetchNotes with no reason or prompt",
		"apps/mobile/parity.md lists noteClient.sendNoteRead, which the app now reaches. retire the row",
		"apps/mobile/parity.md lists noteClient.fetchComments, which no api client module exports",
	])
})

// a capability only a mobile screen reaches is reported, never a failure
test("a mobile-only capability is reported and passes", () => {
	const mobileRoute: SourceFile = {
		filePath: "apps/mobile/app/index.tsx",
		fileText: 'import { fetchNotes, sendNoteRead } from "@carlnotes/client/noteClient"\n',
	}
	const report = checkClientParity({ sourceFiles: [CLIENT_MODULE, mobileRoute], inventoryEntries: [] })
	expect(report.violations).toEqual([])
	expect(report.mobileOnlyCapabilities).toEqual(["noteClient.fetchNotes", "noteClient.sendNoteRead"])
})

// each specifier form: named with an alias, a type specifier skipped, a type-only statement skipped, a namespace,
// a default, and a dynamic import
test("named imports keep each specifier's own name and skip types", () => {
	const fileText = [
		'import { fetchNotes as loadNotes, type NoteBadge, sendNoteRead } from "@carlnotes/client/noteClient"',
		'import type { Note } from "@carlnotes/contracts/notes"',
		'import * as Notifications from "expo-notifications"',
		'import React from "react"',
		'const lazy = import("./Lazy")',
	].join("\n")
	expect(toNamedImports(fileText)).toEqual([
		{ importPath: "@carlnotes/client/noteClient", names: ["fetchNotes", "sendNoteRead"] },
		{ importPath: "expo-notifications", names: ["*"] },
		{ importPath: "react", names: ["default"] },
		{ importPath: "./Lazy", names: ["*"] },
	])
})

// a relative path, an app alias, and a workspace package path resolve to the files the check read
test("imports resolve through the relative, alias, and package forms", () => {
	const filesByPath = new Map(
		[
			...SOURCE_FILES,
			{ filePath: "apps/mobile/src/components/common/Sheet.tsx", fileText: "" },
			{ filePath: "packages/core/components/index.ts", fileText: "" },
		].map((sourceFile) => [sourceFile.filePath, sourceFile]),
	)
	const resolveFrom = (importPath: string, fromFilePath: string): string | null =>
		resolveImportPath({ importPath, fromFilePath, filesByPath })
	expect(resolveFrom("../pages/NotesPage", "apps/web/src/routes/index.tsx")).toBe("apps/web/src/pages/NotesPage.tsx")
	expect(resolveFrom("@/components/common/Sheet", "apps/mobile/app/index.tsx")).toBe(
		"apps/mobile/src/components/common/Sheet.tsx",
	)
	expect(resolveFrom("@carlnotes/core/components", "apps/web/src/pages/NotesPage.tsx")).toBe(
		"packages/core/components/index.ts",
	)
	expect(resolveFrom("react", "apps/web/src/pages/NotesPage.tsx")).toBeNull()
})

// the inventory's rows come from the table under its heading, and nothing else
test("the inventory table is read under its heading", () => {
	const markdown = [
		"# Parity",
		"",
		"## Web-only client capabilities",
		"",
		"| Capability | Status | Reason or prompt |",
		"| --- | --- | --- |",
		"| `billingClient.fetchCheckoutUrl` | deferred | Prompt 55, store payments |",
		"| `adminClient.fetchAdminUsers` | web-only | Admin opens the web |",
		"",
		"## Roles",
		"",
		"| `teamClient.sendDeleteTeam` | not a row | the table above ended |",
	].join("\n")
	expect(parseParityInventory(markdown)).toEqual([
		{ capability: "billingClient.fetchCheckoutUrl", reason: "Prompt 55, store payments" },
		{ capability: "adminClient.fetchAdminUsers", reason: "Admin opens the web" },
	])
})
