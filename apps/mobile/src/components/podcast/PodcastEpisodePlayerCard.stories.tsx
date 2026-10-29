import {
	PODCAST_STORY_EPISODE,
	PODCAST_STORY_FEED,
	PodcastEpisodeStory,
} from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { PodcastEpisodePlayerCard } from "./PodcastEpisodePlayerCard"

const meta: Meta<typeof PodcastEpisodePlayerCard> = {
	title: "Podcast/PodcastEpisodePlayerCard",
	component: PodcastEpisodePlayerCard,
	args: {
		podcastEpisode: PODCAST_STORY_EPISODE,
		chapterTopicFeed: PODCAST_STORY_FEED,
		onOpenPodcastFeedDialog: () => {},
	},
	parameters: { webReference: "apps/web/src/components/podcast/PodcastEpisodePlayerCard.tsx at 375px" },
	decorators: [
		(Story, context) => (
			<PodcastEpisodeStory episode={context.args.podcastEpisode} state={context.parameters.playbackState ?? "unloaded"}>
				<ScrollView className="w-full" contentContainerClassName="gap-3 pb-4">
					<Story />
				</ScrollView>
			</PodcastEpisodeStory>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Unloaded: Story = {}
export const Playing: Story = { parameters: { playbackState: "playing" } }
export const Paused: Story = { parameters: { playbackState: "paused" } }
export const Buffering: Story = { parameters: { playbackState: "buffering" } }
export const PlaybackError: Story = { parameters: { playbackState: "error" } }
export const LongTitle: Story = {
	args: {
		podcastEpisode: {
			...PODCAST_STORY_EPISODE,
			title: "The surprisingly long story of how a small change to grind size changed every morning cup of coffee",
		},
	},
}
export const MissingFinding: Story = {
	args: {
		podcastEpisode: {
			...PODCAST_STORY_EPISODE,
			chapters: PODCAST_STORY_EPISODE.chapters.map((chapter) => ({ ...chapter, findingId: null, rating: "up" })),
		},
	},
}
export const ExpandableChapters: Story = { parameters: { playbackState: "paused" } }
