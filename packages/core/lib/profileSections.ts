// a profile page's card sections, as both apps head them, under the profile payload's field names, and the rows of
// the rank dialogs that pin to them

import {
	sendPodcastEpisodeProfileOrder,
	sendTopicPodcastEpisodeVideoProfileOrder,
} from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicProfileOrder } from "@carlnotes/client/topicClient"
import { sendTopicPostProfileOrder } from "@carlnotes/client/topicPostClient"
import { toHomePodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import {
	PROFILE_PODCAST_EPISODE_LIMIT,
	PROFILE_TOPIC_LIMIT,
	PROFILE_TOPIC_PODCAST_EPISODE_VIDEO_LIMIT,
	type ProfilePodcastEpisodeCard,
	type ProfileResponse,
	type ProfileTopicCard,
	type ProfileTopicPostCard,
} from "@carlnotes/contracts/profilePage"
import {
	type CardSection,
	FEATURED_FILMS_TITLE,
	FEATURED_PODCASTS_TITLE,
	FEATURED_POSTS_TITLE,
	FEATURED_TOPICS_TITLE,
	PODCAST_EPISODE_CARD_SECTION,
	TOPIC_CARD_SECTION,
	TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	TOPIC_POST_CARD_SECTION,
} from "./cardSections"
import { type PinnedOrderMove, type RankedItem, type RankedNoun, toTopicPostRankedItem } from "./rankDialog"

// the person's topics, pinned first, their films, pinned first, right before their podcast episodes, pinned first,
// and every one of their published Topic Posts, pinned first
export const PROFILE_SECTIONS = {
	profileTopics: { value: "profile-topics", title: FEATURED_TOPICS_TITLE, ...TOPIC_CARD_SECTION },
	profileTopicPodcastEpisodeVideos: {
		value: "profile-topic-podcast-episode-videos",
		title: FEATURED_FILMS_TITLE,
		...TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	},
	profilePodcastEpisodes: {
		value: "profile-podcast-episodes",
		title: FEATURED_PODCASTS_TITLE,
		...PODCAST_EPISODE_CARD_SECTION,
	},
	profileTopicPosts: { value: "profile-order-topic-posts", title: FEATURED_POSTS_TITLE, ...TOPIC_POST_CARD_SECTION },
} satisfies {
	profileTopics: CardSection<ProfileTopicCard>
	profileTopicPodcastEpisodeVideos: CardSection<ProfilePodcastEpisodeCard>
	profilePodcastEpisodes: CardSection<ProfilePodcastEpisodeCard>
	profileTopicPosts: CardSection<ProfileTopicPostCard>
}

// the profile, whether the signed-in user is the person, and the person's own topics once they load
type ToProfileTopicCountOptions = {
	profile: Pick<ProfileResponse, "topics">
	isOwnProfile: boolean
	ownTopics: unknown[] | null | undefined
}

/**
 * Returns how many topics a profile's All Topics table lists: the person's own once they load, and null until then,
 * or the ones the profile shows anyone else.
 */
export function toProfileTopicCount({ profile, isOwnProfile, ownTopics }: ToProfileTopicCountOptions): number | null {
	return isOwnProfile ? (ownTopics?.length ?? null) : profile.topics.length
}

// the values of the profile's card sections, which start open
export const PROFILE_SECTION_VALUES = Object.values(PROFILE_SECTIONS).map((profileSection) => profileSection.value)

// the rows of a profile's rank dialog: the pinned ones in their order, and every one its person may pin
type ProfileRankItems = { pinnedItems: RankedItem[]; candidateItems: RankedItem[] }

// the profile fields that hold the topic cards and how many of the first are pinned
type ProfileTopicCards = Pick<ProfileResponse, "profileTopics" | "pinnedTopicCount">

// the profile fields that hold the film cards and how many of the first are pinned
type ProfileTopicPodcastEpisodeVideoCards = Pick<
	ProfileResponse,
	"profileTopicPodcastEpisodeVideos" | "pinnedTopicPodcastEpisodeVideoCount"
>

// the profile fields that hold the podcast episode cards and how many of the first are pinned
type ProfilePodcastEpisodeCards = Pick<ProfileResponse, "profilePodcastEpisodes" | "pinnedPodcastEpisodeCount">

/**
 * Returns the rows of the rank dialog for a profile's topics: the pinned topics, which lead the cards, and every
 * public topic, which is what its owner may pin.
 */
export function toProfileTopicRankItems({ profileTopics, pinnedTopicCount }: ProfileTopicCards): ProfileRankItems {
	const rankedItems = profileTopics.map((profileTopic) => ({ id: profileTopic.id, label: profileTopic.name }))
	return {
		pinnedItems: rankedItems.slice(0, pinnedTopicCount),
		candidateItems: rankedItems.filter((_rankedItem, index) => profileTopics[index]?.isPublic),
	}
}

/**
 * Returns the rows of the rank dialog for a profile's podcast episodes: the pinned ones, which lead the cards, and
 * every one of a public topic, each named by its title and its topic.
 */
export function toProfilePodcastEpisodeRankItems({
	profilePodcastEpisodes,
	pinnedPodcastEpisodeCount,
}: ProfilePodcastEpisodeCards): ProfileRankItems {
	return toPodcastEpisodeCardRankItems(profilePodcastEpisodes, pinnedPodcastEpisodeCount)
}

// the rows of the rank dialog for podcast episode cards or film cards, whose first cards are the pinned ones
function toPodcastEpisodeCardRankItems(
	profilePodcastEpisodeCards: ProfilePodcastEpisodeCard[],
	pinnedCount: number,
): ProfileRankItems {
	const rankedItems = profilePodcastEpisodeCards.map(({ podcastEpisode, topic }) => ({
		id: podcastEpisode.id,
		label: toHomePodcastEpisodeLabel({ title: podcastEpisode.title ?? topic.name, topicName: topic.name }),
	}))
	return {
		pinnedItems: rankedItems.slice(0, pinnedCount),
		candidateItems: rankedItems.filter((_rankedItem, index) => profilePodcastEpisodeCards[index]?.isTopicPublic),
	}
}

// the profile fields that hold every Topic Post card and how many of the first are pinned
type ProfileTopicPostCards = Pick<ProfileResponse, "profileTopicPosts" | "pinnedTopicPostCount">

/**
 * Returns the rows of the rank dialog for a profile's Topic Posts: the pinned ones, which lead the cards, and every
 * published one of a public topic, each named by its title and its topic.
 */
export function toProfileTopicPostRankItems({
	profileTopicPosts,
	pinnedTopicPostCount,
}: ProfileTopicPostCards): ProfileRankItems {
	return {
		pinnedItems: profileTopicPosts.slice(0, pinnedTopicPostCount).map(toTopicPostRankedItem),
		candidateItems: profileTopicPosts.filter((topicPost) => topicPost.isTopicPublic).map(toTopicPostRankedItem),
	}
}

// the client write that sets a profile order, for what each rank dialog ranks
const PROFILE_ORDER_SENDS: Record<RankedNoun, (id: string, position: number) => Promise<void>> = {
	topics: sendTopicProfileOrder,
	films: sendTopicPodcastEpisodeVideoProfileOrder,
	podcasts: sendPodcastEpisodeProfileOrder,
	posts: sendTopicPostProfileOrder,
}

/**
 * Sends a profile rank dialog's moves one at a time, in order, for the topics, the films, the podcast episodes, or
 * the Topic Posts. Throws an error on the first move the api rejects.
 */
export async function sendProfileOrderMoves(
	rankedNoun: RankedNoun,
	pinnedOrderMoves: PinnedOrderMove[],
): Promise<void> {
	const sendProfileOrder = PROFILE_ORDER_SENDS[rankedNoun]
	for (const pinnedOrderMove of pinnedOrderMoves) {
		await sendProfileOrder(pinnedOrderMove.id, pinnedOrderMove.position)
	}
}

// the profile fields that every rank dialog's rows come from
type ProfileRankCards = ProfileTopicCards &
	ProfileTopicPodcastEpisodeVideoCards &
	ProfilePodcastEpisodeCards &
	ProfileTopicPostCards

/**
 * Returns the rows and the limit of a profile's rank dialog for the topics, the films, the podcast episodes, or the
 * Topic Posts, which have no limit.
 */
export function toProfileRankDialogItems(
	rankedNoun: RankedNoun,
	profile: ProfileRankCards,
): ProfileRankItems & { limit?: number } {
	// the topics, or the films, which are named as their podcast episodes are
	if (rankedNoun === "topics") {
		return { ...toProfileTopicRankItems(profile), limit: PROFILE_TOPIC_LIMIT }
	}
	if (rankedNoun === "films") {
		const { profileTopicPodcastEpisodeVideos, pinnedTopicPodcastEpisodeVideoCount } = profile
		return {
			...toPodcastEpisodeCardRankItems(profileTopicPodcastEpisodeVideos, pinnedTopicPodcastEpisodeVideoCount),
			limit: PROFILE_TOPIC_PODCAST_EPISODE_VIDEO_LIMIT,
		}
	}

	// the podcast episodes, or the Topic Posts, which a person pins without a limit
	return rankedNoun === "podcasts"
		? { ...toProfilePodcastEpisodeRankItems(profile), limit: PROFILE_PODCAST_EPISODE_LIMIT }
		: toProfileTopicPostRankItems(profile)
}

// what a profile's action menu offers its person to pin, in the card sections' order
const PROFILE_RANKED_NOUNS: RankedNoun[] = ["topics", "films", "podcasts", "posts"]

/**
 * Returns what a profile's action menu offers to pin: each kind for the person on their own profile, in the card
 * sections' order, and none for anyone else.
 */
export function toProfileRankedNouns(isOwnProfile: boolean): RankedNoun[] {
	return isOwnProfile ? PROFILE_RANKED_NOUNS : []
}

// the line and the retry label of the person's own topics after their read fails
export const TOPICS_LOAD_FAILED_LINE = "Topics didn't load."
export const RETRY_LOADING_TOPICS_LABEL = "Retry loading topics"
