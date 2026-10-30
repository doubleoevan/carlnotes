// the route registry matches the api: every entry's method and path is a registered route, every entry's
// capability is a function its client module exports, and the entries without a contract fixture are listed
import { expect, test } from "bun:test"
import { API_ROUTE_CONTRACTS, API_ROUTE_HELPERS, toCapabilityKey } from "@carlnotes/contracts/apiRouteContracts"
import { apiRoute } from "./api"
import { CONTRACT_FIXTURES } from "./contractFixtures"

// the routes the api registers, as "METHOD path"
const registeredRoutes = new Set(apiRoute.routes.map((route) => `${route.method} ${route.path}`))

test("every registry entry names a registered route", () => {
	const missingRoutes = Object.entries(API_ROUTE_CONTRACTS)
		.filter(([, contract]) => !registeredRoutes.has(`${contract.method} ${contract.path}`))
		.map(([key, contract]) => `${key}: ${contract.method} ${contract.path}`)
	expect(missingRoutes).toEqual([])
})

test("every registry entry and helper names a function its client module exports", async () => {
	// each key's module text, read once
	const moduleTexts = new Map<string, string>()
	const missingExports: string[] = []
	for (const entryKey of [...Object.keys(API_ROUTE_CONTRACTS), ...API_ROUTE_HELPERS]) {
		// the module's text, then the export in it
		const [moduleName, exportName] = toCapabilityKey(entryKey).split(".")
		const moduleText = moduleTexts.get(moduleName ?? "") ?? (await readClientModule(moduleName ?? ""))
		moduleTexts.set(moduleName ?? "", moduleText)

		// an entry whose function is gone
		if (!new RegExp(`export (?:async )?(?:function|const) ${exportName}\\b`).test(moduleText)) {
			missingExports.push(entryKey)
		}
	}
	expect(missingExports).toEqual([])
})

// the registry entries with a response and no contract fixture, printed so the gap stays visible without failing
test("the registry entries without a contract fixture are listed", () => {
	const keysWithoutFixture = Object.entries(API_ROUTE_CONTRACTS)
		.filter(([key, contract]) => contract.response && !(key in CONTRACT_FIXTURES))
		.map(([key]) => key)
	console.log(
		`contract fixtures: ${keysWithoutFixture.length} routes without a fixture: ${keysWithoutFixture.join(", ")}`,
	)
})

// a client module's text, or "" for a module that does not exist
async function readClientModule(moduleName: string): Promise<string> {
	const moduleFile = Bun.file(`packages/client/${moduleName}.ts`)
	return (await moduleFile.exists()) ? moduleFile.text() : ""
}
