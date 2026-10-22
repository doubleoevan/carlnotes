// the YouTube player: a video's thumbnail with a play button, which plays the video in place only once pressed
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { YoutubePlayer } from "./YoutubePlayer"

const meta = {
	title: "Common/YoutubePlayer",
	component: YoutubePlayer,
	args: {
		youtubeVideoId: "storyVideo1",
		title: "How a Scan picks its Findings",
		thumbnailPath: "/topic-tutorial-video-thumbnail.webp",
		isUserContent: false,
		hasYoutubePlayButton: false,
		onPlay: fn(),
	},
	argTypes: {
		youtubeVideoId: { control: "text" },
		title: { control: "text" },
		thumbnailPath: { control: "text" },
		className: { control: "text" },
		isUserContent: { control: "boolean" },
		hasYoutubePlayButton: { control: "boolean" },
		onPlay: { control: false },
	},
	// the chat panel and the tutorial video dialog, which share the card fill
	parameters: { surface: "card" },
	// YouTube's button shows only in the tutorial video dialog, up to the dialog's width. the app's button shows at the
	// top of a link preview card, inside the card's rounded border, no wider than the chat message's column
	decorators: [
		(Story, { args }) =>
			args.hasYoutubePlayButton ? (
				<div style={{ width: "100%", maxWidth: 720 }}>
					<Story />
				</div>
			) : (
				<div style={{ width: "100%", maxWidth: 460 }}>
					<div className="border-border bg-bubble/60 max-w-[92%] overflow-hidden rounded-xl border">
						<Story />
					</div>
				</div>
			),
	],
} satisfies Meta<typeof YoutubePlayer>

export default meta
type Story = StoryObj<typeof meta>

// the app's play button over a dimmed thumbnail. nothing reaches YouTube until the button is pressed
export const Thumbnail: Story = {}

// YouTube's red play button over the thumbnail at full color, with the tutorial video dialog's rounded corners
export const YoutubePlayButton: Story = {
	args: {
		title: TOPIC_TUTORIAL_VIDEO.name,
		className: "overflow-hidden rounded-md",
		hasYoutubePlayButton: true,
	},
}

// no stored thumbnail and no title, so the play button shows alone and names the video generically
export const NoThumbnail: Story = { args: { thumbnailPath: null, title: null } }
