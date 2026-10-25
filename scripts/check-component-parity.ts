// fail if a Nightshift component contract lacks an implementation or its story in an app it names, an implementation
// imports no value from its contract, or an app file other than the implementation, a story, or a test imports a
// contract. the rules live in componentParity.ts

import { resolve } from "node:path"
import type { ComponentPlatform } from "@carlnotes/nightshift/componentPlatforms"
import { Glob } from "bun"
import { COMPONENT_CONTRACTS_FOLDER, type ComponentContract, checkComponentParity } from "./componentParity"
import { readSourceFiles } from "./sourceFiles"
import { MOBILE_APP_FOLDER, TEST_FILE_PATTERN, WEB_APP_FOLDER } from "./workspaces"

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

// run the rules over both apps' source files and report
const contracts = await readContracts()
const violations = checkComponentParity({
	contracts,
	sourceFiles: readSourceFiles([WEB_APP_FOLDER, MOBILE_APP_FOLDER]),
})
if (violations.length > 0) {
	console.error(`component parity: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}
console.log(`component parity: ${contracts.length} contracts each have their implementations`)
