import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { TEAM_SECTIONS } from "../lib/cardSections"
import { toSectionCountLabel } from "../lib/labels"
import type { PageSectionsElements } from "./pageSectionsElements"

export type TeamSectionsElements = PageSectionsElements & {
	// the line under the members table that counts the members it does not list
	MoreMembersLine: ComponentType<{ children: string }>
}

/**
 * Lays out a team page's sections in order: the topic, film, podcast episode, and Topic Post cards, each hidden while
 * it has none, then the members, the topics, and the notes.
 */
export function TeamSections({
	teamPage,
	membersTable,
	topicsTable,
	notesSection,
	elements: {
		SectionsGroup,
		PagedCardsSection,
		TopicCard,
		PodcastEpisodeCard,
		TopicPostCard,
		Section,
		EmptyCard,
		MoreMembersLine,
	},
}: {
	teamPage: TeamPageResponse
	membersTable: ReactNode
	// the team's topics table, which shows while the team has any
	topicsTable: ReactNode
	notesSection: ReactNode
	elements: TeamSectionsElements
}) {
	// the active members, shown or not, as the header counts them
	const { hiddenMemberCount } = teamPage
	const memberCount = teamPage.members.filter((member) => member.isActive).length + hiddenMemberCount
	return (
		<>
			<SectionsGroup>
				{/* the films sit right before the podcast episodes */}
				<PagedCardsSection
					section={TEAM_SECTIONS.topicCards}
					rows={teamPage.topicCards}
					renderCard={(topic) => <TopicCard topic={topic} />}
				/>
				<PagedCardsSection
					section={TEAM_SECTIONS.topicPodcastEpisodeVideoCards}
					rows={teamPage.topicPodcastEpisodeVideoCards ?? []}
					renderCard={(podcastEpisodeCard) => (
						<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} videoSurface="team-videos" />
					)}
				/>
				<PagedCardsSection
					section={TEAM_SECTIONS.podcastEpisodeCards}
					rows={teamPage.podcastEpisodeCards}
					renderCard={(podcastEpisodeCard) => <PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} />}
				/>
				<PagedCardsSection
					section={TEAM_SECTIONS.topicPostCards}
					rows={teamPage.topicPostCards}
					renderCard={(topicPost) => <TopicPostCard topicPost={topicPost} />}
				/>

				{/* the members, with the count of those the table does not list */}
				<Section value="members" title="Team members" countLabel={toSectionCountLabel(memberCount, "member")}>
					{membersTable}
					{hiddenMemberCount > 0 && (
						<MoreMembersLine>{`and ${toCountLabel(hiddenMemberCount, "more member")}`}</MoreMembersLine>
					)}
				</Section>

				{/* the team's topics */}
				<Section value="topics" title="All Topics" countLabel={toSectionCountLabel(teamPage.topics.length, "topic")}>
					{teamPage.topics.length === 0 ? <EmptyCard text="No topics on this team yet." /> : topicsTable}
				</Section>
			</SectionsGroup>

			{/* the team's notes last */}
			{notesSection}
		</>
	)
}
