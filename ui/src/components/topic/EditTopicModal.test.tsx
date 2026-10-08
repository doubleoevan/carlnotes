// podcast switch tests: what the edit topic modal's podcast switch says for each state of the podcast
import { expect, test } from "bun:test"
import type { TopicPodcast } from "@shared/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { PodcastSwitch } from "./EditTopicModal"

// a topic's podcast that is on and gets full episodes, with nothing published
const topicPodcast: TopicPodcast = {
	isEnabled: true,
	hasFullPodcastEpisodes: true,
	canRemovePodcastEpisodes: true,
	unpublishedPodcastEpisode: null,
	seasons: [],
	latestSeasonPodcastEpisodes: { podcastEpisodes: [] },
	publicFeedUrl: null,
}

// the topic's podcast, and whether the switch is on
type ToPodcastSwitchHtmlOptions = { topicPodcast: TopicPodcast; isPodcastEnabled: boolean }

// the switch's markup for a topic's podcast, with the switch on or off
function toPodcastSwitchHtml({ topicPodcast, isPodcastEnabled }: ToPodcastSwitchHtmlOptions): string {
	return renderToStaticMarkup(
		<PodcastSwitch
			topicPodcast={topicPodcast}
			isPodcastEnabled={isPodcastEnabled}
			isTopicOwner={false}
			onPodcastChange={() => {}}
		/>,
	)
}

// the switch says whether the podcast is on, and shows the free plan's short episode if the topic lacks full ones
test("the podcast switch says whether the podcast is on and shows the free plan's short episode", () => {
	// say whether the podcast is on
	expect(toPodcastSwitchHtml({ topicPodcast, isPodcastEnabled: true })).toContain(
		"Coffee Break episode after every brew",
	)
	expect(toPodcastSwitchHtml({ topicPodcast, isPodcastEnabled: false })).toContain("Coffee Break is off")

	// show the free plan's short episode only if the topic lacks full episodes
	expect(toPodcastSwitchHtml({ topicPodcast, isPodcastEnabled: true })).not.toContain("latest 10-minute episode")
	expect(
		toPodcastSwitchHtml({ topicPodcast: { ...topicPodcast, hasFullPodcastEpisodes: false }, isPodcastEnabled: true }),
	).toContain("latest 10-minute episode")
})
