// podcast episode cover tests: the image across the top, and the panel's title and detail line under it
import { expect, test } from "bun:test"
import { latte } from "@carlnotes/nightshift/colors"
import { type PodcastEpisodeCover, toPodcastEpisodeCoverElement } from "./podcastEpisodeCover"

// a podcast episode's cover with no image of its own or of its topic's
const PODCAST_EPISODE_COVER: PodcastEpisodeCover = {
	kind: "episode",
	id: "episode-1",
	title: "A quieter grinder",
	topicId: "topic-1",
	topicImageHash: null,
	podcastEpisodeImageHash: null,
	details: "Home espresso · 2026 · E4",
}

// a podcast episode cover's panel shows the title in two lines at most, then the detail line, under the image
test("a podcast episode cover shows its title and detail line under its image", () => {
	// the image, then the panel with the title over the detail line
	const coverElement = toPodcastEpisodeCoverElement(PODCAST_EPISODE_COVER, "data:,")
	expect(coverElement.props.children).toMatchObject([
		{ type: "img", props: { width: 3000, height: 2000 } },
		{
			props: {
				children: [
					{ props: { children: "A quieter grinder", style: { lineClamp: 2, color: latte.heroForeground } } },
					{ props: { children: "Home espresso · 2026 · E4", style: { lineClamp: 1, color: latte.heroMuted } } },
				],
			},
		},
	])
})
