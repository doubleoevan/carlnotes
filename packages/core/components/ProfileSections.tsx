import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { ComponentType, ReactNode } from "react"
import { toSectionCountLabel } from "../lib/labels"
import { PROFILE_SECTIONS, toProfileTopicCount } from "../lib/profileSections"
import type { PageSectionsElements } from "./pageSectionsElements"

export type ProfileSectionsElements = PageSectionsElements & {
	// the person's own topics while they load, after their read fails, and while they have none
	TableSkeleton: ComponentType
	TopicsLoadFailed: ComponentType<{ onRetry: () => void }>
	NewTopicEmptyCard: ComponentType
}

/**
 * Lays out a profile's sections in order: the news, the topic, film, podcast episode, and Topic Post cards, each
 * hidden while it has none, then the topics table and the teams table.
 */
export function ProfileSections({
	profile,
	isOwnProfile,
	ownTopics,
	isOwnTopicsLoadFailed,
	onLoadOwnTopics,
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
		TableSkeleton,
		TopicsLoadFailed,
		NewTopicEmptyCard,
	},
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	// the person's own topics with their owner columns, or null until they load
	ownTopics: OwnerTopic[] | null
	isOwnTopicsLoadFailed: boolean
	onLoadOwnTopics: () => void
	newsList: ReactNode
	renderOwnerTopicsTable: (ownTopics: OwnerTopic[]) => ReactNode
	// the topics a visitor may read, which show while the profile has any
	topicsTable: ReactNode
	// the person's teams, which show while they are on any
	teamsTable: ReactNode
	elements: ProfileSectionsElements
}) {
	// how many topics the table lists: the person's own once they load, or the ones the profile shows a visitor
	const topicCount = toProfileTopicCount({ profile, isOwnProfile, ownTopics })

	// the person's own topics in their load state, or the public topics a visitor reads
	const toTopicsSectionContent = (): ReactNode => {
		if (!isOwnProfile) {
			return profile.topics.length > 0 ? topicsTable : <EmptyCard text="No public topics." />
		}
		if (ownTopics === null) {
			return isOwnTopicsLoadFailed ? <TopicsLoadFailed onRetry={onLoadOwnTopics} /> : <TableSkeleton />
		}
		return ownTopics.length > 0 ? renderOwnerTopicsTable(ownTopics) : <NewTopicEmptyCard />
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
				<Section value="topics" title="All Topics" countLabel={toSectionCountLabel(topicCount, "topic")}>
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
