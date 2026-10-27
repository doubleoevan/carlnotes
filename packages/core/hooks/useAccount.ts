import { fetchActivity } from "@carlnotes/client/activityClient"
import { fetchBillingState } from "@carlnotes/client/billingClient"
import { useQuery } from "@tanstack/react-query"

/**
 * Loads the complete account budget together and retains it during background refreshes.
 */
export function useAccount({
	userId,
	viewedUserId,
}: {
	userId?: string
	viewedUserId?: string
}): ReturnType<typeof useQuery<AccountData>> {
	return useQuery({
		queryKey: ["account", userId, viewedUserId ?? userId],
		enabled: Boolean(userId),
		queryFn: async () => {
			const [billing, activity] = await Promise.all([fetchBillingState(viewedUserId), fetchActivity(viewedUserId)])
			return { billing, activity }
		},
	})
}

// both payloads are needed before showing authoritative budget and usage numbers
type AccountData = {
	billing: Awaited<ReturnType<typeof fetchBillingState>>
	activity: Awaited<ReturnType<typeof fetchActivity>>
}
