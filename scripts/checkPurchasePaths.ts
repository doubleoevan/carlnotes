// the purchase guard's rules: the app reaches no checkout or portal capability, and a file under the app's own folder
// names the plans path or a purchase label only if it reads the storefront purchase rules, or is listed with a reason

import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { isShippedFile, toAppReachedCapabilities } from "./clientParity"
import { isInsideFolder, MOBILE_APP_FOLDER, type SourceFile } from "./workspaces"

// the capabilities that start a purchase or open billing management
export const PURCHASE_CAPABILITIES = ["billingClient.fetchCheckoutUrl", "billingClient.fetchBillingPortalUrl"]

// the modules that decide whether the app offers a purchase. a file importing one may name the plans path or a label
export const PURCHASE_RULES_MODULES = [
	"@carlnotes/core/stores/purchaseOffersStore",
	"@carlnotes/core/lib/storefrontPurchaseRules",
]

// the app files that may name the plans path or a purchase label without reading the rules, each with the reason
export const PURCHASE_PATH_EXCEPTIONS: Record<string, string> = {
	"apps/mobile/src/platformPath.ts": "maps the web's plans url onto the Plans screen",
	"apps/mobile/src/nativeIntent.ts": "names the billing path among the signed-in paths a visitor's link waits on",
	"apps/mobile/src/sessionReturnPath.ts": "returns a visitor to the Plans screen after sign-up",
	"apps/mobile/src/components/account/PlansLink.tsx":
		"the plans link, which each notice shows only if its offers allow",
}

// the text a file may not hold: the plans path as a quoted or template path, each purchase label as a quoted string
// or a rendered text, and the names of the path, the labels, and the app's plans link
const PURCHASE_TEXT_PATTERNS = [
	new RegExp(`["'\`}]${PLANS_PATH}(["'\`/?])`),
	...Object.values(PURCHASE_COPY).map((label) => new RegExp(`["'\`>]${escapeRegExp(label)}["'\`<]`)),
	/\b(?:PLANS_PATH|PURCHASE_COPY|PlansLink)\b/,
]

/**
 * Returns the purchase guard's violations over the source files, each named with its file: a reached purchase
 * capability, and an app file outside the exceptions that names the plans path or a purchase label without importing
 * the purchase offers store or the storefront purchase rules.
 */
export function checkPurchasePaths(sourceFiles: SourceFile[]): string[] {
	const violations: string[] = []

	// the two capabilities, through the app's own imports and the shared packages
	const reachedCapabilities = toAppReachedCapabilities({ sourceFiles, appFolder: MOBILE_APP_FOLDER })
	for (const capability of PURCHASE_CAPABILITIES) {
		const reachingFile = reachedCapabilities.get(capability)
		if (reachingFile) {
			violations.push(
				`${capability} is reached by the app through ${reachingFile}. the app sells through its store, never checkout or the portal`,
			)
		}
	}

	// the plans path and the purchase labels in the app's own files that skip the rules, outside tests and stories
	for (const sourceFile of sourceFiles) {
		if (!isGuardedAppFile(sourceFile.filePath) || PURCHASE_PATH_EXCEPTIONS[sourceFile.filePath]) {
			continue
		}

		// the first pattern the file's code matches, outside its comments, if the code imports no rules module
		const codeText = toCodeText(sourceFile.fileText)
		if (hasPurchaseRulesImport(codeText)) {
			continue
		}
		const matchedPattern = PURCHASE_TEXT_PATTERNS.find((pattern) => pattern.test(codeText))
		if (matchedPattern) {
			violations.push(
				`${sourceFile.filePath} names ${matchedPattern.source} without reading the storefront purchase rules. show it only when usePurchaseOffers from ${PURCHASE_RULES_MODULES[0]} offers a purchase, or list the file in scripts/checkPurchasePaths.ts with its reason`,
			)
		}
	}
	return violations
}

// an app source file the text rule reads: under the app folder and shipped
function isGuardedAppFile(filePath: string): boolean {
	return isInsideFolder(filePath, MOBILE_APP_FOLDER) && isShippedFile(filePath)
}

// whether a file's code imports the purchase offers store or the storefront purchase rules
function hasPurchaseRulesImport(codeText: string): boolean {
	return PURCHASE_RULES_MODULES.some((purchaseRulesModule) => codeText.includes(`from "${purchaseRulesModule}"`))
}

// a file's text without its comments
function toCodeText(fileText: string): string {
	return fileText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

// a label as a literal inside a pattern
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
