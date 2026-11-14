import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { ComponentType, ReactNode } from "react"
import { toSectionCountLabel } from "../lib/labels"
import { PROFILE_SECTIONS } from "../lib/profileSections"
import type { PageSectionsElements } from "./pageSectionsElements"

export type ProfileSectionsElements = PageSectionsElements & {
	// the empty card of the person's own topics table
	NewTopicEmptyCard: ComponentType
}

/**
 * Lays out a profile's sections in order: the news, the topic, film, podcast episode, and Topic Post cards, each
 * hidden while it has none, then the topics table and the teams table.
 */
export function ProfileSections({
	profile,
	isOwnProfile,
	newsList,
	renderOwnerTopicsTable,
	topicsTable,
	teamsTable,
	elements: {
		SectionsGroup,
		PagedCardsSection,
		TopicCard,
		PodcastEpisodeCard,
		TopicPostCard,
		Section,
		EmptyCard,
		NewTopicEmptyCard,
	},
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	newsList: ReactNode
	renderOwnerTopicsTable: (ownTopics: OwnerTopic[]) => ReactNode
	// the topics a visitor may read, which show while the profile has any
	topicsTable: ReactNode
	// the person's teams, which show while they are on any
	teamsTable: ReactNode
	elements: ProfileSectionsElements
}) {
	// the person's own topics with their owner columns, or the topics anyone else reads
	const ownTopics = isOwnProfile ? (profile.ownTopics ?? null) : null
	const toTopicsSectionContent = (): ReactNode => {
		if (ownTopics) {
			return ownTopics.length > 0 ? renderOwnerTopicsTable(ownTopics) : <NewTopicEmptyCard />
		}
		return profile.topics.length > 0 ? topicsTable : <EmptyCard text="No public topics." />
	}
	return (
		<>
			{/* the person's news, which they read whole and anyone else reads as its public rows */}
			{newsList}
			<SectionsGroup>
				{/* the films come right before the podcast episodes, and the Topic Posts section lists every published
				    one */}
				<PagedCardsSection
					section={PROFILE_SECTIONS.profileTopics}
					rows={profile.profileTopics}
					renderCard={(topic) => <TopicCard topic={topic} />}
				/>
				<PagedCardsSection
					section={PROFILE_SECTIONS.profileTopicPodcastEpisodeVideos}
					rows={profile.profileTopicPodcastEpisodeVideos}
					renderCard={(podcastEpisodeCard) => (
						<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} videoSurface="profile-videos" />
					)}
				/>
				<PagedCardsSection
					section={PROFILE_SECTIONS.profilePodcastEpisodes}
					rows={profile.profilePodcastEpisodes}
					renderCard={(podcastEpisodeCard) => <PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} />}
				/>
				<PagedCardsSection
					section={PROFILE_SECTIONS.profileTopicPosts}
					rows={profile.profileTopicPosts}
					renderCard={(topicPost) => <TopicPostCard topicPost={topicPost} />}
				/>

				{/* the two tables, each under its title with its count at the far right, as the card sections are */}
				<Section value="topics" title="All Topics" countLabel={toSectionCountLabel(profile.topics.length, "topic")}>
					{toTopicsSectionContent()}
				</Section>
				<Section value="teams" title="All Teams" countLabel={toSectionCountLabel(profile.teams.length, "team")}>
					{profile.teams.length > 0 ? (
						teamsTable
					) : (
						<EmptyCard text={isOwnProfile ? "You are on no teams yet." : "No public teams."} />
					)}
				</Section>
			</SectionsGroup>
		</>
	)
}
