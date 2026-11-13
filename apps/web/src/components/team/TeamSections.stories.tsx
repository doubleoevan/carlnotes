import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import { TEAM_SECTION_VALUES } from "@carlnotes/core/lib/cardSections"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { Accordion } from "@/components/primitives/accordion"
import { TeamSections } from "./TeamSections"

// the members and topics a member reads, a team with no topics yet, and members the table does not list
const meta = {
	title: "Team/TeamSections",
	component: TeamSections,
	args: { teamPage: toTestTeamPage(), notesSection: null, onChanged: fn() },
	render: (args) => (
		<Accordion type="multiple" defaultValue={[...TEAM_SECTION_VALUES, "members", "topics", "notes"]}>
			<TeamSections {...args} />
		</Accordion>
	),
} satisfies Meta<typeof TeamSections>
export default meta
type Story = StoryObj<typeof meta>
export const Member: Story = {}
export const NoTopics: Story = { args: { teamPage: toTestTeamPage({ topics: [] }) } }
export const HiddenMembers: Story = { args: { teamPage: toTestTeamPage({ hiddenMemberCount: 4 }) } }
