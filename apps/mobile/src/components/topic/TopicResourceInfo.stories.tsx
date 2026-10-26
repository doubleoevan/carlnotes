import { toTestTopicFeed, toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TOPIC_TUTORIAL_VIDEO, toYoutubeWatchUrl } from "@carlnotes/contracts/youtube"
import type { Meta, StoryObj } from "@storybook/react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TopicResourceInfo, type TopicResourceInfoProps } from "./TopicResourceInfo"
import { FEED_WEB_REFERENCES, STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"

// fixtures keep preview reads, feedback, and finding writes local
const meta = {
	title: "Topic/TopicResourceInfo",
	component: TopicResourceInfoExample,
	parameters: { webReference: FEED_WEB_REFERENCES.resource },
	args: {
		resource: toTestTopicFinding(),
		topic: toTestTopicFeed(),
		topicFindingRank: 1,
		topicFeedHandlers: STORY_TOPIC_FEED_HANDLERS,
		onSendFeedback: async () => undefined,
		linkPreview: {
			url: "https://example.com/coffee",
			title: "A better cup of coffee",
			description: "A practical guide to brewing coffee at home.",
			imagePath: null,
			faviconPath: null,
			youtubeVideoId: null,
		},
	},
} satisfies Meta<typeof TopicResourceInfoExample>
export default meta
type Story = StoryObj<typeof meta>

// the normal and constrained states share the same native sheet
export const Default: Story = {}
export const ReadOnly: Story = {
	args: { topic: toTestTopicFeed({ isTopicOwner: false, isTeamMember: false, canRate: false }) },
}
export const Pending: Story = { args: { isPending: true } }
export const Bookmarked: Story = { args: { resource: toTestTopicFinding({ isBookmarked: true }) } }
export const UpRated: Story = { args: { resource: toTestTopicFinding({ rating: "up" }) } }
export const DownRated: Story = { args: { resource: toTestTopicFinding({ rating: "down" }) } }
export const VideoPreview: Story = {
	args: {
		linkPreview: {
			...meta.args.linkPreview,
			url: toYoutubeWatchUrl(TOPIC_TUTORIAL_VIDEO.youtubeVideoId),
			title: TOPIC_TUTORIAL_VIDEO.name,
			imagePath: TOPIC_TUTORIAL_VIDEO.thumbnailPath,
			youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId,
		},
	},
}
export const NoPreview: Story = { args: { linkPreview: null } }
export const ImagePreview: Story = {
	args: {
		linkPreview: { ...meta.args.linkPreview, imagePath: "/opengraph-image.png" },
	},
}
export const UnavailablePreviewImage: Story = {
	args: {
		linkPreview: { ...meta.args.linkPreview, imagePath: "/unavailable-preview-image.png" },
	},
}
export const LongNotes: Story = {
	args: {
		resource: toTestTopicFinding({
			relevanceExplanation: "A practical explanation of temperature, grind size, and timing.\n\n".repeat(25),
		}),
	},
}

// provide a stable trigger for focus return and local state for action checks
function TopicResourceInfoExample(props: Omit<TopicResourceInfoProps, "onClose" | "triggerRef">) {
	// reset fixture state when the selected story changes
	const [isOpen, setIsOpen] = useState(false)
	const [resource, setResource] = useState(props.resource)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handlers = {
		...STORY_TOPIC_FEED_HANDLERS,
		bookmarkTopicFinding: (_findingId: string, isBookmarked: boolean): void =>
			setResource((finding) => ({ ...finding, isBookmarked })),
		rateTopicFinding: (_findingId: string, rating: "up" | "down" | null): void =>
			setResource((finding) => ({ ...finding, rating })),
		consumeTopicFinding: (_findingId: string, isConsumed: boolean): void =>
			setResource((finding) => ({ ...finding, isConsumed })),
	}
	return (
		<View>
			<Button ref={triggerRef} accessibilityLabel="Open finding details" onPress={() => setIsOpen(true)}>
				<Text>Open finding details</Text>
			</Button>
			{isOpen ? (
				<TopicResourceInfo
					{...props}
					resource={resource}
					topicFeedHandlers={handlers}
					triggerRef={triggerRef}
					onClose={() => setIsOpen(false)}
				/>
			) : null}
		</View>
	)
}
