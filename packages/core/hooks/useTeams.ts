// the signed-in user's teams and team invites, read once per account and shared by every page that reads them
import { authClient } from "@carlnotes/client/authClient"
import { fetchTeams } from "@carlnotes/client/teamClient"
import type { TeamsPageResponse } from "@carlnotes/contracts/teams"
import { type UseQueryResult, useQuery } from "@tanstack/react-query"

/**
 * Reads the signed-in user's teams and team invites, unless the read is turned off.
 */
export function useTeams({ isEnabled = true }: { isEnabled?: boolean } = {}): UseQueryResult<TeamsPageResponse> {
	// key the read by the signed-in user, so another account reads its own teams
	const { data: session } = authClient().useSession()
	return useQuery({ queryKey: ["teams", session?.user.id], queryFn: fetchTeams, enabled: isEnabled })
}
