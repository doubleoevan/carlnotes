import {
	DASHBOARD_PAGE_HEADINGS,
	DASHBOARD_PAGE_NAMES,
	toFirstTeamDashboardPath,
} from "@carlnotes/contracts/dashboards"
import { AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { useTeams } from "@carlnotes/core/hooks/useTeams"
import { Redirect } from "expo-router"
import { MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS } from "@/components/common/avatarHeaderElements"
import { DASHBOARD_PAGE_ICONS } from "@/components/dashboard/dashboardPageIcons"
import { PageHeading, PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"

/**
 * Opens the Team Dashboard of the user's first team in alphabetical order, or the Teams screen for a user with no team.
 */
export default function FirstTeamDashboardScreen() {
	const teamsQuery = useTeams()

	// the Team Dashboard's placeholder, with the team dropdown's shape, until the teams read, then the first team's Team Dashboard or the Teams screen
	if (teamsQuery.isPending) {
		return (
			<PageScreen
				title={DASHBOARD_PAGE_NAMES.teamDashboard}
				header={<PageHeading title={DASHBOARD_PAGE_HEADINGS.teamDashboard} icon={DASHBOARD_PAGE_ICONS.teamDashboard} />}
				byline={<AvatarHeaderSkeleton hasDetails hasTeamDropdown elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />}
			>
				<PageSkeleton kind="activity" />
			</PageScreen>
		)
	}
	return <Redirect href={toFirstTeamDashboardPath(teamsQuery.data?.teams ?? [])} />
}
