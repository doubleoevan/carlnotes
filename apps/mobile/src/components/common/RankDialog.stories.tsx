import { toProfileRankDialogLabels } from "@carlnotes/core/lib/rankDialog"
import type { Meta, StoryObj } from "@storybook/react-native"
import { RankDialog } from "./RankDialog"

// a person's public topics, the first two of them pinned
const PROFILE_TOPICS = [
	{ id: "topic-llm-tooling", label: "LLM tooling" },
	{ id: "topic-home-espresso", label: "Home espresso" },
	{ id: "topic-city-cycling", label: "City cycling" },
	{ id: "topic-sourdough", label: "Sourdough" },
]

// exercise the step buttons, the add picker, a confirmed removal, and the save
const meta = {
	title: "Common/RankDialog",
	component: RankDialog,
	args: {
		labels: toProfileRankDialogLabels("topics"),
		pinnedItems: PROFILE_TOPICS.slice(0, 2),
		candidateItems: PROFILE_TOPICS,
		limit: 12,
		onSave: async () => {},
		onClose: () => {},
	},
	parameters: { webReference: "common-rankdialog--profile, step buttons replace the drag" },
} satisfies Meta<typeof RankDialog>
export default meta
type Story = StoryObj<typeof meta>

// two pinned topics and the picker that offers the person's other public topics
export const Profile: Story = {}

// a person with no pin yet reads the empty line above the picker
export const ProfileEmpty: Story = {
	args: {
		labels: toProfileRankDialogLabels("podcasts"),
		pinnedItems: [],
		candidateItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
	},
}

// a person's own pinned films, each named by its podcast episode's title and its topic, and the picker that offers
// their other films
export const ProfileFilms: Story = {
	args: {
		labels: toProfileRankDialogLabels("films"),
		pinnedItems: [{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" }],
		candidateItems: [
			{ id: "episode-1", label: "Grinders, scales, and the pour · Home espresso" },
			{ id: "episode-2", label: "The agents that shipped · LLM tooling" },
		],
	},
	parameters: { webReference: "common-rankdialog--profile-films, step buttons replace the drag" },
}

// a person's own pinned posts, each named by its title and its topic, and the picker that offers their other posts
export const ProfilePosts: Story = {
	args: {
		labels: toProfileRankDialogLabels("posts"),
		pinnedItems: [{ id: "post-1", label: "Dialing in a new grinder · Home espresso" }],
		candidateItems: [
			{ id: "post-1", label: "Dialing in a new grinder · Home espresso" },
			{ id: "post-2", label: "What a scale changes · Home espresso" },
		],
	},
	parameters: { webReference: "common-rankdialog--profile-posts, step buttons replace the drag" },
}

// an author's own pinned posts, opened from one of their Topic Post's screens: the screen's post appended at the end
// with the check on its row
export const ProfilePostsPage: Story = {
	args: {
		labels: toProfileRankDialogLabels("posts"),
		pageItem: { id: "post-2", label: "What a scale changes · Home espresso" },
		pinnedItems: [{ id: "post-1", label: "Dialing in a new grinder · Home espresso" }],
		candidateItems: [
			{ id: "post-1", label: "Dialing in a new grinder · Home espresso" },
			{ id: "post-2", label: "What a scale changes · Home espresso" },
		],
	},
	parameters: { webReference: "common-rankdialog--profile-posts-page, step buttons replace the drag" },
}
