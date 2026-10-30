// write contracts/<app-version>.json: every route the app reaches as standalone JSON Schema, or with --check fail
// when a fresh freeze differs from the file

import { existsSync, writeFileSync } from "node:fs"
import { toAppReachedCapabilities } from "./clientParity"
import {
	isSameSnapshot,
	readMobileAppVersion,
	readSnapshot,
	toContractSnapshot,
	toSnapshotPath,
} from "./contractFreeze"
import { readAppSourceFiles } from "./sourceFiles"
import { MOBILE_APP_FOLDER } from "./workspaces"

// freeze what the app reaches today at the declared version
const appVersion = readMobileAppVersion()
const sourceFiles = readAppSourceFiles()
const snapshot = toContractSnapshot({
	appVersion,
	frozenAt: new Date().toISOString().slice(0, 10),
	reachedCapabilityKeys: toAppReachedCapabilities({ sourceFiles, appFolder: MOBILE_APP_FOLDER }).keys(),
})
const snapshotPath = toSnapshotPath(appVersion)
const routeCount = Object.keys(snapshot.routes).length

// compare with the file, or write it
if (process.argv.includes("--check")) {
	// a missing or stale file fails the check
	if (!existsSync(snapshotPath)) {
		console.error(`contract freeze: ${snapshotPath} is missing. run bun run contract:freeze`)
		process.exit(1)
	}

	// a stale file names the fix
	if (!isSameSnapshot(readSnapshot(snapshotPath), snapshot)) {
		console.error(`contract freeze: ${snapshotPath} differs from a fresh freeze. run bun run contract:freeze`)
		process.exit(1)
	}

	// the file matches
	console.log(`contract freeze: ${snapshotPath} matches, ${routeCount} routes`)
} else {
	writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, "\t")}\n`)
	console.log(`contract freeze: wrote ${snapshotPath}, ${routeCount} routes`)
}
