// edit topic modal tests: what the podcast switch says for each state of the podcast, and what a retried Save does
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as topicClient from "@carlnotes/client/topicClient"
import type { TopicPodcast } from "@carlnotes/contracts/podcast"
import { renderToStaticMarkup } from "react-dom/server"
import { PodcastSwitch } from "./EditTopicModal"
import { saveTopic } from "./saveTopic"
import type { TopicTeamField } from "./TopicTeamSelect"
import type { TopicFields } from "./useTopicFields"

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
			podcastSwitchId="podcast-switch"
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

// the switch takes the id its Podcast field label names it by
test("the podcast switch takes the id of its field label", () => {
	expect(toPodcastSwitchHtml({ topicPodcast, isPodcastEnabled: true })).toContain('id="podcast-switch"')
})

// put the topic client's spies back after each save test
afterEach(() => {
	mock.restore()
})

// the fields of a new private topic with one file staged to upload. the setters do nothing here
function toNewTopicFields(): TopicFields {
	const fields: Partial<TopicFields> = {
		name: "Coffee",
		prompt: "Coffee news",
		tags: [],
		frequency: "weekly",
		scheduledTime: "07:00",
		scheduledDayOfWeek: "monday",
		visibility: "private",
		maxTopicFindings: 5,
		isPodcastEnabled: false,
		emailInvites: [],
		usernameInvites: [],
		defaultSourceKeys: [],
		keptSources: [],
		addedSources: [],
		keptAttachments: [],
		pendingFiles: [new File(["notes"], "notes.txt", { type: "text/plain" })],
		setPendingFiles: () => {},
		promptSourceUrls: [],
	}
	return fields as TopicFields
}

// a retried Save after a failed attachment upload updates the topic the first attempt created
test("a retried saveTopic updates the topic the failed Save created", async () => {
	// the create succeeds, the first upload fails, and the retry's upload succeeds
	const sendCreateTopicSpy = spyOn(topicClient, "sendCreateTopic").mockResolvedValue("topic-1")
	const sendUpdateTopicSpy = spyOn(topicClient, "sendUpdateTopic").mockResolvedValue(undefined)
	spyOn(topicClient, "uploadTopicAttachment")
		.mockRejectedValueOnce(new Error("upload failed"))
		.mockResolvedValueOnce(undefined)
	const saveTopicOptions = {
		topic: undefined,
		createdTopicId: { current: null as string | null },
		fields: toNewTopicFields(),
		topicTeam: { assignTopicTeam: async () => {} } as unknown as TopicTeamField,
	}

	// the first Save creates the topic and throws on the upload
	await expect(saveTopic(saveTopicOptions)).rejects.toThrow("upload failed")
	expect(sendCreateTopicSpy).toHaveBeenCalledTimes(1)
	expect(saveTopicOptions.createdTopicId.current).toBe("topic-1")

	// the retry updates that topic and creates nothing
	expect(await saveTopic(saveTopicOptions)).toBe("topic-1")
	expect(sendCreateTopicSpy).toHaveBeenCalledTimes(1)
	expect(sendUpdateTopicSpy).toHaveBeenCalledWith("topic-1", expect.objectContaining({ name: "Coffee" }))
})
