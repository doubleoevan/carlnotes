// the component inventory rules: a component both apps define under one name renders or adapts the core component of
// that name, a primitive both apps keep has a Nightshift contract, and every other such pair is a row in
// apps/mobile/parity.md with a kind and a reason
import { posix } from "node:path"
import { isShippedFile, toNamedImports } from "./clientParity"
import { APP_PRIMITIVES_FOLDER, toContractPath } from "./componentParity"
import { toParsedImports } from "./importBoundaries"
import { toImportResolution } from "./importPaths"
import { type InventoryRow, PARITY_INVENTORY_PATH } from "./parityInventory"
import { isInsideFolder, MOBILE_APP_FOLDER, type SourceFile, WEB_APP_FOLDER } from "./workspaces"

/** The heading of the inventory table this check reads. */
export const COMPONENT_INVENTORY_HEADING = "## Separately built components"

/** The kinds a row may give for a pair that each app builds on its own. */
export const COMPONENT_KINDS = ["platform API", "platform difference", "not yet shared"] as const
type ComponentKind = (typeof COMPONENT_KINDS)[number]

// the folder of the shared components, and each app's component folder
const CORE_COMPONENTS_FOLDER = "packages/core/components"
const APP_COMPONENTS_FOLDER = "src/components"

// a braced specifier whose imported name, before any `as`, is a core component's adapter type
const ELEMENTS_SPECIFIER_PATTERN = /[{,]\s*(?:type\s+)?\w+Elements\b/

/** What the check counted: the pairs, the shared ones, the listed ones by kind, and the listed primitives. */
export type ComponentInventoryCounts = {
	pairCount: number
	sharedCount: number
	listedCountByKind: Record<ComponentKind, number>
	listedPrimitiveCount: number
}

// the files the check reads, the names of the Nightshift contracts, and the inventory rows
type CheckComponentInventoryOptions = {
	sourceFiles: SourceFile[]
	contractNames: string[]
	inventoryRows: InventoryRow[]
}

// one app's component files by name, split into primitives and every other component
type AppComponentFiles = { componentFiles: Map<string, string[]>; primitiveFiles: Map<string, string[]> }

// what both apps define: the same-name pairs, the shared ones, the primitives without a contract, and each app's files
type ComponentPairs = {
	pairNames: string[]
	sharedNames: Set<string>
	primitiveNames: string[]
	contracts: Set<string>
	webFiles: AppComponentFiles
	mobileFiles: AppComponentFiles
}

/**
 * Returns every inventory violation, one line each, and the counts: an unlisted pair that does not share its core
 * component, an unlisted primitive without a contract, and a row that is stale, duplicated, or missing its kind or
 * reason.
 */
export function checkComponentInventory({
	sourceFiles,
	contractNames,
	inventoryRows,
}: CheckComponentInventoryOptions): { violations: string[]; counts: ComponentInventoryCounts } {
	// what both apps define, then the unlisted pairs and primitives, then the rows
	const componentPairs = toComponentPairs({ sourceFiles, contractNames })
	const listedNames = new Set(inventoryRows.map((inventoryRow) => inventoryRow.name))
	const rowResult = checkInventoryRows({ componentPairs, inventoryRows })

	// every violation, and the counts the check prints
	const { pairNames, sharedNames } = componentPairs
	return {
		violations: [...toUnlistedViolations({ componentPairs, listedNames }), ...rowResult.violations],
		counts: {
			pairCount: pairNames.length,
			sharedCount: sharedNames.size,
			listedCountByKind: rowResult.listedCountByKind,
			listedPrimitiveCount: rowResult.listedPrimitiveCount,
		},
	}
}

// the files the check reads, and the names of the Nightshift contracts
type ToComponentPairsOptions = { sourceFiles: SourceFile[]; contractNames: string[] }

// the names both apps define, which of them share their same-name core component, and the primitives both keep
// without a contract
function toComponentPairs({ sourceFiles, contractNames }: ToComponentPairsOptions): ComponentPairs {
	// both apps' component files, and the files by path for the resolver
	const filesByPath = new Map(sourceFiles.map((sourceFile) => [sourceFile.filePath, sourceFile]))
	const webFiles = toAppComponentFiles({ sourceFiles, appFolder: WEB_APP_FOLDER })
	const mobileFiles = toAppComponentFiles({ sourceFiles, appFolder: MOBILE_APP_FOLDER })

	// the names both apps define, and the primitives both keep without a contract
	const pairNames = [...webFiles.componentFiles.keys()].filter((name) => mobileFiles.componentFiles.has(name)).sort()
	const contracts = new Set(contractNames)
	const primitiveNames = [...webFiles.primitiveFiles.keys()]
		.filter((name) => mobileFiles.primitiveFiles.has(name) && !contracts.has(name))
		.sort()

	// the pairs whose every file renders or adapts its same-name core component
	const sharedNames = new Set(
		pairNames.filter((name) =>
			toPairFiles({ name, webFiles, mobileFiles, isPrimitive: false }).every((filePath) =>
				isBackedFile({ filePath, componentName: name, filesByPath }),
			),
		),
	)
	return { pairNames, sharedNames, primitiveNames, contracts, webFiles, mobileFiles }
}

// what both apps define, and the names the inventory lists
type ToUnlistedViolationsOptions = { componentPairs: ComponentPairs; listedNames: Set<string> }

// an unshared pair and a primitive without a contract that the inventory does not list
function toUnlistedViolations({ componentPairs, listedNames }: ToUnlistedViolationsOptions): string[] {
	// where a missing row goes
	const { pairNames, sharedNames, primitiveNames, webFiles, mobileFiles } = componentPairs
	const listHint = `in ${PARITY_INVENTORY_PATH} under "${COMPONENT_INVENTORY_HEADING}" with its kind and reason`

	// each unlisted pair that does not share its same-name core component
	const pairViolations = pairNames
		.filter((name) => !sharedNames.has(name) && !listedNames.has(name))
		.map((name) => {
			const pairFiles = toPairFiles({ name, webFiles, mobileFiles, isPrimitive: false })
			return `${name} is built separately: ${pairFiles.join(" and ")} do not both import ${toCorePath(name)}. render or adapt it, or list ${name} ${listHint}`
		})

	// each unlisted primitive without a contract
	const primitiveViolations = primitiveNames
		.filter((name) => !listedNames.has(name))
		.map((name) => {
			const pairFiles = toPairFiles({ name, webFiles, mobileFiles, isPrimitive: true })
			return `${name} is a primitive in both apps (${pairFiles.join(" and ")}) with no contract. add ${toContractPath(name)}, or list ${name} ${listHint}`
		})
	return [...pairViolations, ...primitiveViolations]
}

// what both apps define, and the inventory rows
type CheckInventoryRowsOptions = { componentPairs: ComponentPairs; inventoryRows: InventoryRow[] }

// each row names an unshared pair or a primitive without a contract once, with a known kind and a reason. returns the
// rows' violations, and the listed pairs by kind and the listed primitives
function checkInventoryRows({ componentPairs, inventoryRows }: CheckInventoryRowsOptions): {
	violations: string[]
	listedCountByKind: Record<ComponentKind, number>
	listedPrimitiveCount: number
} {
	// the names a row may list, and the counts
	const unsharedNames = new Set(componentPairs.pairNames.filter((name) => !componentPairs.sharedNames.has(name)))
	const primitiveNames = new Set(componentPairs.primitiveNames)
	const listedCountByKind = Object.fromEntries(COMPONENT_KINDS.map((kind) => [kind, 0])) as Record<
		ComponentKind,
		number
	>
	let listedPrimitiveCount = 0

	// each row once, with its kind and reason checked, counted if it still names an unshared pair or primitive
	const violations: string[] = []
	const seenNames = new Set<string>()
	for (const { name, status: kind, reason } of inventoryRows) {
		// a name listed twice
		if (seenNames.has(name)) {
			violations.push(`${PARITY_INVENTORY_PATH} lists ${name} more than once`)
			continue
		}
		seenNames.add(name)

		// a kind outside the three, and an empty reason
		violations.push(...toRowFieldViolations({ name, kind, reason }))

		// a row that still names a primitive or an unshared pair is counted, and any other row is stale
		if (primitiveNames.has(name)) {
			listedPrimitiveCount += 1
		} else if (!unsharedNames.has(name)) {
			violations.push(toStaleRowViolation({ name, componentPairs }))
		} else if (isComponentKind(kind)) {
			listedCountByKind[kind] += 1
		}
	}

	// the rows' violations and counts
	return { violations, listedCountByKind, listedPrimitiveCount }
}

// one row's name, kind, and reason
type ToRowFieldViolationsOptions = { name: string; kind: string; reason: string }

// a row's kind outside the three, and its empty reason
function toRowFieldViolations({ name, kind, reason }: ToRowFieldViolationsOptions): string[] {
	const kindViolations = isComponentKind(kind)
		? []
		: [`${PARITY_INVENTORY_PATH} lists ${name} with the kind "${kind}". use ${COMPONENT_KINDS.join(", ")}`]
	const reasonViolations = reason.trim() === "" ? [`${PARITY_INVENTORY_PATH} lists ${name} with no reason`] : []
	return [...kindViolations, ...reasonViolations]
}

// whether a row's middle column is one of the three kinds
function isComponentKind(kind: string): kind is ComponentKind {
	return (COMPONENT_KINDS as readonly string[]).includes(kind)
}

// a name, both apps' component files, and whether the name is a primitive
type ToPairFilesOptions = {
	name: string
	webFiles: AppComponentFiles
	mobileFiles: AppComponentFiles
	isPrimitive: boolean
}

// every file of a name in both apps, the web's first
function toPairFiles({ name, webFiles, mobileFiles, isPrimitive }: ToPairFilesOptions): string[] {
	const filesKey = isPrimitive ? "primitiveFiles" : "componentFiles"
	return [...(webFiles[filesKey].get(name) ?? []), ...(mobileFiles[filesKey].get(name) ?? [])]
}

// the files the check reads, and the app whose component files are collected
type ToAppComponentFilesOptions = { sourceFiles: SourceFile[]; appFolder: string }

// an app's shipped component files by name, the primitives apart from every other component
function toAppComponentFiles({ sourceFiles, appFolder }: ToAppComponentFilesOptions): AppComponentFiles {
	const componentsFolder = `${appFolder}/${APP_COMPONENTS_FOLDER}`
	const primitivesFolder = `${appFolder}/${APP_PRIMITIVES_FOLDER}`
	const appComponentFiles: AppComponentFiles = { componentFiles: new Map(), primitiveFiles: new Map() }
	for (const { filePath } of sourceFiles) {
		// a .tsx file under the components folder that is not a story or a test
		const isComponentFile =
			isInsideFolder(filePath, componentsFolder) && filePath.endsWith(".tsx") && isShippedFile(filePath)
		if (!isComponentFile) {
			continue
		}

		// filed under its name, with the primitives apart
		const name = posix.basename(filePath, ".tsx")
		const filesByName = isInsideFolder(filePath, primitivesFolder)
			? appComponentFiles.primitiveFiles
			: appComponentFiles.componentFiles
		const namedFiles = filesByName.get(name) ?? []
		namedFiles.push(filePath)
		filesByName.set(name, namedFiles)
	}

	// the app's files by name
	return appComponentFiles
}

// one app file, its component's name, and the files by path for the resolver
type IsBackedFileOptions = { filePath: string; componentName: string; filesByPath: Map<string, SourceFile> }

// whether a file imports from its same-name core component a value it renders or an Elements type it implements
function isBackedFile({ filePath, componentName, filesByPath }: IsBackedFileOptions): boolean {
	// an import path that resolves to the core module of the same name
	const corePath = toCorePath(componentName)
	const fileText = filesByPath.get(filePath)?.fileText ?? ""
	const isCoreComponentImport = (importPath: string): boolean => {
		const importResolution = toImportResolution({ importPath, fromFilePath: filePath, knownFilePaths: filesByPath })
		return importResolution.kind === "file" && importResolution.filePath === corePath
	}

	// a value import, or an import that names the module's adapter type
	const isImportingValue = toNamedImports(fileText).some(
		({ importPath, names }) => names.length > 0 && isCoreComponentImport(importPath),
	)
	return (
		isImportingValue ||
		toParsedImports(fileText).some(
			({ statementText, importPath }) =>
				ELEMENTS_SPECIFIER_PATTERN.test(statementText) && isCoreComponentImport(importPath),
		)
	)
}

// a stale row, and what both apps define
type ToStaleRowViolationOptions = { name: string; componentPairs: ComponentPairs }

// why a row no longer names an unshared pair or a primitive without a contract: the pair is shared, the primitive has
// a contract, or an app no longer defines the name
function toStaleRowViolation({ name, componentPairs }: ToStaleRowViolationOptions): string {
	// a pair both apps now share, and a primitive that now has a contract
	const { sharedNames, contracts, webFiles, mobileFiles } = componentPairs
	if (sharedNames.has(name)) {
		return `${PARITY_INVENTORY_PATH} lists ${name}, which both apps now share through ${toCorePath(name)}. retire the row`
	}
	if (contracts.has(name)) {
		return `${PARITY_INVENTORY_PATH} lists ${name}, which now has a Nightshift contract. retire the row`
	}

	// the apps that no longer define the name
	const missingApps = [
		{ appFolder: WEB_APP_FOLDER, appFiles: webFiles },
		{ appFolder: MOBILE_APP_FOLDER, appFiles: mobileFiles },
	]
		.filter(({ appFiles }) => !appFiles.componentFiles.has(name) && !appFiles.primitiveFiles.has(name))
		.map(({ appFolder }) => appFolder)
	if (missingApps.length > 0) {
		const defineVerb = missingApps.length === 1 ? "defines" : "define"
		return `${PARITY_INVENTORY_PATH} lists ${name}, which ${missingApps.join(" and ")} no longer ${defineVerb}. retire the row`
	}

	// a name that one app keeps as a primitive and the other as a component
	return `${PARITY_INVENTORY_PATH} lists ${name}, which is a primitive in one app and a component in the other. retire the row`
}

// the core module a pair of that name would share
function toCorePath(componentName: string): string {
	return `${CORE_COMPONENTS_FOLDER}/${componentName}.tsx`
}
