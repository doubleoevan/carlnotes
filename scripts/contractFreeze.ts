// the contract freeze's shared logic: the snapshot of every route the app reaches, as standalone JSON Schema from the
// registry, the version it is frozen at, the reads of the app version and a snapshot file, and the comparison of a
// fresh freeze with the file on disk

import { readFileSync } from "node:fs"
import {
	API_ROUTE_CONTRACTS,
	API_ROUTE_HELPERS,
	type ApiRouteContract,
	toCapabilityKey,
} from "@carlnotes/contracts/apiRouteContracts"
import { z } from "zod"
import type { ContractSnapshot, JsonSchema, SnapshotRoute } from "./contractCompatibility"
import { MOBILE_APP_CONFIG_PATH } from "./workspaces"

// where the snapshots and the release file live
export const CONTRACTS_FOLDER = "contracts"
export const RELEASES_PATH = `${CONTRACTS_FOLDER}/releases.json`

// one declared app version: submitted to a store, released there, or retired once its traffic drained
export type ContractRelease = {
	version: string
	status: "submitted" | "released" | "retired"
	platforms: string[]
	date: string
}

/**
 * Returns one line per declared, unretired app version that has no snapshot on disk, naming the file to freeze.
 */
export function toMissingSnapshotViolations(releases: ContractRelease[], snapshotVersions: string[]): string[] {
	return releases
		.filter((release) => release.status !== "retired" && !snapshotVersions.includes(release.version))
		.map(
			(release) =>
				`${release.version} is ${release.status} and has no ${CONTRACTS_FOLDER}/${release.version}.json. run bun run contract:freeze at that version`,
		)
}

type ToContractSnapshotOptions = {
	appVersion: string
	frozenAt: string
	// the capability keys the app reaches, from the client parity walk
	reachedCapabilityKeys: Iterable<string>
	contracts?: Record<string, ApiRouteContract>
	helpers?: readonly string[]
}

/**
 * Returns the snapshot for an app version: every registry entry whose capability the app reaches, each as JSON
 * Schema. Throws an error naming each reached capability that has no entry and is not a helper.
 */
export function toContractSnapshot({
	appVersion,
	frozenAt,
	reachedCapabilityKeys,
	contracts = API_ROUTE_CONTRACTS,
	helpers = API_ROUTE_HELPERS,
}: ToContractSnapshotOptions): ContractSnapshot {
	// every reached capability has an entry or is a helper
	const registeredCapabilityKeys = new Set(Object.keys(contracts).map(toCapabilityKey))
	const reachedKeys = [...reachedCapabilityKeys]
	const unregisteredKeys = reachedKeys.filter((key) => !registeredCapabilityKeys.has(key) && !helpers.includes(key))
	if (unregisteredKeys.length > 0) {
		throw new Error(
			`the app reaches ${unregisteredKeys.length} capability(ies) with no registry entry: ${unregisteredKeys.join(", ")}. add each to packages/contracts/apiRouteContracts.ts, or to API_ROUTE_HELPERS if it calls no route`,
		)
	}

	// the reached entries, in key order
	const reachedKeySet = new Set(reachedKeys)
	const routes: Record<string, SnapshotRoute> = {}
	for (const entryKey of Object.keys(contracts).sort()) {
		if (reachedKeySet.has(toCapabilityKey(entryKey))) {
			routes[entryKey] = toSnapshotRoute(contracts[entryKey] as ApiRouteContract)
		}
	}

	return { appVersion, frozenAt, routes }
}

// one entry as JSON Schema: the request parts at their input shape, the response at its output shape with every
// object open to new properties
function toSnapshotRoute(contract: ApiRouteContract): SnapshotRoute {
	// each request part the route takes, at its input shape
	const request: SnapshotRoute["request"] = {}
	if (contract.params) {
		request.params = toJsonSchema(contract.params, "input")
	}
	if (contract.query) {
		request.query = toJsonSchema(contract.query, "input")
	}

	// the body, as json or a multipart form
	if (contract.body && "json" in contract.body) {
		request.body = toJsonSchema(contract.body.json, "input")
	}
	if (contract.body && "multipart" in contract.body) {
		request.multipart = toJsonSchema(contract.body.multipart, "input")
	}

	// the route with its response and its stream kind
	const snapshotRoute: SnapshotRoute = { method: contract.method, path: contract.path, request }
	if (contract.response) {
		snapshotRoute.response = withOpenObjects(toJsonSchema(contract.response, "output"))
	}
	if (contract.stream) {
		snapshotRoute.stream = contract.stream
	}

	return snapshotRoute
}

// a schema as draft 2020-12 JSON Schema, without the document header, with a transform or a custom check as any
function toJsonSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
	const { $schema: _header, ...jsonSchema } = z.toJSONSchema(schema, {
		io,
		target: "draft-2020-12",
		unrepresentable: "any",
		cycles: "ref",
	}) as JsonSchema & { $schema?: string }
	return jsonSchema
}

// the schema with `additionalProperties: false` removed from every object, so a new property passes
function withOpenObjects(schema: JsonSchema): JsonSchema {
	// walk every nested schema
	const openSchema: JsonSchema = { ...schema }
	if (openSchema.additionalProperties === false) {
		delete openSchema.additionalProperties
	}
	for (const keyword of ["properties", "$defs"] as const) {
		const nested = openSchema[keyword]
		if (nested) {
			openSchema[keyword] = Object.fromEntries(
				Object.entries(nested).map(([name, value]) => [name, withOpenObjects(value)]),
			)
		}
	}

	// a list's items and a record's values
	for (const keyword of ["items", "additionalProperties"] as const) {
		const nested = openSchema[keyword]
		if (typeof nested === "object" && nested !== null) {
			openSchema[keyword] = withOpenObjects(nested as JsonSchema)
		}
	}

	// each union option
	for (const keyword of ["anyOf", "oneOf"] as const) {
		const options = openSchema[keyword]
		if (options) {
			openSchema[keyword] = options.map(withOpenObjects)
		}
	}
	return openSchema
}

/**
 * Returns the app version `apps/mobile/app.config.ts` declares, read from its text so the config's native plugins
 * never load.
 */
export function toAppVersion(appConfigText: string): string {
	const versionMatch = appConfigText.match(/^\s*version:\s*"([^"]+)"/m)
	if (!versionMatch?.[1]) {
		throw new Error(`${MOBILE_APP_CONFIG_PATH} declares no version`)
	}
	return versionMatch[1]
}

/**
 * Returns the app version the Expo config on disk declares.
 */
export function readMobileAppVersion(): string {
	return toAppVersion(readFileSync(MOBILE_APP_CONFIG_PATH, "utf8"))
}

/**
 * Returns the snapshot a file holds.
 */
export function readSnapshot(path: string): ContractSnapshot {
	return JSON.parse(readFileSync(path, "utf8")) as ContractSnapshot
}

/**
 * Returns the snapshot file path for an app version.
 */
export function toSnapshotPath(appVersion: string): string {
	return `${CONTRACTS_FOLDER}/${appVersion}.json`
}

/**
 * Returns true if two snapshots freeze the same routes, whenever each was written.
 */
export function isSameSnapshot(left: ContractSnapshot, right: ContractSnapshot): boolean {
	return left.appVersion === right.appVersion && JSON.stringify(left.routes) === JSON.stringify(right.routes)
}
