// the component parity rules over fixture contracts and files: a missing implementation, an implementation without its
// import or its story, an orphan, a contract without platforms, a contract imported outside its implementation, and the
// passing case
import { expect, test } from "bun:test"
import { type ComponentContract, checkComponentParity } from "./componentParity"
import type { SourceFile } from "./workspaces"

// the Badge contract both apps implement
const BADGE_CONTRACT: ComponentContract = { componentName: "badge", platforms: ["web", "mobile"] }

// an implementation's file text that imports its contract
const BADGE_IMPLEMENTATION_TEXT = 'import { badgeBoxVariants } from "@carlnotes/nightshift/components/badge"\n'

// both apps' implementations of Badge with their stories, which pass every rule
const BADGE_FILES: SourceFile[] = [
	{ filePath: "apps/web/src/components/primitives/badge.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
	{ filePath: "apps/web/src/components/primitives/badge.stories.tsx", fileText: "" },
	{ filePath: "apps/mobile/src/components/primitives/badge.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
	{ filePath: "apps/mobile/src/components/primitives/badge.stories.tsx", fileText: "" },
]

// the fixture files with one path removed
function withoutFile(filePath: string): SourceFile[] {
	return BADGE_FILES.filter((sourceFile) => sourceFile.filePath !== filePath)
}

test("both implementations with their imports and stories pass", () => {
	expect(checkComponentParity({ contracts: [BADGE_CONTRACT], sourceFiles: BADGE_FILES })).toEqual([])
})

test("a missing mobile implementation names the contract and the path it expected", () => {
	const sourceFiles = withoutFile("apps/mobile/src/components/primitives/badge.tsx")
	expect(checkComponentParity({ contracts: [BADGE_CONTRACT], sourceFiles })).toEqual([
		"packages/nightshift/components/badge.ts has no mobile implementation. expected apps/mobile/src/components/primitives/badge.tsx",
	])
})

test("a missing web implementation names the contract and the path it expected", () => {
	const sourceFiles = withoutFile("apps/web/src/components/primitives/badge.tsx")
	expect(checkComponentParity({ contracts: [BADGE_CONTRACT], sourceFiles })).toEqual([
		"packages/nightshift/components/badge.ts has no web implementation. expected apps/web/src/components/primitives/badge.tsx",
	])
})

test("an implementation that imports no value from its contract fails", () => {
	// the web implementation with its own classes, then with its own classes and the contract's types
	const toFilesWithWebImplementationText = (fileText: string): SourceFile[] =>
		BADGE_FILES.map((sourceFile) =>
			sourceFile.filePath === "apps/web/src/components/primitives/badge.tsx" ? { ...sourceFile, fileText } : sourceFile,
		)
	const ownClassesText = 'import { cva } from "class-variance-authority"\n'
	const typesOnlyText = `${ownClassesText}import type { BadgeVariant } from "@carlnotes/nightshift/components/badge"\n`

	// both fail naming the implementation and its contract
	const implementationViolation =
		"apps/web/src/components/primitives/badge.tsx imports no value from @carlnotes/nightshift/components/badge, its contract"
	const contracts = [BADGE_CONTRACT]
	expect(checkComponentParity({ contracts, sourceFiles: toFilesWithWebImplementationText(ownClassesText) })).toEqual([
		implementationViolation,
	])
	expect(checkComponentParity({ contracts, sourceFiles: toFilesWithWebImplementationText(typesOnlyText) })).toEqual([
		implementationViolation,
	])
})

test("an implementation without a story fails naming the story it expected", () => {
	const sourceFiles = withoutFile("apps/mobile/src/components/primitives/badge.stories.tsx")
	expect(checkComponentParity({ contracts: [BADGE_CONTRACT], sourceFiles })).toEqual([
		"apps/mobile/src/components/primitives/badge.tsx has no story. expected apps/mobile/src/components/primitives/badge.stories.tsx",
	])
})

test("a mobile implementation of a web-only contract is an orphan", () => {
	const webOnlyContract: ComponentContract = { componentName: "badge", platforms: ["web"] }
	expect(checkComponentParity({ contracts: [webOnlyContract], sourceFiles: BADGE_FILES })).toEqual([
		"apps/mobile/src/components/primitives/badge.tsx is an orphan. packages/nightshift/components/badge.ts names no mobile implementation",
	])
})

test("an implementation whose contract does not exist is an orphan", () => {
	expect(checkComponentParity({ contracts: [], sourceFiles: BADGE_FILES.slice(0, 1) })).toEqual([
		"apps/web/src/components/primitives/badge.tsx imports @carlnotes/nightshift/components/badge, and packages/nightshift/components/badge.ts does not exist",
	])
})

test("a contract without platforms fails naming its file", () => {
	const contract: ComponentContract = { componentName: "badge", platforms: undefined }
	expect(checkComponentParity({ contracts: [contract], sourceFiles: BADGE_FILES })).toEqual([
		"packages/nightshift/components/badge.ts exports no platforms. a contract names the apps that keep an implementation of it",
	])
})

test("an app file that imports a contract names its own app's implementation to import instead", () => {
	// a web page and a mobile screen with the contract import fail, and a test with it passes
	const sourceFiles = [
		...BADGE_FILES,
		{ filePath: "apps/web/src/pages/HomePage.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
		{ filePath: "apps/web/src/pages/HomePage.test.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
		{ filePath: "apps/mobile/app/index.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
	]
	expect(checkComponentParity({ contracts: [BADGE_CONTRACT], sourceFiles })).toEqual([
		"apps/web/src/pages/HomePage.tsx imports @carlnotes/nightshift/components/badge. an app imports a contract only from its implementation, a story, or a test. import apps/web/src/components/primitives/badge.tsx instead",
		"apps/mobile/app/index.tsx imports @carlnotes/nightshift/components/badge. an app imports a contract only from its implementation, a story, or a test. import apps/mobile/src/components/primitives/badge.tsx instead",
	])
})

test("an app file that imports a contract with no implementation in its app is told so", () => {
	// a mobile screen imports a web-only contract
	const webOnlyContract: ComponentContract = { componentName: "badge", platforms: ["web"] }
	const sourceFiles = [
		...BADGE_FILES.slice(0, 2),
		{ filePath: "apps/mobile/app/index.tsx", fileText: BADGE_IMPLEMENTATION_TEXT },
	]
	expect(checkComponentParity({ contracts: [webOnlyContract], sourceFiles })).toEqual([
		"apps/mobile/app/index.tsx imports @carlnotes/nightshift/components/badge. an app imports a contract only from its implementation, a story, or a test. packages/nightshift/components/badge.ts names no implementation in this app",
	])
})
