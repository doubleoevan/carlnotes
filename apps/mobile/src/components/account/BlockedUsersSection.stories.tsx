import type { BlockedUser } from "@carlnotes/contracts/blocks"
import { BlockedUsersCard } from "@carlnotes/core/components/BlockedUsersSection"
import type { BlockedUsersList } from "@carlnotes/core/hooks/useBlockedUsers"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { BLOCKED_USERS_ELEMENTS } from "./AccountFields"

// two blocked people, newest first
const BLOCKED_USER_FIXTURES: BlockedUser[] = [
	{ id: "user-carlos", username: "carlos", blockedAt: "2026-10-28T12:00:00Z" },
	{ id: "user-evan", username: "evan", blockedAt: "2026-10-27T12:00:00Z" },
]

// a loaded list, which each state story changes
const LOADED_LIST: BlockedUsersList = {
	blockedUsers: BLOCKED_USER_FIXTURES,
	isLoading: false,
	hasError: false,
	unblockingUserIds: new Set(),
	retry: () => undefined,
	unblock: async () => true,
}

// the Blocked people card's states, with the web account page's words and no block requests
const meta: Meta<typeof BlockedUsersCard> = {
	title: "Account/BlockedUsersSection",
	component: BlockedUsersCard,
	args: { elements: BLOCKED_USERS_ELEMENTS, blockedUsersList: LOADED_LIST },
	parameters: { webReference: "apps/web/src/components/account/AccountSettings.tsx, Blocked people, at 375px" },
	decorators: [
		(Story) => (
			<View style={{ width: "100%" }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Unblocking: Story = {
	args: { blockedUsersList: { ...LOADED_LIST, unblockingUserIds: new Set(["user-carlos"]) } },
}
export const Loading: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [], isLoading: true } } }
export const Failed: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [], hasError: true } } }
export const Empty: Story = { args: { blockedUsersList: { ...LOADED_LIST, blockedUsers: [] } } }
