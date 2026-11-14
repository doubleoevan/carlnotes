import type { McpViewProfile } from "@carlnotes/contracts/mcpViews"
import { DEFAULT_NEWS_WINDOW, NEWS_PAGE_SIZE, type NewsResponse } from "@carlnotes/contracts/news"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { toProfilePath, toTeamPath } from "@carlnotes/contracts/seo"
import { NewsList, type NewsListElements } from "@carlnotes/core/components/NewsList"
import { ProfileHeader, type ProfileHeaderElements } from "@carlnotes/core/components/ProfileHeader"
import { ProfileSections, type ProfileSectionsElements } from "@carlnotes/core/components/ProfileSections"
import {
	TeamsMembershipTable,
	type TeamsMembershipTableElements,
} from "@carlnotes/core/components/TeamsMembershipTable"
import { TopicsTable } from "@carlnotes/core/components/TopicsTable"
import { cn } from "@carlnotes/nightshift/classNames"
import { PROFILE_HEADER_ELEMENTS } from "@/components/account/ProfileHeader"
import { PROFILE_SECTIONS_ELEMENTS } from "@/components/account/ProfileSections"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TEAMS_MEMBERSHIP_TABLE_ELEMENTS } from "@/components/table/TeamsMembershipTable"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { MCP_VIEW_TOPICS_TABLE_ELEMENTS, McpViewSiteLink } from "./mcpViewElements"
import { useMcpViewData } from "./mcpViewHost"
import { MCP_VIEW_PAGE_CARD_ELEMENTS } from "./mcpViewPageCardElements"
import { MCP_VIEW_NEWS_LIST_ELEMENTS } from "./NewsMcpView"

/**
 * The profile MCP view: a person's Café as the profile page shows it, with the shared header, the week's news from
 * the tool's first page, the card sections, and the topics and teams tables. The MCP view makes no tool call on load
 * and reads no api. Every table is read-only, a card or a link opens its page on the site through the host, and a Topic
 * Post's card takes the one hop to the post.
 */
export function ProfileMcpView({ mcpViewProfile }: { mcpViewProfile: McpViewProfile }) {
	const { session } = useMcpViewData()
	const { profile, newsPage, isOwnProfile } = mcpViewProfile
	return (
		<div>
			{/* the avatar beside the person's Café name and summary line, with no button row */}
			<header>
				<ProfileHeader
					profile={profile}
					isOwnProfile={isOwnProfile}
					topicCount={profile.topics.length}
					elements={MCP_VIEW_PROFILE_HEADER_ELEMENTS}
				/>
			</header>
			{/* the sections as a visitor's profile shows them, which holds no owner control and no topics load */}
			<div className="mt-2">
				<ProfileSections
					profile={profile}
					isOwnProfile={false}
					newsList={
						newsPage && (
							<McpViewProfileNewsList profile={profile} newsPage={newsPage} userId={session?.userId ?? null} />
						)
					}
					renderOwnerTopicsTable={() => null}
					topicsTable={<McpViewProfileTopicsTable profile={profile} />}
					teamsTable={
						<TeamsMembershipTable
							teams={profile.teams}
							receivedInvites={[]}
							isReadOnly
							onLeave={ignoreChange}
							onDelete={ignoreChange}
							onAccept={ignoreChange}
							onDecline={ignoreChange}
							onChanged={ignoreChange}
							elements={MCP_VIEW_TEAMS_MEMBERSHIP_TABLE_ELEMENTS}
						/>
					}
					elements={MCP_VIEW_PROFILE_SECTIONS_ELEMENTS}
				/>
			</div>
		</div>
	)
}

// the news from the tool's first page, and where the page buttons would be, a link to the later pages on the profile
// page. the list reads that page again in place of the api
function McpViewProfileNewsList({
	profile,
	newsPage,
	userId,
}: {
	profile: ProfileResponse
	newsPage: NewsResponse
	userId: string | null
}) {
	return (
		<>
			<NewsList
				profileUserId={profile.userId}
				userId={userId}
				firstPage={newsPage}
				firstWindow={DEFAULT_NEWS_WINDOW}
				loadNewsPage={async () => newsPage}
				captureVisitEvent={captureVisitEvent}
				elements={MCP_VIEW_PROFILE_NEWS_LIST_ELEMENTS}
			/>
			{newsPage.total > NEWS_PAGE_SIZE && (
				<McpViewSiteLink href={toProfilePath(profile.userId)}>See all on CarlNotes</McpViewSiteLink>
			)}
		</>
	)
}

// the profile's topics with no email switch
function McpViewProfileTopicsTable({ profile }: { profile: ProfileResponse }) {
	const topics = profile.topics.map((topic) => ({ ...topic, isEmailEnabled: null }))
	return (
		<TopicsTable
			topics={topics}
			includesNonPublicTopics={profile.includesNonPublicTopics}
			elements={MCP_VIEW_TOPICS_TABLE_ELEMENTS}
		/>
	)
}

// the user's own avatar as the plain avatar, with the avatar version from the caller's session
function McpViewOwnAvatar({ userId, username }: { userId: string; username: string }) {
	const { session } = useMcpViewData()
	return (
		<PROFILE_HEADER_ELEMENTS.Avatar
			userId={userId}
			username={username}
			avatarVersion={session?.avatarVersion ?? null}
		/>
	)
}

// the web's header elements, with the plain avatar on the caller's own profile
const MCP_VIEW_PROFILE_HEADER_ELEMENTS: ProfileHeaderElements = {
	...PROFILE_HEADER_ELEMENTS,
	OwnAvatar: McpViewOwnAvatar,
}

// the MCP view's news rows, with no window picker and no page buttons
const MCP_VIEW_PROFILE_NEWS_LIST_ELEMENTS: NewsListElements = {
	...MCP_VIEW_NEWS_LIST_ELEMENTS,
	WindowPicker: () => null,
	Pagination: () => null,
}

// the web's cells, with each count as text and the team link with no update badge
const MCP_VIEW_TEAMS_MEMBERSHIP_TABLE_ELEMENTS: TeamsMembershipTableElements = {
	...TEAMS_MEMBERSHIP_TABLE_ELEMENTS,
	TeamLink: ({ row }) => {
		const team = "membership" in row ? row.membership : row.invite
		return (
			<AnchorLink href={toTeamPath(team.teamId)} className={cn(STANDALONE_LINK_CLASS, "flex items-center gap-2")}>
				<TeamAvatar team={team} className="size-6" />
				{team.name}
			</AnchorLink>
		)
	},
	DetailToggle: ({ count }) => <span>{count.toLocaleString()}</span>,
	Detail: () => null,
}

// the web's sections with the MCP view's cards
const MCP_VIEW_PROFILE_SECTIONS_ELEMENTS: ProfileSectionsElements = {
	...PROFILE_SECTIONS_ELEMENTS,
	...MCP_VIEW_PAGE_CARD_ELEMENTS,
}

// do nothing on a topics load or a membership change
function ignoreChange(): void {}
