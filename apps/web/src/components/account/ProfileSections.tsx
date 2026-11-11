import { authClient } from "@carlnotes/client/authClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { NewsResponse } from "@carlnotes/contracts/news"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { PROFILE_SECTION_VALUES, PROFILE_SECTIONS, toProfileTopicCount } from "@carlnotes/core/lib/profileSections"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { AccordionSection } from "@/components/common/AccordionSection"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { TableSkeleton } from "@/components/layout/PageSkeleton"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { NewsList } from "@/components/social/NewsList"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { EmptyListCard } from "@/components/table/TableCard"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { TopicCard } from "@/components/topic/TopicCard"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import { CARD_CLASS, FLUSH_FIRST_SECTION_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { openNewTopicChat } from "@/stores/chatPanelStore"

// the person's news, their card sections, and their topics and teams tables, each table in an accordion section
export function ProfileSections({
	profile,
	isOwnProfile,
	topics,
	isTopicsLoadFailed,
	onLoadTopics,
	onReloadProfile,
	firstNewsPage,
}: {
	profile: ProfileResponse
	// the first page of the week's news, if the server read it with the profile
	firstNewsPage?: NewsResponse
	isOwnProfile: boolean
	topics: OwnerTopic[] | null
	isTopicsLoadFailed: boolean
	onLoadTopics: () => void
	onReloadProfile: () => void
}) {
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()
	// carl's line for the day is written from the reader's own unread Findings, so it shows on their own profile alone
	const opener = useUpdatesOpener(isOwnProfile ? (session?.user.id ?? null) : null)
	// how many topics the table lists: the person's own once they load, or the ones the profile shows a visitor
	const topicCount = toProfileTopicCount({ profile, isOwnProfile, ownTopics: topics })
	return (
		<div className="mt-4">
			{/* the person's news, which they read whole and anyone else reads as its public rows */}
			<NewsList
				profileUserId={profile.userId}
				userId={session?.user.id ?? null}
				opener={opener}
				firstPage={firstNewsPage}
			/>
			<Accordion
				type="multiple"
				defaultValue={[...PROFILE_SECTION_VALUES, "topics", "teams"]}
				className={cn("mt-4", FLUSH_FIRST_SECTION_CLASS)}
			>
				{/* the person's topics, films, podcast episodes, and Topic Posts as cards, the pinned ones first, each
				    hidden while it has none. the films come right before the podcast episodes, and the Topic Posts section
				    lists every published one */}
				<PagedCardsSection
					section={PROFILE_SECTIONS.profileTopics}
					rows={profile.profileTopics}
					renderCard={(topic) => <TopicCard topic={topic} />}
				/>
				<PagedCardsSection
					section={PROFILE_SECTIONS.profileTopicPodcastEpisodeVideos}
					rows={profile.profileTopicPodcastEpisodeVideos}
					renderCard={(podcastEpisodeCard) => (
						<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} variant="video" videoSurface="profile-videos" />
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
				{/* the two tables, each under its title with its count at the far right, as the card sections are. the
				    person's own topics count once they load */}
				<AccordionSection value="topics" title="All Topics" countLabel={toSectionCountLabel(topicCount, "topic")}>
					{isOwnProfile ? (
						<OwnTopicsTable topics={topics} isTopicsLoadFailed={isTopicsLoadFailed} onLoadTopics={onLoadTopics} />
					) : profile.topics.length > 0 ? (
						<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />
					) : (
						<EmptyListCard>No public topics.</EmptyListCard>
					)}
				</AccordionSection>
				<AccordionSection
					value="teams"
					title="All Teams"
					countLabel={toSectionCountLabel(profile.teams.length, "team")}
				>
					{profile.teams.length > 0 ? (
						<TeamsMembershipTable
							teams={profile.teams}
							receivedInvites={[]}
							isReadOnly={!isOwnProfile}
							onLeave={() => navigate({ to: "/teams" })}
							onDelete={() => navigate({ to: "/teams" })}
							onAnswered={onReloadProfile}
						/>
					) : (
						<EmptyListCard>{isOwnProfile ? "You are on no teams yet." : "No public teams."}</EmptyListCard>
					)}
				</AccordionSection>
			</Accordion>
		</div>
	)
}

// the person's own topics, which they manage here: the table, a way to start for a person with none, or the loading
// state until the read finishes
function OwnTopicsTable({
	topics,
	isTopicsLoadFailed,
	onLoadTopics,
}: {
	topics: OwnerTopic[] | null
	isTopicsLoadFailed: boolean
	onLoadTopics: () => void
}) {
	if (topics === null) {
		return <TopicsLoading isFailed={isTopicsLoadFailed} onRetry={onLoadTopics} />
	}
	if (topics.length === 0) {
		return (
			<div className={cn(CARD_CLASS, "mb-4")}>
				<button
					type="button"
					onClick={() => openNewTopicChat()}
					className={cn(STANDALONE_LINK_CLASS, "font-display text-lg")}
				>
					Give Carl a topic. You know the one.
				</button>
			</div>
		)
	}
	return <OwnerTopicsTable topics={topics} onReloadPage={onLoadTopics} />
}

// offer retry after a failed first read instead of leaving a permanent skeleton
function TopicsLoading({ isFailed, onRetry }: { isFailed: boolean; onRetry: () => void }) {
	return isFailed ? (
		<Button variant="outline" onClick={onRetry}>
			Retry loading topics
		</Button>
	) : (
		<TableSkeleton />
	)
}
