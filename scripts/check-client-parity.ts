// fail if the web reaches an api client capability that no mobile screen reaches and the inventory does not list with
// a reason, or if the inventory lists a capability the app now reaches, one that no longer exists, or one with no
// reason

import { readFileSync } from "node:fs"
import { CLIENT_INVENTORY_HEADING, checkClientParity } from "./clientParity"
import { PARITY_INVENTORY_PATH, parseInventoryTable } from "./parityInventory"
import { readAppSourceFiles } from "./sourceFiles"

// run the rules over both apps and the packages they import, against the inventory, and report
const clientParityReport = checkClientParity({
	sourceFiles: readAppSourceFiles(),
	inventoryRows: parseInventoryTable({
		markdown: readFileSync(PARITY_INVENTORY_PATH, "utf8"),
		heading: CLIENT_INVENTORY_HEADING,
	}),
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
