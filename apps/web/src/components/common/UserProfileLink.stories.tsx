// the user profile link: a user's avatar and username, linking to their profile
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { Decorator, Meta, StoryObj } from "@storybook/tanstack-react"
import { STORY_PEOPLE, toStoryEmail, toStoryProfile } from "../../../.storybook/fixtures"
import { STORY_TEAMS } from "../../../.storybook/fixtures/teams"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { UserProfileLink } from "./UserProfileLink"

// Carlos's identity, with no avatar version so the initials show and no avatar is fetched
const LIN_IDENTITY: ProfileIdentity = toStoryProfile(STORY_PEOPLE[1])

// a table row as the sent invitations and teams tables show it: the team's name, then the link in a cell that keeps
// it on one line
const inTeamTableRow: Decorator = (Story) => (
	<StoryTable>
		<tr className="border-b">
			<td className="py-2 pr-4">{STORY_TEAMS.readingGroup.name}</td>
			<td className="py-2 pr-4 whitespace-nowrap">
				<Story />
			</td>
		</tr>
	</StoryTable>
)

const meta = {
	title: "Common/UserProfileLink",
	component: UserProfileLink,
	args: { user: LIN_IDENTITY, avatarClassName: "size-6", isNewTab: false },
	argTypes: {
		user: { control: "object" },
		avatarClassName: { control: "text" },
		className: { control: "text" },
		label: { control: "text" },
		displayName: { control: "text" },
		isNewTab: { control: "boolean" },
	},
	// the topic info card and popover, which show the owner's link on the card fill
	parameters: { surface: "card" },
	// the small text of the card, the popover, and the tables, which the link takes on
	decorators: [
		(Story) => (
			<div className="text-sm">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof UserProfileLink>

export default meta
type Story = StoryObj<typeof meta>

// the avatar and the username alone
export const Default: Story = {}

// muted words before the username, as a Topic's owner line shows it in small text on the home page's background
export const WithLabel: Story = {
	args: { label: "Brewed by", className: "mt-1 pl-4 text-xs" },
	parameters: { surface: "page" },
}

// the invitee's email in place of the username, as the sent invitations table shows it
export const WithDisplayName: Story = {
	args: { displayName: toStoryEmail(LIN_IDENTITY.username), avatarClassName: "size-5", isNewTab: true },
	parameters: { surface: "page" },
	decorators: [inTeamTableRow],
}

// the smaller avatar a table row uses, with the profile opening in a new tab
export const InTableRow: Story = {
	args: { avatarClassName: "size-5", isNewTab: true },
	parameters: { surface: "page" },
	decorators: [inTeamTableRow],
}
