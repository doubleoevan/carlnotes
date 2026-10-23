// the links a user table's row shows: the avatar and username to the profile, and in the admin tables the email to the
// activity page and the plan to the account page, each with a tooltip naming the page
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { STORY_PEOPLE, toStoryEmail } from "../../../.storybook/fixtures"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { UserEmailLink, UserNameLink, UserPlanLink } from "./UserLinks"

// the person every story names
const [VIENNA] = STORY_PEOPLE

const meta = {
	title: "Table/UserLinks",
	component: UserNameLink,
	args: { user: { userId: VIENNA.userId, username: VIENNA.username, avatarVersion: null } },
	argTypes: {
		user: { control: "object" },
	},
} satisfies Meta<typeof UserNameLink>

export default meta
type Story = StoryObj<typeof meta>

// the three links as an admin user table's row shows them
export const AdminRow: Story = {
	render: ({ user }) => (
		<StoryTable>
			<tr className="border-b">
				<td className="py-2 pr-4">
					<UserNameLink user={user} />
				</td>
				<td className="py-2 pr-4">
					<UserEmailLink user={{ ...user, email: toStoryEmail(user.username) }} />
				</td>
				<td className="py-2 pr-4">
					<UserPlanLink user={{ ...user, plan: "plus" }} />
				</td>
			</tr>
		</StoryTable>
	),
}

// a long email cut short at the link's maximum width
export const LongEmail: Story = {
	render: ({ user }) => (
		<StoryTable>
			<tr className="border-b">
				<td className="py-2 pr-4">
					<UserEmailLink user={{ ...user, email: "vienna.example.with.a.long.address@subdomain.example.com" }} />
				</td>
			</tr>
		</StoryTable>
	),
}
