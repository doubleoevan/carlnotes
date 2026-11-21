// the profile page contract: the user, their topic table, and the teams they belong to
import { z } from "zod"
import { ownerTopic } from "./activity"
import { cardsPagePosition } from "./cardPages"
import { podcastEpisodeCard, topicCard } from "./home"
import { topic } from "./profiles"
import { teamSummary } from "./teams"
import { topicPostCard } from "./topicPosts"

// how many topics, films, and podcast episodes a person features at the top of their profile. their featured Topic Posts
// have no limit
export const PROFILE_TOPIC_LIMIT = 12
export const PROFILE_TOPIC_VIDEO_LIMIT = 12
export const PROFILE_PODCAST_EPISODE_LIMIT = 12

// a topic's card on a profile, with whether the topic is public and whether the person owns it
const profileTopicCard = topicCard.extend({ isPublic: z.boolean(), isOwned: z.boolean() })

export type ProfileTopicCard = z.infer<typeof profileTopicCard>

// a podcast episode's card on a profile, with whether its topic is public and whether the person owns it
const profilePodcastEpisodeCard = podcastEpisodeCard.extend({ isTopicPublic: z.boolean(), isTopicOwned: z.boolean() })

export type ProfilePodcastEpisodeCard = z.infer<typeof profilePodcastEpisodeCard>

// a Topic Post's card on a profile, with whether its topic is public, which decides whether its author may feature it
const profileTopicPostCard = topicPostCard.extend({ isTopicPublic: z.boolean() })

export type ProfileTopicPostCard = z.infer<typeof profileTopicPostCard>

// the profile page payload
export const profileResponse = z.object({
	// the avatar's tint is seeded from the user id, so the id is included with the profile
	userId: z.string(),
	username: z.string(),
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: z.string(),
	avatarVersion: z.string().nullable(),
	joinedAt: z.string(),
	// distinct people, not summed rows. the same person subscribed to multiple Topics counts once here
	subscriberCount: z.number(),
	// the profile's viewers as last saved, which its viewer count line shows until its first poll a minute later. absent
	// from an api older than the field
	viewerCount: z.number().optional(),
	// whether the topics below include the user's private and invite ones, which only the owner and an admin view
	includesNonPublicTopics: z.boolean(),
	// whether the signed-in user has blocked this person. false for a visitor and on the user's own profile
	isBlocked: z.boolean(),
	topics: z.array(topic),
	// on the person's own profile, the table's topics with the owner's columns, and null for anyone else
	ownTopics: z.array(ownerTopic).nullable().optional(),
	// the teams this user belongs to, as the teams summary rows them. their own profile lists them all
	teams: z.array(teamSummary),
	// the person's topics the user may open, as cards: the featured ones in their order, then the rest in the home's
	// trending order, with how many of the first are featured. each count below keeps the pinned name, because the frozen
	// api contract reads it
	profileTopics: z.array(profileTopicCard),
	pinnedTopicCount: z.number().int().nonnegative(),
	// the published podcast episodes of those topics that have a ready film, as film cards: the featured films in their
	// order, then the most listened one of each other topic, with how many of the first are featured. the field's name
	// must not change, because the frozen api contract reads it
	profileTopicPodcastEpisodeVideos: z.array(profilePodcastEpisodeCard),
	pinnedTopicPodcastEpisodeVideoCount: z.number().int().nonnegative(),
	// the published podcast episodes of those topics, as cards: the featured ones in their order, then the most listened
	// one of each other topic, with how many of the first are featured
	profilePodcastEpisodes: z.array(profilePodcastEpisodeCard),
	pinnedPodcastEpisodeCount: z.number().int().nonnegative(),
	// every published Topic Post of the person that the user may read, as cards: the featured ones in their order, then
	// the rest newest first, with how many of the first are featured. the person reads every one, and anyone else the
	// posts of public topics alone
	profileTopicPosts: z.array(profileTopicPostCard),
	pinnedTopicPostCount: z.number().int().nonnegative(),
	// which page profileTopicPosts holds, if the read asked for pages. absent otherwise, and then it holds every post
	profileTopicPostsPage: cardsPagePosition.optional(),
})

export type ProfileResponse = z.infer<typeof profileResponse>

/**
 * Returns a profile page's title: the person's username, then Café.
 */
export function toProfilePageTitle(username: string): string {
	return `${username} Café`
}
