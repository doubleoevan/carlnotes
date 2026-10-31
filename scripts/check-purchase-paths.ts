// fail if the mobile app reaches a checkout or portal capability, or an app file outside the listed exceptions names
// the plans path or a purchase label without reading the storefront purchase rules

import { checkPurchasePaths } from "./checkPurchasePaths"
import { readAppSourceFiles } from "./sourceFiles"

// run the rules over both apps and the packages they import, and report
const violations = checkPurchasePaths(readAppSourceFiles())
if (violations.length > 0) {
	console.error(`purchase paths: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}
console.log("purchase paths: the app reaches no checkout or portal and names a purchase only through the rules")
