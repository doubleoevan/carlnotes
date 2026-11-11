import { authClient } from "@carlnotes/client/authClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { cn } from "@carlnotes/nightshift/classNames"
import { User } from "lucide-react-native"
import { View } from "react-native"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { AppVersionLine } from "@/components/account/AppVersionLine"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"

/**
 * Loads the signed-in account's billing and activity with the same settings as the web account.
 */
export default function AccountScreen() {
	// isolate account data and refresh the complete budget together
	const { data: session } = authClient().useSession()
	const query = useAccount({ userId: session?.user.id })
	return (
		<PageScreen
			title="Account"
			icon={User}
			// the plan button, or its placeholder at the button's height while the budget loads
			action={
				query.data ? (
					<PlanButton billing={query.data.billing} />
				) : (
					!query.isError && <View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-32 rounded-md")} />
				)
			}
			byline={session && <UserProfileLink user={toSessionProfileIdentity(session.user)} />}
			onRefresh={() => void query.refetch()}
			isRefreshing={query.isRefetching}
		>
			{query.data ? (
				<AccountBudget {...query.data} />
			) : query.isError ? (
				<LoadFailedNotice
					message="Account didn't load."
					retryLabel="Retry loading account"
					onRetry={() => void query.refetch()}
				/>
			) : (
				// an admin's own budget lists no monthly budget cutoffs unless it has an override
				<PageSkeleton kind="account" hasMonthlyBudgetCutoffs={!isAdminRole(session?.user.role)} />
			)}
			<AccountSettings provider={query.data?.billing.provider ?? null} />
			{/* app version */}
			<AppVersionLine />
		</PageScreen>
	)
}
