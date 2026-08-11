import type { ActivityResponse, BillingState } from "@shared/contracts"
import { useEffect, useState } from "react"
import { AccountBudget } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { fetchActivity } from "@/lib/activityClient"
import { authClient } from "@/lib/authClient"
import { fetchBillingState } from "@/lib/billingClient"
/**
 * The account page: payment notice. the monthly spend against budget, the scan usage, and the current plan
 */
export function AccountPage() {
	const { data: session } = authClient.useSession()
	const [billing, setBilling] = useState<BillingState | null>(null)
	const [activity, setActivity] = useState<ActivityResponse | null>(null)

	// the billing state drives the panel, and the activity payload carries the spend meter's numbers
	useEffect(() => {
		if (session) {
			fetchBillingState().then(setBilling)
			fetchActivity().then(setActivity)
		}
	}, [session])

	if (!session) {
		return <main className="mx-auto max-w-4xl px-safe py-10">Please log in to manage your account.</main>
	}

	return (
		<main className="mx-auto max-w-4xl px-safe py-10">
			<h1 className="font-display text-2xl">Account</h1>
			<div className="mt-6 space-y-6">
				{billing ? <AccountBudget billing={billing} activity={activity} /> : <CoffeeLoading />}
				<AccountSettings />
			</div>
		</main>
	)
}
