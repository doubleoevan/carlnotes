// a profile page's header: the person's avatar, their Café name, and the line of when they joined, their followers,
// and the page's counts. the person changes their avatar from it on their own page, where their name opens their
// account
import { type ProfileResponse, toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import type { ComponentType, PropsWithChildren } from "react"
import type { ProfileSummaryLineProps } from "./ProfileSummaryLine"

// what the header reads of a profile: who the person is, their avatar's version, when they joined, their followers,
// whether the signed-in user blocked them, and the podcast episode cards and the teams the page lists
type ProfileHeaderProfile = Pick<
	ProfileResponse,
	| "userId"
	| "username"
	| "avatarVersion"
	| "joinedAt"
	| "subscriberCount"
	| "isBlocked"
	| "profilePodcastEpisodes"
	| "teams"
>

// the profile, whether the signed-in user is the person, and how many topics the page's table lists, null until the
// person's own topics load
export type ProfileHeaderProps = { profile: ProfileHeaderProfile; isOwnProfile: boolean; topicCount: number | null }

// the platform's elements: the row of the avatar and the name, the person's own avatar with its picker and update
// count, anyone else's avatar, the column beside it, the heading, which opens the account on the person's own page,
// and the app's summary line
export type ProfileHeaderElements = {
	Row: ComponentType<PropsWithChildren>
	OwnAvatar: ComponentType<{ userId: string; username: string }>
	Avatar: ComponentType<{ userId: string; username: string; avatarVersion: string | null }>
	Identity: ComponentType<PropsWithChildren>
	Heading: ComponentType<{ isAccountLink: boolean; username: string; children: string }>
	SummaryLine: ComponentType<ProfileSummaryLineProps>
}

/**
 * Shows a profile's avatar beside the person's Café name and summary line. The row holds no button.
 */
export function ProfileHeader({
	profile,
	isOwnProfile,
	topicCount,
	elements: { Row, OwnAvatar, Avatar, Identity, Heading, SummaryLine },
}: ProfileHeaderProps & { elements: ProfileHeaderElements }) {
	return (
		<Row>
			{/* a user may not edit another user's avatar */}
			{isOwnProfile ? (
				<OwnAvatar userId={profile.userId} username={profile.username} />
			) : (
				<Avatar userId={profile.userId} username={profile.username} avatarVersion={profile.avatarVersion} />
			)}
			{/* beside the avatar: the person's Café name, then when they joined, their followers, and the page's counts */}
			<Identity>
				<Heading isAccountLink={isOwnProfile} username={profile.username}>
					{toProfilePageTitle(profile.username)}
				</Heading>
				<SummaryLine
					profile={profile}
					topicCount={topicCount}
					podcastEpisodeCount={profile.profilePodcastEpisodes.length}
					teamCount={profile.teams.length}
				/>
			</Identity>
		</Row>
	)
}
