import { fetchTeams } from "@carlnotes/client/teamClient"
import { toFirstTeamDashboardPath } from "@carlnotes/contracts/dashboards"
import { createFileRoute, redirect } from "@tanstack/react-router"

// the user menu's Team Dashboard: the Team Dashboard of the user's first team in alphabetical order, or the teams page
// for a user with no team
export const Route = createFileRoute("/_layout/_signedIn/teams/specials")({
	loader: async () => {
		throw redirect({ href: toFirstTeamDashboardPath((await fetchTeams()).teams), replace: true })
	},
})
