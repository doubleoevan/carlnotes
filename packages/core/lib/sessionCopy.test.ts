import { expect, test } from "bun:test"
import { CLOSE_ACCOUNT_CONFIRMATION, toCloseAccountCopy } from "./sessionCopy"

// a free user and a Stripe subscriber read the canceled plan, and neither names a store
test("toCloseAccountCopy cancels a free or Stripe plan", () => {
	for (const provider of [null, "stripe"] as const) {
		const closeAccountCopy = toCloseAccountCopy(provider)
		expect(closeAccountCopy.storeProvider).toBeNull()
		expect(closeAccountCopy.sectionText).toContain("Any paid plan is canceled.")
		expect(closeAccountCopy.confirmationBody).toBe(CLOSE_ACCOUNT_CONFIRMATION.body)
	}
})

// a store subscriber is told the store keeps billing, in the section and the confirmation alike
test("toCloseAccountCopy names the store that keeps billing a store plan", () => {
	const closeAccountCopy = toCloseAccountCopy("play_store")
	expect(closeAccountCopy.storeProvider).toBe("play_store")
	expect(closeAccountCopy.sectionText).toContain("keeps billing through Google Play until you cancel it there.")
	expect(closeAccountCopy.confirmationBody).toContain("keeps billing through Google Play")
})
