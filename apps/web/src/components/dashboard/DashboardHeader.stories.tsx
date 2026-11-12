// a Dashboard page's header: the page icon and heading, then the person's or team's avatar beside their name, or the
// team dropdown in the team's name's place, and the summary counts, or the placeholder that holds their place while
// the snapshot loads
import { TeamDropdown } from "@carlnotes/core/components/TeamDropdown"
import { STORY_TEAM_DASHBOARD_HEADER, STORY_TOPIC_DASHBOARD } from "@carlnotes/core/lib/dashboardStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { DashboardHeader } from "./DashboardHeader"
import { WEB_TEAM_DROPDOWN_ELEMENTS } from "./dashboardElements"

const meta = {
	title: "Dashboard/DashboardHeader",
	component: DashboardHeader,
	parameters: { surface: "page" },
	args: {
		dashboardKind: "topicDashboard",
		subject: STORY_TOPIC_DASHBOARD.subject,
		summary: STORY_TOPIC_DASHBOARD.summary,
		isSubjectHeaderShown: true,
	},
} satisfies Meta<typeof DashboardHeader>

export default meta
type Story = StoryObj<typeof meta>

/** Topic Dashboard's header with the person's avatar, name, and summary counts. */
export const Loaded: Story = {}

/** Team Dashboard's header with the team's avatar, name, and summary counts with its members. */
export const Team: Story = { args: { dashboardKind: "teamDashboard", ...STORY_TEAM_DASHBOARD_HEADER } }

/** Team Dashboard's header for a member of more than one team, with the team dropdown in the team's name's place. */
export const TeamWithDropdown: Story = {
	args: {
		dashboardKind: "teamDashboard",
		...STORY_TEAM_DASHBOARD_HEADER,
		teamDropdown: (
			<TeamDropdown
				teams={[
					STORY_TEAM_DASHBOARD_HEADER.subject.team,
					{ teamId: "team-night-shift", name: "Night Shift", avatarVersion: null },
				]}
				currentTeam={STORY_TEAM_DASHBOARD_HEADER.subject.team}
				onTeamChange={() => {}}
				elements={WEB_TEAM_DROPDOWN_ELEMENTS}
			/>
		),
	},
}

/** The header while the snapshot loads: the avatar's circle and the name's bar in the loaded header's places. */
export const Loading: Story = { args: { subject: undefined, summary: undefined } }

/** Team Dashboard's header while it loads for a member: the avatar's circle and the team dropdown's shape. */
export const LoadingWithTeamDropdown: Story = {
	args: { dashboardKind: "teamDashboard", subject: undefined, summary: undefined, hasTeamDropdown: true },
}
