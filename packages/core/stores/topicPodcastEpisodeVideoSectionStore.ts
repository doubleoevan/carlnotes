// Topic Cinema on the open topic page: the film it shows, whether it is open, and the requests to scroll to it. the
// topic read decides the first render, and a user's open or close choice saves with the latest film
import { sendTopicPodcastEpisodeVideoSection } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { isUserSignedIn } from "./podcastEpisodeListenStore"
import { playTopicPodcastEpisodeVideo } from "./podcastEpisodePlayerStore"
import { toStoreListeners } from "./storeListeners"

// Topic Cinema as the topic read returns it: the latest film and whether the section opens
export type TopicPodcastEpisodeVideoSection = { podcastEpisode: PodcastEpisode; isOpen: boolean }

// the changes a user made on one topic's page: another film from Coffee Break films, a toggle, and how many times a
// row asked the section to scroll into view
type TopicPodcastEpisodeVideoSectionChange = {
	topicId: string
	podcastEpisode?: PodcastEpisode
	isOpen?: boolean
	scrollRequestCount: number
}

// the open page's changes, which reset on another topic
let sectionChange: TopicPodcastEpisodeVideoSectionChange | null = null
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Returns Topic Cinema on a topic's page: the film it shows, whether it is open, and the count of scroll requests.
 */
export function useTopicPodcastEpisodeVideoSection(
	topicId: string,
	topicPodcastEpisodeVideoSection: TopicPodcastEpisodeVideoSection,
): TopicPodcastEpisodeVideoSection & { scrollRequestCount: number } {
	useStoreVersion()
	return toTopicPodcastEpisodeVideoSection(topicId, topicPodcastEpisodeVideoSection)
}

/**
 * Returns Topic Cinema on a topic's page now: the read's section, with this page's changes over it.
 */
export function toTopicPodcastEpisodeVideoSection(
	topicId: string,
	topicPodcastEpisodeVideoSection: TopicPodcastEpisodeVideoSection,
): TopicPodcastEpisodeVideoSection & { scrollRequestCount: number } {
	const topicSectionChange = sectionChange?.topicId === topicId ? sectionChange : null
	return {
		podcastEpisode: topicSectionChange?.podcastEpisode ?? topicPodcastEpisodeVideoSection.podcastEpisode,
		isOpen: topicSectionChange?.isOpen ?? topicPodcastEpisodeVideoSection.isOpen,
		scrollRequestCount: topicSectionChange?.scrollRequestCount ?? 0,
	}
}

// the topic, the latest film's podcast episode, and the user's choice
type SetTopicPodcastEpisodeVideoSectionOpenOptions = {
	topicId: string
	latestPodcastEpisodeId: string
	isOpen: boolean
}

/**
 * Opens or closes Topic Cinema, and saves a signed-in user's choice with the latest film.
 */
export function setTopicPodcastEpisodeVideoSectionOpen({
	topicId,
	latestPodcastEpisodeId,
	isOpen,
}: SetTopicPodcastEpisodeVideoSectionOpenOptions): void {
	updateSectionChange(topicId, { isOpen })
	if (isUserSignedIn()) {
		void sendTopicPodcastEpisodeVideoSection({ topicId, podcastEpisodeId: latestPodcastEpisodeId, isOpen })
	}
}

/**
 * Loads a film into Topic Cinema, opens the section, asks it to scroll into view, and plays the film.
 */
export function playInTopicPodcastEpisodeVideoSection(topicId: string, podcastEpisode: PodcastEpisode): void {
	// show the film in an open section, and ask the section to scroll to it
	const scrollRequestCount = sectionChange?.topicId === topicId ? sectionChange.scrollRequestCount + 1 : 1
	updateSectionChange(topicId, { podcastEpisode, isOpen: true, scrollRequestCount })
	void playTopicPodcastEpisodeVideo(podcastEpisode)
}

// apply a change on the topic's page, dropping another topic's changes
function updateSectionChange(
	topicId: string,
	change: Partial<Omit<TopicPodcastEpisodeVideoSectionChange, "topicId">>,
): void {
	const topicSectionChange = sectionChange?.topicId === topicId ? sectionChange : { topicId, scrollRequestCount: 0 }
	sectionChange = { ...topicSectionChange, ...change }
	publish()
}
