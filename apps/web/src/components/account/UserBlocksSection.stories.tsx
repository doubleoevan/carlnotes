// the account page's Blocked people card: the list with its Unblock controls, and the loading, failed, and empty states
import { fetchUserBlocks, sendUserUnblock } from "@carlnotes/client/userBlockClient"
import { UserBlocksCard, UserBlocksSection } from "@carlnotes/core/components/UserBlocksSection"
import { BLOCKED_USER_FIXTURES, BLOCKED_USER_ID, toLoadedUserBlocksList } from "@carlnotes/core/lib/userBlocksStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, screen, waitFor, within } from "storybook/test"
import { USER_BLOCKS_ELEMENTS } from "./AccountFields"

// a loaded list, which each state story changes
const LOADED_LIST = toLoadedUserBlocksList({ retry: fn(), unblock: fn(async () => true) })

const meta = {
	title: "Account/UserBlocksSection",
	component: UserBlocksCard,
	args: { elements: USER_BLOCKS_ELEMENTS, userBlocksList: LOADED_LIST },
	argTypes: { elements: { control: false }, userBlocksList: { control: false } },
	parameters: { session: "user", layout: "padded" },
	// the card at the account page's column width
	decorators: [
		(Story) => (
			<div className="w-full max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof UserBlocksCard>

export default meta
type Story = StoryObj<typeof meta>

// two blocked people with their Unblock controls
export const Default: Story = {}

// an unblock in flight, with its control disabled
export const Unblocking: Story = {
	args: { userBlocksList: { ...LOADED_LIST, unblockingUserIds: new Set([BLOCKED_USER_ID]) } },
}

// the list on its way
export const Loading: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [], isLoading: true } } }

// a failed read, with its retry
export const Failed: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [], hasError: true } } }

// nobody blocked, in Carl's words
export const Empty: Story = { args: { userBlocksList: { ...LOADED_LIST, userBlocks: [] } } }

// the section as the account page mounts it: the list from the mocked client, and an unblock that removes the row
export const FromClient: Story = {
	render: ({ elements }) => <UserBlocksSection elements={elements} />,
	beforeEach: () => {
		mocked(fetchUserBlocks).mockResolvedValue(BLOCKED_USER_FIXTURES)
		mocked(sendUserUnblock).mockResolvedValue(undefined)
	},
	play: async ({ canvas, userEvent }) => {
		await expect(await canvas.findByRole("link", { name: "carlos" })).toBeVisible()
		await userEvent.click(canvas.getAllByRole("button", { name: "Unblock" })[0] as HTMLElement)
		await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Unblock" }))
		await waitFor(() => expect(canvas.queryByRole("link", { name: "carlos" })).not.toBeInTheDocument())
	},
}
