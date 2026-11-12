// a Dashboard page's access and its default selection's snapshot: whether the user reads the full snapshot and owns the
// page, the subject header's subject and summary, the page title, and the team dropdown's teams
import { authClient } from "@carlnotes/client/authClient"
import {
	type DashboardKind,
	type DashboardResponse,
	type DashboardSubjectIdentity,
	type DashboardSummary,
	toDashboardPageTitle,
	toDashboardSubjectName,
	toDefaultDashboardSelection,
} from "@carlnotes/contracts/dashboards"
import type { TeamDropdownProps } from "../components/TeamDropdown"
import { useDashboardSnapshot } from "./useDashboardSnapshot"
import { useTeams } from "./useTeams"

// the line a Dashboard page shows in place of its body for a Dashboard that was not found
export const DASHBOARD_NOT_FOUND_LINE = "Carl couldn't find these Specials. He checked twice."

// the page's Dashboard, and the server's public read of its default selection
export type UseDashboardPageOptions = {
	dashboardKind: DashboardKind
	subjectId: string
	initialDashboard: DashboardResponse | null
}

// whether the user reads the full snapshot and owns the page, the subject header's subject and summary, the page title
// once the subject loads, and whether the Dashboard was not found
export type DashboardPageState = {
	hasFullAccess: boolean
	isOwner: boolean
	// whether the header shows the New Topic button: on one's own Topic and Podcast Dashboards, and on every Team
	// Dashboard, as the team page shows it to every reader
	hasNewTopicButton: boolean
	subject: DashboardSubjectIdentity | undefined
	summary: DashboardSummary | undefined
	pageTitle: string | null
	isMissing: boolean
	// whether Team Dashboard shows the team dropdown, for a reader with a team of their own, which its placeholder knows
	// before the team loads
	hasTeamDropdown: boolean
	// the team dropdown's teams on Team Dashboard for a reader with a team of their own, or null
	teamDropdown: Omit<TeamDropdownProps, "onTeamChange"> | null
}

/**
 * Reads a Dashboard page's access and its default selection's snapshot.
 */
export function useDashboardPage({
	dashboardKind,
	subjectId,
	initialDashboard,
}: UseDashboardPageOptions): DashboardPageState {
	const { data: session, isPending: isSessionPending } = authClient().useSession()

	// the signed-in user's teams, for the dropdown and for whether they read a team's charts
	const isTeamPage = dashboardKind === "teamDashboard"
	const teamsQuery = useTeams({ isEnabled: isTeamPage && Boolean(session) })
	const userTeams = teamsQuery.data?.teams ?? []

	// the owner of Topic and Podcast Dashboards and a team's members read the full snapshot. a team's leader owns its
	// Team Dashboard
	const userTeam = userTeams.find((team) => team.teamId === subjectId)
	const hasFullAccess = isTeamPage ? Boolean(userTeam) : session?.user.id === subjectId
	const isOwner = isTeamPage ? userTeam?.role === "leader" : hasFullAccess

	// the default selection's snapshot. the subject shows from the server's read at once, and with full access the
	// summary waits for the full snapshot
	const { dashboard, isLoading } = useDashboardSnapshot({
		dashboardKind,
		subjectId,
		selection: toDefaultDashboardSelection(dashboardKind),
		hasFullAccess,
		initialDashboard,
	})
	const subject = (dashboard ?? initialDashboard)?.subject

	// the team dropdown on Team Dashboard for a user with a team of their own, with the user's teams and the team shown
	const hasTeamDropdown = isTeamPage && userTeams.length > 0
	const teamDropdown =
		hasTeamDropdown && subject?.subjectKind === "team" ? { teams: userTeams, currentTeam: subject.team } : null

	// a person or team the api does not have, or a private team whose page does not open for the user, is missing. the
	// page waits for the session and the user's teams first, which open a private team's page to its members
	const isAccessPending = isSessionPending || (isTeamPage && Boolean(session) && teamsQuery.isPending)
	return {
		hasFullAccess,
		isOwner,
		hasNewTopicButton: isTeamPage || isOwner,
		subject,
		summary: dashboard?.summary,
		pageTitle: subject ? toDashboardPageTitle(dashboardKind, toDashboardSubjectName(subject)) : null,
		isMissing: !isLoading && !isAccessPending && !subject,
		hasTeamDropdown,
		teamDropdown,
	}
}
