import type { ActivityResponse, BillingState } from "@shared/contracts"
import { User } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { fetchActivity } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import { fetchBillingState } from "@/clients/billingClient"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"

/**
 * The account page: the payment notice, the monthly spend against budget, the scan usage, and the current plan.
 * An admin may view another user's account as read-only without the upgrade button or settings.
 */
export function AccountPage() {
	usePageTitle("Account")
	const { data: session } = authClient.useSession()
	const [billing, setBilling] = useState<BillingState | null>(null)
	const [activity, setActivity] = useState<ActivityResponse | null>(null)

	// whose account this shows: the user's own without the param, or a different user for an admin
	const [searchParams] = useSearchParams()
	const viewedUserId = searchParams.get("userId") ?? undefined
	const isOwnView = !viewedUserId || viewedUserId === session?.user.id

	// the billing state drives the panel, and the activity payload includes the budget's numbers
	useEffect(() => {
		if (!session) {
			return
		}
		// switching users clears the last one's numbers, and the flag ignores a response that arrives after the switch
		let isViewCurrent = true
		setBilling(null)
		setActivity(null)
		fetchBillingState(viewedUserId)
			.then((loaded) => isViewCurrent && setBilling(loaded))
			.catch(() => isViewCurrent && setBilling(null))
		fetchActivity(viewedUserId)
			.then((loaded) => isViewCurrent && setActivity(loaded))
			.catch(() => isViewCurrent && setActivity(null))
		return () => {
			isViewCurrent = false
		}
	}, [session, viewedUserId])

	if (!session) {
		return <main className={PAGE_CLASS}>Please log in to manage your account.</main>
	}

	// the username row's user from the session for the user's own page or the payload from an admin's link
	const user = isOwnView
		? {
				userId: session.user.id,
				username: session.user.username,
				avatarSource: session.user.avatarSource ?? null,
			}
		: activity?.user
	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the plan button to the right */}
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-display flex items-center gap-2 text-2xl">
					<User className="size-6" />
					Account
				</h1>
				{isOwnView && billing && <PlanButton billing={billing} />}
			</div>
			{/* the user whose account this is with a link to their profile */}
			{user && <UserProfileLink user={user} className="mt-2 text-sm" />}
			<div className="mt-6 space-y-6">
				{billing ? <AccountBudget billing={billing} activity={activity} isReadOnly={!isOwnView} /> : <CoffeeLoading />}
				{/* account settings only show for the user's own page */}
				{isOwnView && <AccountSettings />}
			</div>
		</main>
	)
}
