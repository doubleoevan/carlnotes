// the account page's Blocked people card: the list with its Unblock controls, and the loading, failed, and empty states
import { fetchBlockedUsers, sendUnblockUser } from "@carlnotes/client/blockClient"
import type { BlockedUser } from "@carlnotes/contracts/blocks"
import { BlockedUsersCard, BlockedUsersSection } from "@carlnotes/core/components/BlockedUsersSection"
import type { BlockedUsersList } from "@carlnotes/core/hooks/useBlockedUsers"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { BLOCKED_USERS_ELEMENTS } from "./AccountFields"

// two blocked people, newest first
const BLOCKED_USER_FIXTURES: BlockedUser[] = [
	{ id: STORY_PEOPLE[1].userId, username: STORY_PEOPLE[1].username, blockedAt: FIXTURE_DATE.toISOString() },
	{
		id: STORY_PEOPLE[2].userId,
		username: STORY_PEOPLE[2].username,
		blockedAt: new Date(FIXTURE_DATE.getTime() - 86_400_000).toISOString(),
	},
]

// a loaded list, which each state story changes
const LOADED_LIST: BlockedUsersList = {
	blockedUsers: BLOCKED_USER_FIXTURES,
	isLoading: false,
	hasError: false,
	unblockingUserIds: new Set(),
	retry: fn(),
	unblock: fn(async () => true),
}

const meta = {
	title: "Account/BlockedUsersSection",
	component: BlockedUsersCard,
	args: { elements: BLOCKED_USERS_ELEMENTS, blockedUsersList: LOADED_LIST },
	argTypes: { elements: { control: false }, blockedUsersList: { control: false } },
	parameters: { session: "user", layout: "padded" },
	// the card at the account page's column width
	decorators: [
		(Story) => (
			<div className="w-full max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof BlockedUsersCard>

export default meta
type Story = StoryObj<typeof meta>

// two blocked people with their Unblock controls
export const Default: Story = {}

// an unblock in flight, with its control disabled
export const Unblocking: Story = {
	args: { blockedUsersList: { ...LOADED_LIST, unblockingUserIds: new Set([STORY_PEOPLE[1].userId]) } },
}

// the list on its way
export const Loading: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [], isLoading: true } } }

// a failed read, with its retry
export const Failed: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [], hasError: true } } }

// nobody blocked, in Carl's words
export const Empty: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [] } } }

// the section as the account page mounts it: the list from the mocked client, and an unblock that removes the row
export const FromClient: Story = {
	render: ({ elements }) => <BlockedUsersSection elements={elements} />,
	beforeEach: () => {
		mocked(fetchBlockedUsers).mockResolvedValue(BLOCKED_USER_FIXTURES)
		mocked(sendUnblockUser).mockResolvedValue(undefined)
	},
	play: async ({ canvas, userEvent }) => {
		await expect(await canvas.findByRole("link", { name: "carlos" })).toBeVisible()
		await userEvent.click(canvas.getAllByRole("button", { name: "Unblock" })[0] as HTMLElement)
		await waitFor(() => expect(canvas.queryByRole("link", { name: "carlos" })).not.toBeInTheDocument())
	},
}
