import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { User } from "lucide-react-native"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { AppVersionLine } from "@/components/account/AppVersionLine"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"

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
			action={query.data && <PlanButton billing={query.data.billing} />}
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
				<PageSkeleton kind="account" />
			)}
			<AccountSettings provider={query.data?.billing.provider ?? null} />
			{/* app version */}
			<AppVersionLine />
		</PageScreen>
	)
}
