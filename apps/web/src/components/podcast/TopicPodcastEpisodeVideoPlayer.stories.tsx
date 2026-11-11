import { PODCAST_STORY_FILM_EPISODE, PodcastEpisodeStory } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, waitFor } from "storybook/test"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"

const meta: Meta<typeof TopicPodcastEpisodeVideoPlayer> = {
	title: "Podcast/TopicPodcastEpisodeVideoPlayer",
	component: TopicPodcastEpisodeVideoPlayer,
	args: { podcastEpisode: PODCAST_STORY_FILM_EPISODE },
	parameters: { webReference: "apps/web/src/components/podcast/TopicPodcastEpisodeVideoPlayer.tsx at 375px" },
	decorators: [
		(Story, context) => {
			// a browser without picture-in-picture for the story that asks for one
			Object.defineProperty(document, "pictureInPictureEnabled", {
				configurable: true,
				value: !context.parameters.isPictureInPictureMissing,
			})
			return (
				<PodcastEpisodeStory episode={context.args.podcastEpisode}>
					<div className="max-w-3xl">
						<Story />
					</div>
				</PodcastEpisodeStory>
			)
		},
	],
}
export default meta
type Story = StoryObj<typeof meta>

// press a button of the film player by the start of its label
function pressButton(canvasElement: HTMLElement, labelStart: string): void {
	canvasElement.querySelector<HTMLButtonElement>(`button[aria-label^="${labelStart}"]`)?.click()
}

// mute the film and press the play button over its poster, since a story's press is not the viewer's own
const playMutedFilm: Story["play"] = async ({ canvasElement }) => {
	pressButton(canvasElement, "Mute")
	pressButton(canvasElement, "Play")
}

// the labels of the skips and the speed, which show before the film plays
const EARLY_CONTROL_LABEL_STARTS = ["Skip back", "Skip forward", "Playback speed"]

// the play button over the poster, which waits for a press, with the skips and the speed already at the left of the
// control row
export const Poster: Story = {
	play: async ({ canvasElement }) => {
		for (const labelStart of EARLY_CONTROL_LABEL_STARTS) {
			await expect(canvasElement.querySelector(`button[aria-label^="${labelStart}"]`)).not.toBeNull()
		}
	},
}

// the player in the card that the topic page and the podcast episode page show it in
export const Card: Story = { args: { isCard: true } }

// a film started by a press on skip forward, which plays from 30 seconds past its start
export const StartedBySkipForward: Story = {
	play: async ({ canvasElement }) => {
		pressButton(canvasElement, "Mute")
		pressButton(canvasElement, "Skip forward")
		await waitFor(() => expect(canvasElement.querySelector('button[aria-label^="Pause"]')).not.toBeNull())
	},
}

// a film started by a press on the speed, which plays at the next speed
export const StartedBySpeed: Story = {
	play: async ({ canvasElement }) => {
		// the speed's label before the press
		const toSpeedLabel = (): string | null =>
			canvasElement.querySelector('button[aria-label^="Playback speed"]')?.getAttribute("aria-label") ?? null
		const speedLabel = toSpeedLabel()

		// the press starts the film and steps the speed
		pressButton(canvasElement, "Mute")
		pressButton(canvasElement, "Playback speed")
		await waitFor(() => expect(canvasElement.querySelector('button[aria-label^="Pause"]')).not.toBeNull())
		await expect(toSpeedLabel()).not.toBe(speedLabel)
	},
}

// a playing film, with the play button hidden
export const Playing: Story = { play: playMutedFilm }

// a film paused by a press on its frame, with the play button over the frame again
export const Paused: Story = {
	play: async (context) => {
		await playMutedFilm(context)
		await waitFor(() => expect(context.canvasElement.querySelector('button[aria-label^="Pause"]')).not.toBeNull())
		pressButton(context.canvasElement, "Pause")
	},
}

// a muted film on its poster, with the crossed speaker
export const Muted: Story = { play: async ({ canvasElement }) => pressButton(canvasElement, "Mute") }
export const CaptionsOff: Story = {
	play: async (context) => {
		await playMutedFilm(context)
		pressButton(context.canvasElement, "Hide captions")
	},
}
export const NoPictureInPicture: Story = { parameters: { isPictureInPictureMissing: true } }
