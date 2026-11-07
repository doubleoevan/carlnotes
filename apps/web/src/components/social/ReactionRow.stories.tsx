// the reaction row: a social target's six reaction types with their counts, and the user's own marked
import { saveReaction } from "@carlnotes/client/socialClient"
import { EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import { toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked, waitFor, within } from "storybook/test"
import { ReactionRow } from "./ReactionRow"

// the social target every story hangs on
const TARGET = { kind: "finding", id: "finding-runtime" } as const

const meta = {
	title: "Social/ReactionRow",
	component: ReactionRow,
	args: { target: TARGET, summary: toTestReactionSummary(), isSignedIn: true },
	argTypes: { target: { control: false }, summary: { control: "object" }, isSignedIn: { control: "boolean" } },
	parameters: { session: "user", surface: "card" },
} satisfies Meta<typeof ReactionRow>

export default meta
type Story = StoryObj<typeof meta>

// two types chosen, neither by the user
export const WithReactions: Story = {}

// nothing yet: the six types with no counts
export const Empty: Story = { args: { summary: EMPTY_REACTION_SUMMARY } }

// the user's own type marked
export const OwnReaction: Story = { args: { summary: toTestReactionSummary({ ownReactionType: "like" }) } }

// a type that people chose lists them in its tooltip, each linking to their profile
export const NamesUsers: Story = {
	args: {
		summary: toTestReactionSummary({
			counts: [
				{
					reactionType: "like",
					count: 11,
					users: [
						{ userId: "user-roast", username: "roastmaster", avatarSource: null, avatarVersion: null },
						{ userId: "user-pour", username: "pourover", avatarSource: null, avatarVersion: null },
					],
				},
			],
		}),
	},
	play: async ({ canvasElement, userEvent }) => {
		await userEvent.hover(within(canvasElement).getByRole("button", { name: "Like, 11" }))
		const tooltip = within(canvasElement.ownerDocument.body)
		await waitFor(() => expect(tooltip.getByRole("link", { name: "roastmaster" })).toBeVisible())
		await expect(tooltip.getByRole("link", { name: "roastmaster" })).toHaveAttribute("href", "/profiles/user-roast")
		await expect(tooltip.getAllByText("and 9 more")[0]).toBeVisible()
	},
}

// a visitor reads the counts, and a press opens sign-up
export const Visitor: Story = { args: { isSignedIn: false }, parameters: { session: "visitor" } }

// a press on a type saves it and shows the summary the save returned
export const PicksType: Story = {
	args: { summary: EMPTY_REACTION_SUMMARY },
	play: async ({ canvasElement, userEvent }) => {
		mocked(saveReaction).mockResolvedValue({
			status: "saved",
			summary: { counts: [{ reactionType: "celebrate", count: 1, users: [] }], ownReactionType: "celebrate" },
		})
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Celebrate" }))
		await waitFor(() => expect(canvas.getByRole("button", { name: "Celebrate, 1, your reaction" })).toBeVisible())
		await expect(saveReaction).toHaveBeenLastCalledWith({ target: TARGET, reactionType: "celebrate" })
	},
}

// a press on the user's own type takes it back
export const RemovesType: Story = {
	args: { summary: toTestReactionSummary({ ownReactionType: "like" }) },
	play: async ({ canvasElement, userEvent }) => {
		mocked(saveReaction).mockResolvedValue({
			status: "saved",
			summary: toTestReactionSummary({ counts: [{ reactionType: "like", count: 3, users: [] }] }),
		})
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Like, 4, your reaction" }))
		await waitFor(() => expect(canvas.getByRole("button", { name: "Like, 3" })).toBeVisible())
		await expect(saveReaction).toHaveBeenLastCalledWith({ target: TARGET, reactionType: null })
	},
}
