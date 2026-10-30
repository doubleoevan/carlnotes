// fail if the web reaches an api client capability that no mobile screen reaches and the inventory does not list with
// a reason, or if the inventory lists a capability the app now reaches, one that no longer exists, or one with no
// reason

import { readFileSync } from "node:fs"
import { checkClientParity, PARITY_INVENTORY_PATH, parseParityInventory } from "./clientParity"
import { readAppSourceFiles } from "./sourceFiles"

// run the rules over both apps and the packages they import, against the inventory, and report
const clientParityReport = checkClientParity({
	sourceFiles: readAppSourceFiles(),
	inventoryEntries: parseParityInventory(readFileSync(PARITY_INVENTORY_PATH, "utf8")),
})
if (clientParityReport.violations.length > 0) {
	console.error(
		`client parity: ${clientParityReport.violations.length} violation(s)\n${clientParityReport.violations.join("\n")}`,
	)
	process.exit(1)
}

// the capabilities the app alone reaches, as information
const mobileOnlyLine =
	clientParityReport.mobileOnlyCapabilities.length > 0
		? ` mobile alone reaches ${clientParityReport.mobileOnlyCapabilities.join(", ")}.`
		: ""
console.log(
	`client parity: ${clientParityReport.webOnlyCapabilities.length} web-only capabilities, every one listed.${mobileOnlyLine}`,
)
