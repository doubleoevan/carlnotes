// the topic video section on the open topic page: the film it shows, whether it is open, and the requests to scroll to
// it. the section opens on each page load
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { useEffect } from "react"
import { playTopicVideo } from "./podcastEpisodePlayerStore"
import { toStoreListeners } from "./storeListeners"

// the topic video section as the topic read returns it: the latest film
export type TopicVideoSection = { podcastEpisode: PodcastEpisode }

// the topic video section on the page: the film it shows, whether it is open, and the count of scroll requests
type ShownTopicVideoSection = TopicVideoSection & {
	isOpen: boolean
	scrollRequestCount: number
}

// the changes a user made on one topic's page: another film from Coffee Break films, a toggle, and how many times a
// row asked the section to scroll into view
type TopicVideoSectionChange = {
	topicId: string
	podcastEpisode?: PodcastEpisode
	isOpen?: boolean
	scrollRequestCount: number
}

// the open page's changes, which reset on another topic and when the page closes
let sectionChange: TopicVideoSectionChange | null = null
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Returns the topic video section on a topic's page: the film it shows, whether it is open, and the count of scroll
 * requests.
 */
export function useTopicVideoSection(topicId: string, topicVideoSection: TopicVideoSection): ShownTopicVideoSection {
	// the page's changes end with the page, so the section opens again on the next visit
	useStoreVersion()
	useEffect(() => () => clearTopicVideoSectionChange(topicId), [topicId])
	return toTopicVideoSection(topicId, topicVideoSection)
}

/**
 * Drops the changes made on a topic's page once the page closes, so its next visit shows the latest film, open.
 */
export function clearTopicVideoSectionChange(topicId: string): void {
	if (sectionChange?.topicId === topicId) {
		sectionChange = null
	}
}

/**
 * Returns the topic video section on a topic's page now: the read's film in an open section, with this page's changes
 * over it.
 */
export function toTopicVideoSection(topicId: string, topicVideoSection: TopicVideoSection): ShownTopicVideoSection {
	const topicSectionChange = sectionChange?.topicId === topicId ? sectionChange : null
	return {
		podcastEpisode: topicSectionChange?.podcastEpisode ?? topicVideoSection.podcastEpisode,
		isOpen: topicSectionChange?.isOpen ?? true,
		scrollRequestCount: topicSectionChange?.scrollRequestCount ?? 0,
	}
}

/**
 * Opens or closes the topic video section on the topic's page.
 */
export function setTopicVideoSectionOpen({ topicId, isOpen }: { topicId: string; isOpen: boolean }): void {
	updateSectionChange(topicId, { isOpen })
}

/**
 * Loads a film into the topic video section, opens the section, asks it to scroll into view, and plays the film.
 */
export function playInTopicVideoSection(topicId: string, podcastEpisode: PodcastEpisode): void {
	// show the film in an open section, and ask the section to scroll to it
	const scrollRequestCount = sectionChange?.topicId === topicId ? sectionChange.scrollRequestCount + 1 : 1
	updateSectionChange(topicId, { podcastEpisode, isOpen: true, scrollRequestCount })
	void playTopicVideo(podcastEpisode)
}

// apply a change on the topic's page, dropping another topic's changes
function updateSectionChange(topicId: string, change: Partial<Omit<TopicVideoSectionChange, "topicId">>): void {
	const topicSectionChange = sectionChange?.topicId === topicId ? sectionChange : { topicId, scrollRequestCount: 0 }
	sectionChange = { ...topicSectionChange, ...change }
	publish()
}
