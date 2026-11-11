import { fetchActivity } from "@carlnotes/client/activityClient"
import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfile } from "@carlnotes/client/profileClient"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { sendProfileViewOnce } from "@carlnotes/core/lib/pageViews"
import {
	PROFILE_SECTIONS,
	sendProfileOrderMoves,
	toProfileRankDialogItems,
	toProfileRankedNouns,
	toProfileTopicCount,
} from "@carlnotes/core/lib/profileSections"
import {
	type PinnedOrderMove,
	PROFILE_RANK_OPTION_LABELS,
	type RankedNoun,
	toProfileRankDialogLabels,
} from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toggleUserBlock, toUserBlockLabel } from "@carlnotes/core/lib/userBlocks"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Ban, Clapperboard, ListOrdered, type LucideIcon, NotebookPen, Pencil, Plus } from "lucide-react-native"
import { type ReactNode, useCallback, useState } from "react"
import { View } from "react-native"
import { ProfileFields } from "@/components/account/AccountSettings"
import { ProfileHeader } from "@/components/account/ProfileHeader"
import { AccordionSection } from "@/components/common/AccordionSection"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { RankDialog } from "@/components/common/RankDialog"
import { Sheet } from "@/components/common/Sheet"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton, TableSkeleton } from "@/components/layout/PageSkeleton"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { NewsList } from "@/components/social/NewsList"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { EmptyListCard } from "@/components/table/TableCard"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import {
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"

// the icon of each pin option in the action menu
const PROFILE_RANK_OPTION_ICONS: Record<RankedNoun, LucideIcon> = {
	topics: ListOrdered,
	films: Clapperboard,
	podcasts: ListOrdered,
	posts: NotebookPen,
}

/**
 * Shows a user's profile, topics, and teams.
 */
export default function ProfileScreen() {
	// load the profile and the current user's private activity
	const { userId } = useLocalSearchParams<{ userId: string }>()
	const { data: session } = authClient().useSession()
	const [isEditing, setIsEditing] = useState(false)
	const [isCreatingTeam, setIsCreatingTeam] = useState(false)
	// which of the owner's rank sheets is open, or null if none is
	const [rankedNoun, setRankedNoun] = useState<RankedNoun | null>(null)
	const isOwnProfile = session?.user.id === userId
	const query = useQuery({ queryKey: ["profile", session?.user.id, userId], queryFn: () => fetchProfile(userId) })
	const activity = useQuery({
		queryKey: ["activity", session?.user.id],
		queryFn: () => fetchActivity(),
		enabled: isOwnProfile,
	})
	const profile = query.data

	// count a loaded profile once per app runtime, as the web counts it once per tab
	const loadedProfileUserId = profile?.userId
	useFocusEffect(
		useCallback(() => {
			if (loadedProfileUserId) {
				sendProfileViewOnce(loadedProfileUserId)
			}
		}, [loadedProfileUserId]),
	)
	function handleReload(): void {
		// refresh the profile and its private activity together
		void query.refetch()
		if (isOwnProfile) {
			void activity.refetch()
		}
	}

	// block or unblock this person, then reload the profile
	async function handleToggleUserBlock(): Promise<void> {
		if (!profile) {
			return
		}
		try {
			await toggleUserBlock({ userId, isUserBlocked: profile.isBlocked })
			handleReload()
		} catch {
			showClientError(REQUEST_FAILED_TEXT)
		}
	}

	// send a rank sheet's moves one at a time, then reload the profile once. a rejected move keeps the sheet open
	async function handleSaveProfileOrder(pinnedOrderMoves: PinnedOrderMove[]): Promise<void> {
		try {
			await sendProfileOrderMoves(rankedNoun ?? "topics", pinnedOrderMoves)
		} catch (error) {
			showClientError(REQUEST_FAILED_TEXT)
			throw error
		} finally {
			await query.refetch()
		}
	}
	return (
		<PageScreen
			hasNewTopicButton={isOwnProfile}
			title="Café"
			contentClassName={query.isPending ? "mt-0 gap-0" : "mt-2 gap-0"}
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
			report={
				profile
					? {
							subjectKind: "profile",
							subjectId: userId,
							subjectLabel: profile.username,
							author: { id: userId, username: profile.username },
						}
					: undefined
			}
			options={
				isOwnProfile
					? [
							{ label: "Edit Café", icon: Pencil, onSelect: () => setIsEditing(true) },
							// the pins the person may order, in the card sections' order
							...toProfileRankedNouns(isOwnProfile).map((profileRankedNoun) => ({
								label: PROFILE_RANK_OPTION_LABELS[profileRankedNoun],
								icon: PROFILE_RANK_OPTION_ICONS[profileRankedNoun],
								onSelect: () => setRankedNoun(profileRankedNoun),
							})),
							{ label: "New team", icon: Plus, onSelect: () => setIsCreatingTeam(true) },
						]
					: profile && session
						? [{ label: toUserBlockLabel(profile.isBlocked), icon: Ban, onSelect: () => void handleToggleUserBlock() }]
						: []
			}
			header={
				query.isPending
					? false
					: profile && (
							<ProfileHeader
								profile={profile}
								isOwnProfile={isOwnProfile}
								topicCount={toProfileTopicCount({ profile, isOwnProfile, ownTopics: activity.data?.topics })}
							/>
						)
			}
			// the owner starts a team, and a different user invites the profile user to one, in the plain style with the
			// icon alone in the highlight color
			leftButton={
				profile &&
				(isOwnProfile ? (
					<Button
						variant="outline"
						className={PLAIN_PAGE_BUTTON_CLASS}
						accessibilityLabel="New team"
						onPress={() => setIsCreatingTeam(true)}
					>
						<Icon as={Plus} className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>New team</Text>
					</Button>
				) : (
					<InviteUserToTeamButton profileUserId={userId} profileUsername={profile.username} />
				))
			}
			// the loading state draws both buttons' placeholders, so the row waits for the profile
			topicButton={query.isPending ? undefined : <NewTopicButton />}
		>
			<ProfileContent query={query} activity={activity} isOwnProfile={isOwnProfile} onReload={handleReload} />
			{isEditing && (
				<Sheet title="Edit Café" onClose={() => setIsEditing(false)}>
					<ProfileFields onUsernameChanged={handleReload} />
				</Sheet>
			)}
			{isCreatingTeam && <EditTeamModal onClose={() => setIsCreatingTeam(false)} />}
			{/* the owner's list of pinned topics, films, podcast episodes, or Topic Posts, with the ones they may still
			    pin */}
			{rankedNoun && isOwnProfile && profile && (
				<RankDialog
					labels={toProfileRankDialogLabels(rankedNoun)}
					{...toProfileRankDialogItems(rankedNoun, profile)}
					onSave={handleSaveProfileOrder}
					onClose={() => setRankedNoun(null)}
				/>
			)}
		</PageScreen>
	)
}

// one of the profile's two tables under its title, with its count at the far right, open at first
function ProfileTableSection({
	title,
	countLabel,
	children,
}: {
	title: string
	countLabel?: string
	children: ReactNode
}) {
	const [isExpanded, setIsExpanded] = useState(true)
	return (
		<AccordionSection
			title={title}
			countLabel={countLabel}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			<View className="mx-4 pt-2 pb-2">{children}</View>
		</AccordionSection>
	)
}

// show each load state without nesting it inside the page's visibility branches
function ProfileTopics({
	profile,
	isOwnProfile,
	activity,
	onReload,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	activity: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchActivity>>>>
	onReload: () => void
}) {
	if (!isOwnProfile) {
		return profile.topics.length ? (
			<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />
		) : (
			<EmptyListCard text="No public topics." />
		)
	}
	if (activity.isPending) {
		return <TableSkeleton />
	}
	if (activity.error) {
		return <LoadFailedNotice message="Topics didn't load." retryLabel="Retry loading topics" onRetry={onReload} />
	}
	if (activity.data?.topics.length) {
		return <OwnerTopicsTable topics={activity.data.topics} onReloadPage={onReload} />
	}
	return (
		<View className="gap-3 rounded-lg border border-separator bg-card p-4">
			<Text className="font-display text-lg">Give Carl a topic. You know the one.</Text>
			<NewTopicButton />
		</View>
	)
}

// show the two profile tables only after the profile request has resolved
function ProfileContent({
	query,
	activity,
	isOwnProfile,
	onReload,
}: {
	query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchProfile>>>>
	activity: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchActivity>>>>
	isOwnProfile: boolean
	onReload: () => void
}) {
	const profile = query.data
	const pathname = usePathname()
	const { data: session } = authClient().useSession()
	// carl's line for the day is written from the reader's own unread Findings, so it shows on their own profile alone
	const opener = useUpdatesOpener(isOwnProfile ? (session?.user.id ?? null) : null)
	// how many topics the table lists: the person's own once they load, or the ones the profile shows a visitor
	const topicCount = profile ? toProfileTopicCount({ profile, isOwnProfile, ownTopics: activity.data?.topics }) : null
	if (query.isPending) {
		return <PageSkeleton kind="profile" />
	}
	if (!profile) {
		return query.error ? (
			<LoadFailedNotice message="The Café didn't load." retryLabel="Retry loading the Café" onRetry={onReload} />
		) : (
			<Text>No one here by that name.</Text>
		)
	}
	return (
		<>
			{/* the person's news, which they read whole and anyone else reads as its public rows */}
			<NewsList profileUserId={profile.userId} userId={session?.user.id ?? null} opener={opener} />
			{/* the person's topics, films, podcast episodes, and Topic Posts as cards, the pinned ones first, each hidden
			    while it has none. the films come right before the podcast episodes, and the Topic Posts section lists
			    every published one. the sections bring their own side insets, so they give the page's back */}
			<View className="-mx-4">
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
				<ProfileTableSection title="All Topics" countLabel={toSectionCountLabel(topicCount, "topic")}>
					<ProfileTopics profile={profile} isOwnProfile={isOwnProfile} activity={activity} onReload={onReload} />
				</ProfileTableSection>
				<ProfileTableSection title="All Teams" countLabel={toSectionCountLabel(profile.teams.length, "team")}>
					{profile.teams.length ? (
						<TeamsMembershipTable teams={profile.teams} isReadOnly={!isOwnProfile} onChanged={onReload} />
					) : (
						<EmptyListCard text={isOwnProfile ? "You are on no teams yet." : "No public teams."} />
					)}
				</ProfileTableSection>
			</View>
			{/* the profile's visitors, read while this profile is the active route */}
			<ViewerCountLine
				viewerCountPage={{ kind: "profile", id: profile.userId }}
				isActiveRoute={pathname === `/profiles/${profile.userId}`}
			/>
		</>
	)
}
