// fail if a Nightshift component contract lacks an implementation or its story in an app it names, an implementation
// imports no value from its contract, or an app file other than the implementation, a story, or a test imports a
// contract. also fail if both apps define a component of one name that does not share the core component of that
// name, or keep a primitive without a contract, unless apps/mobile/parity.md lists it, and on a stale row. the rules live in
// componentParity.ts and componentInventory.ts

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ComponentPlatform } from "@carlnotes/nightshift/componentPlatforms"
import { Glob } from "bun"
import { COMPONENT_INVENTORY_HEADING, COMPONENT_KINDS, checkComponentInventory } from "./componentInventory"
import { COMPONENT_CONTRACTS_FOLDER, type ComponentContract, checkComponentParity } from "./componentParity"
import { PARITY_INVENTORY_PATH, parseInventoryTable } from "./parityInventory"
import { readAppSourceFiles } from "./sourceFiles"
import { isInsideFolder, MOBILE_APP_FOLDER, TEST_FILE_PATTERN, WEB_APP_FOLDER } from "./workspaces"

// read each contract module's name and the platforms it exports
async function readContracts(): Promise<ComponentContract[]> {
	const contracts: ComponentContract[] = []
	for await (const fileName of new Glob("*.ts").scan({ cwd: COMPONENT_CONTRACTS_FOLDER })) {
		// skip a test beside the contracts
		if (TEST_FILE_PATTERN.test(fileName)) {
			continue
		}

		// read the module's platforms, if it exports a list, and record the contract
		const contractModule = (await import(resolve(COMPONENT_CONTRACTS_FOLDER, fileName))) as { platforms?: unknown }
		const platforms = Array.isArray(contractModule.platforms)
			? (contractModule.platforms as ComponentPlatform[])
			: undefined
		contracts.push({ componentName: fileName.replace(/\.ts$/, ""), platforms })
	}
	return contracts
}

// the contracts, both apps and the packages they import, and the inventory's component rows
const contracts = await readContracts()
const sourceFiles = readAppSourceFiles()
const inventoryRows = parseInventoryTable({
	markdown: readFileSync(PARITY_INVENTORY_PATH, "utf8"),
	heading: COMPONENT_INVENTORY_HEADING,
})

// run the contract rules over the apps' files, and the inventory rules over everything the resolver needs
const appSourceFiles = sourceFiles.filter(
	({ filePath }) => isInsideFolder(filePath, WEB_APP_FOLDER) || isInsideFolder(filePath, MOBILE_APP_FOLDER),
)
const contractViolations = checkComponentParity({ contracts, sourceFiles: appSourceFiles })
const inventoryReport = checkComponentInventory({
	sourceFiles,
	contractNames: contracts.map((contract) => contract.componentName),
	inventoryRows,
})

// report every violation from both rules
const violations = [...contractViolations, ...inventoryReport.violations]
if (violations.length > 0) {
	console.error(`component parity: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}

// the counts both rules found
const { pairCount, sharedCount, listedCountByKind, listedPrimitiveCount } = inventoryReport.counts
const listedCount = COMPONENT_KINDS.reduce((total, kind) => total + listedCountByKind[kind], 0)
const kindCounts = COMPONENT_KINDS.map((kind) => `${listedCountByKind[kind]} ${kind}`).join(", ")
console.log(`component parity: ${contracts.length} contracts each have their implementations`)
console.log(
	`component parity: ${pairCount} components both apps define. ${sharedCount} share their core component, ${listedCount} listed (${kindCounts}). ${listedPrimitiveCount} ${listedPrimitiveCount === 1 ? "primitive" : "primitives"} without a contract, listed`,
)
