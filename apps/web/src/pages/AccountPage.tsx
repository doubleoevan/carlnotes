import { authClient } from "@carlnotes/client/authClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { type BillingState, type ProfileIdentity, toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { cn } from "@carlnotes/nightshift/classNames"
import { User } from "lucide-react"
import { useEffect } from "react"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { UserProfileLinkSkeleton } from "@/components/common/UserProfileLinkSkeleton"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useSearchParams } from "@/hooks/useSearchParams"
import { PAGE_CLASS, PAGE_HEADER_CLASS, PAGE_TITLE_CLASS, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

/**
 * The account page: the payment notice, the monthly spend against budget, the scan usage, and the current plan.
 * An admin may view another user's account as read-only without the upgrade button or settings.
 */
export function AccountPage() {
	usePageTitle("Account")
	const { data: session } = authClient().useSession()

	// the user whose account the page shows, the userId param's user or else the signed-in user
	const searchParams = useSearchParams()
	const viewedUserId = searchParams.get("userId") ?? undefined
	const isOwnView = !viewedUserId || viewedUserId === session?.user.id

	// load the same complete budget and retry state as the native account
	const query = useAccount({ userId: session?.user.id, viewedUserId })
	const { billing, activity } = query.data ?? {}

	// the budget changes the page's height once it loads, so scroll to a linked section again after it does
	const isAccountLoaded = Boolean(billing && activity)
	useEffect(() => {
		if (isAccountLoaded && window.location.hash) {
			document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
		}
	}, [isAccountLoaded])

	if (!session) {
		return null
	}

	// the username row's user from the session for the user's own page or the payload from an admin's link
	const user = isOwnView ? toSessionProfileIdentity(session.user) : activity?.user
	// an admin's own budget lists no monthly budget cutoffs unless it has an override, and every other budget lists them
	const hasMonthlyBudgetCutoffs = !isOwnView || !isAdminRole(session.user.role)
	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the plan button to the right */}
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<User className="size-6" />
					Account
				</h1>
				{isOwnView && <AccountPlanAction billing={billing} isLoadFailed={query.isError} />}
			</div>
			{/* the user whose account this is with a link to their profile, or the link's placeholder while an admin's
			    view of another user's account loads */}
			<AccountUserLink user={user} isLoadFailed={query.isError} />
			<div className="mt-6 space-y-6">
				{billing && activity ? (
					<AccountBudget billing={billing} activity={activity} isReadOnly={!isOwnView} />
				) : query.isError ? (
					<Button variant="outline" onClick={() => void query.refetch()}>
						Retry loading account
					</Button>
				) : (
					<PageSkeleton kind="account" hasMonthlyBudgetCutoffs={hasMonthlyBudgetCutoffs} />
				)}
				{/* account settings only show for the user's own page */}
				{isOwnView && <AccountSettings provider={billing?.provider ?? null} />}
			</div>
		</main>
	)
}

// the link to the profile of the user whose account this is, or its placeholder while that user loads
function AccountUserLink({ user, isLoadFailed }: { user: ProfileIdentity | undefined; isLoadFailed: boolean }) {
	if (user) {
		return <UserProfileLink user={user} className="mt-2 text-sm" />
	}
	if (isLoadFailed) {
		return null
	}
	return <UserProfileLinkSkeleton className="mt-2 text-sm" />
}

// the plan button, or its placeholder at the button's height while the budget loads
function AccountPlanAction({ billing, isLoadFailed }: { billing: BillingState | undefined; isLoadFailed: boolean }) {
	if (billing) {
		return <PlanButton billing={billing} />
	}
	if (isLoadFailed) {
		return null
	}
	return <div aria-hidden="true" className={cn(SKELETON_SHAPE_CLASS, "h-9 w-32 rounded-md")} />
}
