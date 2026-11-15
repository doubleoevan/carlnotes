import { fetchProfileUpdatesRecap, fetchUpdatesRecap } from "@carlnotes/client/updatesClient"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import { useQuery } from "@tanstack/react-query"

// the query key the day's recap is cached under, and how long back navigation still finds it
const UPDATES_RECAP_QUERY_KEY = "updates-recap"
const UPDATES_RECAP_CACHE_MS = 60 * 60_000

/**
 * Reads the day's recap for the signed-in user's home, or null without one. A failed read shows no recap and waits
 * for the next visit.
 */
export function useUpdatesRecap(userId: string | null): string | null {
	const { data: recap } = useQuery({
		queryKey: [UPDATES_RECAP_QUERY_KEY, userId],
		queryFn: fetchUpdatesRecap,
		enabled: userId !== null,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: UPDATES_RECAP_CACHE_MS,
	})
	return recap ?? null
}

// whose profile it is, who reads it, whether the reader sees the person's topics that are not public, and the page's
// audience
type UseProfileUpdatesRecapOptions = {
	profileUserId: string
	userId: string | null
	includesNonPublicTopics: boolean
	audience?: ProfileAudience
}

/**
 * Reads the recap a profile's news shows. The person reads their own day's recap. An admin in the user audience
 * reads the recap the person's home shows today, and anyone else none.
 */
export function useProfileUpdatesRecap({
	profileUserId,
	userId,
	includesNonPublicTopics,
	audience = "user",
}: UseProfileUpdatesRecapOptions): string | null {
	// only the person and an admin in the user audience see the person's topics that are not public
	const isOwnProfile = userId === profileUserId
	const isAdminView = includesNonPublicTopics && !isOwnProfile && audience === "user"
	const ownRecap = useUpdatesRecap(isOwnProfile ? userId : null)

	// an admin's read of the person's recap
	const { data: profileRecap } = useQuery({
		queryKey: [UPDATES_RECAP_QUERY_KEY, "profile", profileUserId],
		queryFn: () => fetchProfileUpdatesRecap(profileUserId),
		enabled: isAdminView,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: UPDATES_RECAP_CACHE_MS,
	})
	return isAdminView ? (profileRecap ?? null) : ownRecap
}
