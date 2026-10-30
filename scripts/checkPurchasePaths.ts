// the purchase guard's rules: the app reaches no checkout or portal capability, and no file under the app's own folder
// names the plans path or a purchase label, except the files listed with a reason

import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { isShippedFile, toAppReachedCapabilities } from "./clientParity"
import { isInsideFolder, MOBILE_APP_FOLDER, type SourceFile } from "./workspaces"

// the capabilities that start a purchase or open billing management
export const PURCHASE_CAPABILITIES = ["billingClient.fetchCheckoutUrl", "billingClient.fetchBillingPortalUrl"]

// the app files that may name the plans path or a purchase label, each with the reason
export const PURCHASE_PATH_EXCEPTIONS: Record<string, string> = {
	"apps/mobile/app/plans.tsx": "the read-only Plans screen, which a visitor's sign-up returns to",
	"apps/mobile/src/platformPath.ts": "maps the web's plans url onto the read-only Plans screen",
	"apps/mobile/src/nativeIntent.ts": "names the billing path among the signed-in paths a visitor's link waits on",
	"apps/mobile/src/sessionReturnPath.ts": "returns a visitor to the Plans screen after sign-up",
}

// the text a file may not hold: the plans path as a quoted or template path, and each purchase label as a quoted
// string or a rendered text
const PURCHASE_TEXT_PATTERNS = [
	new RegExp(`["'\`}]${PLANS_PATH}(["'\`/?])`),
	...Object.values(PURCHASE_COPY).map((label) => new RegExp(`["'\`>]${escapeRegExp(label)}["'\`<]`)),
]

/**
 * Returns the purchase guard's violations over the source files, each named with its file: a reached purchase
 * capability, and an app file outside the exceptions that names the plans path or a purchase label.
 */
export function checkPurchasePaths(sourceFiles: SourceFile[]): string[] {
	const violations: string[] = []

	// the two capabilities, through the app's own imports and the shared packages
	const reachedCapabilities = toAppReachedCapabilities({ sourceFiles, appFolder: MOBILE_APP_FOLDER })
	for (const capability of PURCHASE_CAPABILITIES) {
		const reachingFile = reachedCapabilities.get(capability)
		if (reachingFile) {
			violations.push(`${capability} is reached by the app through ${reachingFile}. the app offers no purchase`)
		}
	}

	// the plans path and the purchase labels in the app's own files, outside tests and stories
	for (const sourceFile of sourceFiles) {
		if (!isGuardedAppFile(sourceFile.filePath) || PURCHASE_PATH_EXCEPTIONS[sourceFile.filePath]) {
			continue
		}
		const codeText = toCodeText(sourceFile.fileText)
		const matchedPattern = PURCHASE_TEXT_PATTERNS.find((pattern) => pattern.test(codeText))
		if (matchedPattern) {
			violations.push(
				`${sourceFile.filePath} names ${matchedPattern.source}. the app offers no purchase, so drop the link or label, or list the file in scripts/checkPurchasePaths.ts with its reason`,
			)
		}
	}
	return violations
}

// an app source file the text rule reads: under the app folder and shipped
function isGuardedAppFile(filePath: string): boolean {
	return isInsideFolder(filePath, MOBILE_APP_FOLDER) && isShippedFile(filePath)
}

// a file's text without its comments
function toCodeText(fileText: string): string {
	return fileText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

// a label as a literal inside a pattern
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
