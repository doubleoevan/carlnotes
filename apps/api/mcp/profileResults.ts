// what read_profile returns: the profile page as the caller may see it, its news, cards, topic table, and teams, each
// list limited to its share of the result, with what people wrote fenced as untrusted
import type { NewsResponse } from "@carlnotes/contracts/news"
import type { ProfilePodcastEpisodeCard, ProfileResponse } from "@carlnotes/contracts/profilePage"
import { toProfilePath, toTeamPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import { toFencedNewsEvent } from "./newsTool"
import {
	type McpSection,
	type McpTopicTableRow,
	toFencedNullable,
	toMcpSection,
	toMcpTopicTableRow,
	UNTRUSTED_TEXT_NOTICE,
} from "./results"

// the most characters that each of a profile's eight lists returns
const PROFILE_SECTION_MAX_CHARS = 4_500

// a podcast episode or film card as the model reads it
type McpProfilePodcastEpisode = {
	podcastEpisodeId: string
	title: string | null
	topicName: string
	isTopicPublic: boolean
	publishedAt: string | null
	url: string | null
}

// a profile as read_profile returns it
type McpProfile = {
	notice: string
	userId: string
	username: string
	joinedAt: string
	subscriberCount: number
	// whether the lists include the person's private and invite topics, and whether the caller blocked the person
	includesNonPublicTopics: boolean
	isBlocked: boolean
	pageUrl: string
	// the page's sections in its order, each limited
	news: McpSection<Record<string, unknown>>
	profileTopics: McpSection<{ id: string; name: string; isPublic: boolean; reactionCount: number; url: string }>
	films: McpSection<McpProfilePodcastEpisode>
	podcastEpisodes: McpSection<McpProfilePodcastEpisode>
	topicPosts: McpSection<{ id: string; title: string; topicName: string; publishedAt: string | null; url: string }>
	topicTable: McpSection<McpTopicTableRow>
	teams: McpSection<{ teamId: string; name: string; isPublic: boolean; memberCount: number; url: string }>
}

/**
 * Returns a profile as the model reads it: the header, the week's news, the featured topics, films, podcast episodes,
 * and Topic Posts, and the topic table and teams, each limited, with every name and title fenced.
 */
export function toMcpProfile(profile: ProfileResponse, newsPage: NewsResponse | null): McpProfile {
	// the names, titles, and lines are someone's words
	const toFencedText = toUntrustedFence()
	const toSection = <Item>(items: Item[]): McpSection<Item> => toMcpSection(items, PROFILE_SECTION_MAX_CHARS)
	const toMcpPodcastEpisode = ({
		podcastEpisode,
		topic,
		isTopicPublic,
	}: ProfilePodcastEpisodeCard): McpProfilePodcastEpisode => ({
		podcastEpisodeId: podcastEpisode.id,
		title: toFencedNullable(toFencedText, podcastEpisode.title),
		topicName: toFencedText(topic.name),
		isTopicPublic,
		publishedAt: podcastEpisode.publishedAt,
		url: podcastEpisode.pagePath ? `${SITE_URL}${podcastEpisode.pagePath}` : null,
	})

	// the header
	return {
		notice: UNTRUSTED_TEXT_NOTICE,
		userId: profile.userId,
		username: toFencedText(profile.username),
		joinedAt: profile.joinedAt,
		subscriberCount: profile.subscriberCount,
		includesNonPublicTopics: profile.includesNonPublicTopics,
		isBlocked: profile.isBlocked,
		pageUrl: `${SITE_URL}${toProfilePath(profile.userId)}`,
		// the week's news, and the featured cards in the page's order
		news: toSection((newsPage?.newsEvents ?? []).map((newsEvent) => toFencedNewsEvent(newsEvent, toFencedText))),
		profileTopics: toSection(
			profile.profileTopics.map((topicCard) => ({
				id: topicCard.id,
				name: toFencedText(topicCard.name),
				isPublic: topicCard.isPublic,
				reactionCount: topicCard.reactionCount,
				url: `${SITE_URL}${topicCard.path}`,
			})),
		),
		films: toSection(profile.profileTopicPodcastEpisodeVideos.map(toMcpPodcastEpisode)),
		podcastEpisodes: toSection(profile.profilePodcastEpisodes.map(toMcpPodcastEpisode)),
		topicPosts: toSection(
			profile.profileTopicPosts.map((topicPostCard) => ({
				id: topicPostCard.id,
				title: toFencedText(topicPostCard.title),
				topicName: toFencedText(topicPostCard.topicName),
				publishedAt: topicPostCard.publishedAt,
				url: `${SITE_URL}${topicPostCard.path}`,
			})),
		),
		// the topic table and the teams
		topicTable: toSection(profile.topics.map((topic) => toMcpTopicTableRow(topic, toFencedText))),
		teams: toSection(
			profile.teams.map((team) => ({
				teamId: team.teamId,
				name: toFencedText(team.name),
				isPublic: team.isPublic,
				memberCount: team.memberCount,
				url: `${SITE_URL}${toTeamPath(team.teamId)}`,
			})),
		),
	}
}
