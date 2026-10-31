import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { User } from "lucide-react"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useSearchParams } from "@/hooks/useSearchParams"
import { PAGE_CLASS, PAGE_HEADER_CLASS, PAGE_TITLE_CLASS } from "@/lib/styleClasses"

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

	if (!session) {
		return null
	}

	// the username row's user from the session for the user's own page or the payload from an admin's link
	const user = isOwnView ? toSessionProfileIdentity(session.user) : activity?.user
	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the plan button to the right */}
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<User className="size-6" />
					Account
				</h1>
				{isOwnView && billing && <PlanButton billing={billing} />}
			</div>
			{/* the user whose account this is with a link to their profile */}
			{user && <UserProfileLink user={user} className="mt-2 text-sm" />}
			<div className="mt-6 space-y-6">
				{billing && activity ? (
					<AccountBudget billing={billing} activity={activity} isReadOnly={!isOwnView} />
				) : query.isError ? (
					<Button variant="outline" onClick={() => void query.refetch()}>
						Retry loading account
					</Button>
				) : (
					<PageSkeleton kind="account" />
				)}
				{/* account settings only show for the user's own page */}
				{isOwnView && <AccountSettings provider={billing?.provider ?? null} />}
			</div>
		</main>
	)
}
