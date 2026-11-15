import { fetchProfileUpdatesOpener, fetchUpdatesOpener } from "@carlnotes/client/updatesClient"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import { useQuery } from "@tanstack/react-query"

// the query key the day's opener is cached under, and how long back navigation still finds it
const UPDATES_OPENER_QUERY_KEY = "updates-opener"
const UPDATES_OPENER_CACHE_MS = 60 * 60_000

/**
 * Reads the day's opener for the signed-in user's home, or null without one. A failed read shows no opener and waits
 * for the next visit.
 */
export function useUpdatesOpener(userId: string | null): string | null {
	const { data: opener } = useQuery({
		queryKey: [UPDATES_OPENER_QUERY_KEY, userId],
		queryFn: fetchUpdatesOpener,
		enabled: userId !== null,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: UPDATES_OPENER_CACHE_MS,
	})
	return opener ?? null
}

// whose profile it is, who reads it, whether the reader sees the person's topics that are not public, and the page's
// audience
type UseProfileUpdatesOpenerOptions = {
	profileUserId: string
	userId: string | null
	includesNonPublicTopics: boolean
	audience?: ProfileAudience
}

/**
 * Reads the opener a profile's news shows. The person reads their own day's opener. An admin in the user audience
 * reads the opener the person's home shows today, and anyone else none.
 */
export function useProfileUpdatesOpener({
	profileUserId,
	userId,
	includesNonPublicTopics,
	audience = "user",
}: UseProfileUpdatesOpenerOptions): string | null {
	// only the person and an admin in the user audience see the person's topics that are not public
	const isOwnProfile = userId === profileUserId
	const isAdminView = includesNonPublicTopics && !isOwnProfile && audience === "user"
	const ownOpener = useUpdatesOpener(isOwnProfile ? userId : null)

	// an admin's read of the person's opener
	const { data: profileOpener } = useQuery({
		queryKey: [UPDATES_OPENER_QUERY_KEY, "profile", profileUserId],
		queryFn: () => fetchProfileUpdatesOpener(profileUserId),
		enabled: isAdminView,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: UPDATES_OPENER_CACHE_MS,
	})
	return isAdminView ? (profileOpener ?? null) : ownOpener
}
