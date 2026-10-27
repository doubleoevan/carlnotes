import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useAccount } from "@carlnotes/core/hooks/useAccount"
import { User } from "lucide-react-native"
import { AccountBudget, PlanButton } from "@/components/account/AccountBudget"
import { AccountSettings } from "@/components/account/AccountSettings"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

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
			byline={session && <UserProfileLink user={toSessionProfileIdentity(session.user)} />}
			action={query.data && <PlanButton billing={query.data.billing} />}
			onRefresh={() => void query.refetch()}
			isRefreshing={query.isRefetching}
		>
			{query.data ? (
				<AccountBudget {...query.data} />
			) : query.isError ? (
				<Button variant="outline" accessibilityLabel="Retry loading account" onPress={() => void query.refetch()}>
					<Text>Retry loading account</Text>
				</Button>
			) : (
				<PageSkeleton kind="account" />
			)}
			<AccountSettings />
		</PageScreen>
	)
}
