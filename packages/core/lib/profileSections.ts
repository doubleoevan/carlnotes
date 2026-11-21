// a profile page's card sections, as both apps head them, under the profile payload's field names, and the rows of
// the rank dialogs that feature items on them

import {
	sendPodcastEpisodeProfileOrder,
	sendTopicPodcastEpisodeVideoProfileOrder,
} from "@carlnotes/client/podcastEpisodeClient"
import { fetchProfileTopicPostsPage } from "@carlnotes/client/profileClient"
import { sendTopicProfileOrder } from "@carlnotes/client/topicClient"
import { sendTopicPostProfileOrder } from "@carlnotes/client/topicPostClient"
import { toHomePodcastEpisodeLabel } from "@carlnotes/contracts/podcast"
import {
	PROFILE_PODCAST_EPISODE_LIMIT,
	PROFILE_TOPIC_LIMIT,
	PROFILE_TOPIC_VIDEO_LIMIT,
	type ProfilePodcastEpisodeCard,
	type ProfileResponse,
	type ProfileTopicCard,
	type ProfileTopicPostCard,
} from "@carlnotes/contracts/profilePage"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import type { ServerCardPages } from "../hooks/useServerPagedCards"
import {
	type CardSection,
	FEATURED_FILMS_TITLE,
	FEATURED_PODCASTS_TITLE,
	FEATURED_POSTS_TITLE,
	FEATURED_TOPICS_TITLE,
	PODCAST_EPISODE_CARD_SECTION,
	TOPIC_CARD_SECTION,
	TOPIC_POST_CARD_SECTION,
	TOPIC_POSTS_PAGE_SEARCH_KEY,
	TOPIC_VIDEO_CARD_SECTION,
	toCardsPageRows,
} from "./cardSections"
import { type FeaturedOrderMove, type RankedItem, type RankedNoun, toTopicPostRankedItem } from "./rankDialog"

// the person's topics, featured first, their films, featured first, right before their podcast episodes, featured first,
// and every one of their published Topic Posts, featured first
export const PROFILE_SECTIONS = {
	profileTopics: { value: "profile-topics", title: FEATURED_TOPICS_TITLE, ...TOPIC_CARD_SECTION },
	profileTopicPodcastEpisodeVideos: {
		value: "profile-topic-videos",
		title: FEATURED_FILMS_TITLE,
		...TOPIC_VIDEO_CARD_SECTION,
	},
	profilePodcastEpisodes: {
		value: "profile-podcast-episodes",
		title: FEATURED_PODCASTS_TITLE,
		...PODCAST_EPISODE_CARD_SECTION,
	},
	profileTopicPosts: {
		value: "profile-order-topic-posts",
		title: FEATURED_POSTS_TITLE,
		pageSearchKey: TOPIC_POSTS_PAGE_SEARCH_KEY,
		...TOPIC_POST_CARD_SECTION,
	},
} satisfies {
	profileTopics: CardSection<ProfileTopicCard>
	profileTopicPodcastEpisodeVideos: CardSection<ProfilePodcastEpisodeCard>
	profilePodcastEpisodes: CardSection<ProfilePodcastEpisodeCard>
	profileTopicPosts: CardSection<ProfileTopicPostCard>
}

// the values of the profile's card sections, which start open
export const PROFILE_SECTION_VALUES = Object.values(PROFILE_SECTIONS).map((profileSection) => profileSection.value)

// the rows of a profile's rank dialog: the featured ones in their order, and every one its person may feature
type ProfileRankItems = { featuredItems: RankedItem[]; candidateItems: RankedItem[] }

// the profile fields that hold the topic cards and how many of the first are featured
type ProfileTopicCards = Pick<ProfileResponse, "profileTopics" | "pinnedTopicCount">

// the profile fields that hold the film cards and how many of the first are featured
type ProfileTopicVideoCards = Pick<
	ProfileResponse,
	"profileTopicPodcastEpisodeVideos" | "pinnedTopicPodcastEpisodeVideoCount"
>

// the profile fields that hold the podcast episode cards and how many of the first are featured
type ProfilePodcastEpisodeCards = Pick<ProfileResponse, "profilePodcastEpisodes" | "pinnedPodcastEpisodeCount">

/**
 * Returns the rows of the rank dialog for a profile's topics: the featured topics, which lead the cards, and every
 * public topic the person owns, which is what they may feature.
 */
export function toProfileTopicRankItems({ profileTopics, pinnedTopicCount }: ProfileTopicCards): ProfileRankItems {
	const rankedItems = profileTopics.map((profileTopic) => ({ id: profileTopic.id, label: profileTopic.name }))
	return {
		featuredItems: rankedItems.slice(0, pinnedTopicCount),
		candidateItems: rankedItems.filter((_rankedItem, index) => {
			const profileTopic = profileTopics[index]
			return profileTopic?.isPublic && profileTopic.isOwned
		}),
	}
}

/**
 * Returns the rows of the rank dialog for a profile's podcast episodes: the featured ones, which lead the cards, and
 * every one of a public topic the person owns, each named by its title and its topic.
 */
export function toProfilePodcastEpisodeRankItems({
	profilePodcastEpisodes,
	pinnedPodcastEpisodeCount,
}: ProfilePodcastEpisodeCards): ProfileRankItems {
	return toPodcastEpisodeCardRankItems(profilePodcastEpisodes, pinnedPodcastEpisodeCount)
}

// the rows of the rank dialog for podcast episode cards or film cards, whose first cards are the featured ones
function toPodcastEpisodeCardRankItems(
	profilePodcastEpisodeCards: ProfilePodcastEpisodeCard[],
	featuredCount: number,
): ProfileRankItems {
	const rankedItems = profilePodcastEpisodeCards.map(({ podcastEpisode, topic }) => ({
		id: podcastEpisode.id,
		label: toHomePodcastEpisodeLabel({ title: podcastEpisode.title ?? topic.name, topicName: topic.name }),
	}))
	return {
		featuredItems: rankedItems.slice(0, featuredCount),
		candidateItems: rankedItems.filter((_rankedItem, index) => {
			const profilePodcastEpisodeCard = profilePodcastEpisodeCards[index]
			return profilePodcastEpisodeCard?.isTopicPublic && profilePodcastEpisodeCard.isTopicOwned
		}),
	}
}

// the profile fields that hold every Topic Post card and how many of the first are featured
type ProfileTopicPostCards = Pick<ProfileResponse, "profileTopicPosts" | "pinnedTopicPostCount">

/**
 * Returns the rows of the rank dialog for a profile's Topic Posts: the featured ones, which lead the cards, and every
 * published one of a public topic, each named by its title and its topic.
 */
export function toProfileTopicPostRankItems({
	profileTopicPosts,
	pinnedTopicPostCount,
}: ProfileTopicPostCards): ProfileRankItems {
	return {
		featuredItems: profileTopicPosts.slice(0, pinnedTopicPostCount).map(toTopicPostRankedItem),
		candidateItems: profileTopicPosts.filter((topicPost) => topicPost.isTopicPublic).map(toTopicPostRankedItem),
	}
}

/**
 * Returns the pages of a profile's Topic Post cards if its read asked for pages, or undefined for a read that holds
 * them whole. A later page is read for the audience the page shows to.
 */
export function toProfileTopicPostCardPages(
	profile: Pick<ProfileResponse, "userId" | "profileTopicPosts" | "profileTopicPostsPage">,
	audience: ProfileAudience | undefined,
): ServerCardPages<TopicPostCard> | undefined {
	const { userId, profileTopicPosts, profileTopicPostsPage } = profile
	if (!profileTopicPostsPage) {
		return undefined
	}
	return {
		queryKey: ["profile-topic-posts", userId, audience ?? null],
		loadedPage: { rows: profileTopicPosts, ...profileTopicPostsPage },
		fetchPage: (page) => fetchProfileTopicPostsPage(userId, page, audience).then(toCardsPageRows("topicPosts")),
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
	featuredOrderMoves: FeaturedOrderMove[],
): Promise<void> {
	const sendProfileOrder = PROFILE_ORDER_SENDS[rankedNoun]
	for (const featuredOrderMove of featuredOrderMoves) {
		await sendProfileOrder(featuredOrderMove.id, featuredOrderMove.position)
	}
}

// the profile fields that every rank dialog's rows come from
type ProfileRankCards = ProfileTopicCards & ProfileTopicVideoCards & ProfilePodcastEpisodeCards & ProfileTopicPostCards

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
			limit: PROFILE_TOPIC_VIDEO_LIMIT,
		}
	}

	// the podcast episodes, or the Topic Posts, which a person features without a limit
	return rankedNoun === "podcasts"
		? { ...toProfilePodcastEpisodeRankItems(profile), limit: PROFILE_PODCAST_EPISODE_LIMIT }
		: toProfileTopicPostRankItems(profile)
}

// what a profile's action menu offers its person to feature, in the card sections' order
const PROFILE_RANKED_NOUNS: RankedNoun[] = ["topics", "films", "podcasts", "posts"]

/**
 * Returns what a profile's action menu offers to feature: each kind for the person on their own profile, in the card
 * sections' order, and none for anyone else.
 */
export function toProfileRankedNouns(isOwnProfile: boolean): RankedNoun[] {
	return isOwnProfile ? PROFILE_RANKED_NOUNS : []
}
