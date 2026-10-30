import { fetchActivity } from "@carlnotes/client/activityClient"
import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfile } from "@carlnotes/client/profileClient"
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toBlockLabel, toggleUserBlock } from "@carlnotes/core/lib/userBlocks"
import { useQuery } from "@tanstack/react-query"
import { useLocalSearchParams } from "expo-router"
import { Ban, Pencil, Plus } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { ProfileFields } from "@/components/account/AccountSettings"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { Sheet } from "@/components/common/Sheet"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton, TableSkeleton } from "@/components/layout/PageSkeleton"
import { Text } from "@/components/primitives/text"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"

/**
 * Shows a user's profile, topics, and teams.
 */
export default function ProfileScreen() {
	// load the profile and the current user's private activity
	const { userId } = useLocalSearchParams<{ userId: string }>()
	const { data: session } = authClient().useSession()
	const [isEditing, setIsEditing] = useState(false)
	const [isCreatingTeam, setIsCreatingTeam] = useState(false)
	const isOwnProfile = session?.user.id === userId
	const query = useQuery({ queryKey: ["profile", session?.user.id, userId], queryFn: () => fetchProfile(userId) })
	const activity = useQuery({
		queryKey: ["activity", session?.user.id],
		queryFn: () => fetchActivity(),
		enabled: isOwnProfile,
	})
	const profile = query.data
	function handleReload(): void {
		// refresh the profile and its private activity together
		void query.refetch()
		if (isOwnProfile) {
			void activity.refetch()
		}
	}

	// block or unblock this person, then reload the profile
	async function handleToggleBlock(): Promise<void> {
		if (!profile) {
			return
		}
		try {
			await toggleUserBlock({ userId, isBlocked: profile.isBlocked })
			handleReload()
		} catch {
			showClientError(REQUEST_FAILED_TEXT)
		}
	}
	return (
		<PageScreen
			hasNewTopicButton={isOwnProfile}
			title="Profile"
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
							{ label: "Edit profile", icon: Pencil, onSelect: () => setIsEditing(true) },
							{ label: "New team", icon: Plus, onSelect: () => setIsCreatingTeam(true) },
						]
					: profile && session
						? [{ label: toBlockLabel(profile.isBlocked), icon: Ban, onSelect: () => void handleToggleBlock() }]
						: []
			}
			header={
				query.isPending
					? false
					: profile && <ProfileHeader profile={profile} userId={userId} isOwnProfile={isOwnProfile} />
			}
		>
			<ProfileContent query={query} activity={activity} isOwnProfile={isOwnProfile} onReload={handleReload} />
			{isEditing && (
				<Sheet title="Edit profile" onClose={() => setIsEditing(false)}>
					<ProfileFields onUsernameChanged={handleReload} />
				</Sheet>
			)}
			{isCreatingTeam && <EditTeamModal onClose={() => setIsCreatingTeam(false)} />}
		</PageScreen>
	)
}

// keep the profile identity and its own actions together
function ProfileHeader({
	profile,
	userId,
	isOwnProfile,
}: {
	profile: ProfileResponse
	userId: string
	isOwnProfile: boolean
}) {
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap items-center gap-3">
				{isOwnProfile ? (
					<View>
						<UserAvatarPicker userId={userId} username={profile.username} />
						<UserMenuUpdateCountBadge label="Profile" className="absolute -top-1 -right-1" />
					</View>
				) : (
					<Avatar
						ownerId={userId}
						name={profile.username}
						imageUrl={profile.avatarVersion ? toAvatarImagePath(userId, profile.avatarVersion) : null}
						size={64}
					/>
				)}
				<View className="flex-1">
					{isOwnProfile ? (
						<AnchorLink href="/account" accessibilityLabel={`${profile.username}'s account`}>
							<Text accessibilityRole="header" className="font-display text-2xl">
								{profile.username}
							</Text>
						</AnchorLink>
					) : (
						<Text accessibilityRole="header" className="font-display text-2xl">
							{profile.username}
						</Text>
					)}
				</View>
				{isOwnProfile ? (
					<NewTopicButton />
				) : (
					<InviteUserToTeamButton profileUserId={userId} profileUsername={profile.username} />
				)}
			</View>
			<Text className="text-sm text-muted-foreground">{`Joined ${new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })} · ${toCountLabel(profile.subscriberCount, "follower")}`}</Text>
		</View>
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
			<Text className="text-muted-foreground">No public topics.</Text>
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
	if (query.isPending) {
		return <PageSkeleton kind="profile" />
	}
	if (!profile) {
		return query.error ? (
			<LoadFailedNotice message="Profile didn't load." retryLabel="Retry loading profile" onRetry={onReload} />
		) : (
			<Text>No one here by that name.</Text>
		)
	}
	return (
		<>
			<CollapsibleSection title={isOwnProfile ? "Your topics" : toCountLabel(profile.topics.length, "topic")}>
				<ProfileTopics profile={profile} isOwnProfile={isOwnProfile} activity={activity} onReload={onReload} />
			</CollapsibleSection>
			<CollapsibleSection title={isOwnProfile ? "Your teams" : toCountLabel(profile.teams.length, "team")}>
				{profile.teams.length ? (
					<TeamsMembershipTable teams={profile.teams} isReadOnly={!isOwnProfile} onChanged={onReload} />
				) : (
					<Text className="text-muted-foreground">
						{isOwnProfile ? "You are on no teams yet." : "No public teams."}
					</Text>
				)}
			</CollapsibleSection>
		</>
	)
}
