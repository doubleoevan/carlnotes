import { fetchUpdatesOpener } from "@carlnotes/client/updatesClient"
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
