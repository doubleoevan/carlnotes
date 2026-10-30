// fail if a declared, unretired app version has no snapshot, if the current app reaches a capability with no registry
// entry, or if the current registry would break a build frozen on any unretired snapshot: a response an installed
// reader cannot read, or a request it sends that is no longer accepted

import { readdirSync, readFileSync } from "node:fs"
import { API_ROUTE_CONTRACTS, toCapabilityKey } from "@carlnotes/contracts/apiRouteContracts"
import { toAppReachedCapabilities } from "./clientParity"
import { compareSnapshotRoute } from "./contractCompatibility"
import {
	CONTRACTS_FOLDER,
	type ContractRelease,
	RELEASES_PATH,
	readMobileAppVersion,
	readSnapshot,
	toContractSnapshot,
	toMissingSnapshotViolations,
	toSnapshotPath,
} from "./contractFreeze"
import { readAppSourceFiles } from "./sourceFiles"
import { MOBILE_APP_FOLDER } from "./workspaces"

// the declared releases and the snapshots on disk
const releases = JSON.parse(readFileSync(RELEASES_PATH, "utf8")) as ContractRelease[]
const retiredVersions = new Set(
	releases.filter((release) => release.status === "retired").map((release) => release.version),
)
const snapshotVersions = readdirSync(CONTRACTS_FOLDER)
	.filter((fileName) => fileName.endsWith(".json") && fileName !== "releases.json")
	.map((fileName) => fileName.slice(0, -".json".length))

// every declared, unretired version has a snapshot
const violations = toMissingSnapshotViolations(releases, snapshotVersions)

// every capability the current app reaches has a registry entry
const appVersion = readMobileAppVersion()
const sourceFiles = readAppSourceFiles()
toContractSnapshot({
	appVersion,
	frozenAt: "",
	reachedCapabilityKeys: toAppReachedCapabilities({ sourceFiles, appFolder: MOBILE_APP_FOLDER }).keys(),
})

// the whole registry as it is now, so a route an older build still calls compares after the current app stopped
// calling it
const currentSnapshot = toContractSnapshot({
	appVersion,
	frozenAt: "",
	reachedCapabilityKeys: Object.keys(API_ROUTE_CONTRACTS).map(toCapabilityKey),
})

// every live snapshot stays readable and sendable
const liveVersions = snapshotVersions.filter((version) => !retiredVersions.has(version)).sort()
for (const version of liveVersions) {
	// each frozen route against the current one
	const frozenSnapshot = readSnapshot(toSnapshotPath(version))
	for (const [key, frozenRoute] of Object.entries(frozenSnapshot.routes)) {
		for (const issue of compareSnapshotRoute(key, frozenRoute, currentSnapshot.routes[key])) {
			violations.push(`against ${version}: ${issue}`)
		}
	}
}

// report
if (violations.length > 0) {
	console.error(`contract freeze: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}
console.log(
	`contract freeze: ${liveVersions.length} live snapshot(s) stay compatible${liveVersions.length > 0 ? ` (${liveVersions.join(", ")})` : ""}`,
)
