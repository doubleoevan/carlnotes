// the purchase guard over fixture files: a reached checkout capability, a plans path in an app file, a listed
// exception, and a shared module the app renders without the purchase handler
import { expect, test } from "bun:test"
import { checkPurchasePaths } from "./checkPurchasePaths"
import type { SourceFile } from "./workspaces"

// the billing client with its two purchase capabilities and one read the app keeps
const BILLING_CLIENT: SourceFile = {
	filePath: "packages/client/billingClient.ts",
	fileText:
		"export async function fetchCheckoutUrl(): Promise<void> {}\nexport async function fetchBillingPortalUrl(): Promise<void> {}\nexport async function fetchBillingState(): Promise<void> {}\n",
}

// a shared card that names the purchase label and renders it only with a handler
const SHARED_CARD: SourceFile = {
	filePath: "packages/core/components/PlanCard.tsx",
	fileText: 'export const label = "Upgrade"\n',
}

// the read-only Plans screen, a listed exception
const PLANS_SCREEN: SourceFile = {
	filePath: "apps/mobile/app/plans.tsx",
	fileText:
		'import { fetchBillingState } from "@carlnotes/client/billingClient"\nimport { PlanCard } from "@carlnotes/core/components/PlanCard"\nexport const returnPath = "/plans"\n',
}

test("an app that reaches no purchase capability and names no purchase passes", () => {
	expect(checkPurchasePaths([BILLING_CLIENT, SHARED_CARD, PLANS_SCREEN])).toEqual([])
})

test("a reached checkout capability fails", () => {
	const accountScreen: SourceFile = {
		filePath: "apps/mobile/app/account.tsx",
		fileText: 'import { fetchCheckoutUrl } from "@carlnotes/client/billingClient"\n',
	}
	const violations = checkPurchasePaths([BILLING_CLIENT, accountScreen])
	expect(violations).toHaveLength(1)
	expect(violations[0]).toContain(
		"billingClient.fetchCheckoutUrl is reached by the app through apps/mobile/app/account.tsx",
	)
})

test("a plans path or a purchase label in an unlisted app file fails, and a story does not", () => {
	const settingsCard: SourceFile = {
		filePath: "apps/mobile/src/components/topic/TopicSettingsCard.tsx",
		fileText: `const href = \`\${"SITE_URL"}/plans\`\n`,
	}
	const scanButton: SourceFile = {
		filePath: "apps/mobile/src/components/topic/TopicScanButton.tsx",
		fileText: '{ text: "See plans" }\n',
	}
	const story: SourceFile = {
		filePath: "apps/mobile/src/components/account/PlanCard.stories.tsx",
		fileText: 'export const label = "Upgrade"\n',
	}
	const violations = checkPurchasePaths([BILLING_CLIENT, settingsCard, scanButton, story])
	expect(violations.map((violation) => violation.split(" ")[0])).toEqual([settingsCard.filePath, scanButton.filePath])
})
