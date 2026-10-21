import { sendTopicFindingOpened } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type {
	PodcastEpisodeSearchResult,
	TeamSearchResult,
	TopicSearchResult,
	UserSearchResult,
} from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { Hash, Podcast } from "lucide-react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"

// what every suggestion option needs to be an announced listbox option that clears the search when clicked
type SuggestionOptionProps = { suggestionId: string; isActive: boolean; onOpen: () => void }

// the layout every suggestion option shares, and its hover tint
const SUGGESTION_OPTION_CLASS = "hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm"

/**
 * A topic result with a topic icon and name that links to the topic page. isActive marks the arrow-key highlight.
 */
export function TopicResult({
	suggestionId,
	topic,
	isActive,
	onOpen,
}: SuggestionOptionProps & { topic: TopicSearchResult }) {
	return (
		<AnchorLink
			href={toTopicPath(topic)}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			{/* decorative. the trailing "Topic" text names the kind */}
			<Hash className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate">{topic.name}</span>
			<span className="text-muted-foreground shrink-0 text-xs">Topic</span>
		</AnchorLink>
	)
}

/**
 * A podcast episode result with a podcast icon, the episode's title, and its topic's name, linking to the episode's page.
 */
export function PodcastEpisodeResult({
	suggestionId,
	podcastEpisode,
	isActive,
	onOpen,
}: SuggestionOptionProps & { podcastEpisode: PodcastEpisodeSearchResult }) {
	return (
		<AnchorLink
			href={podcastEpisode.pagePath}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			{/* the podcast icon, which names the kind */}
			<Podcast className="text-muted-foreground size-4 shrink-0" aria-label="Podcast episode" />
			<span className="min-w-0 flex-1 truncate">{podcastEpisode.title}</span>
			<span className="text-muted-foreground max-w-[40%] shrink-0 truncate text-xs">{podcastEpisode.topicName}</span>
		</AnchorLink>
	)
}

/**
 * A team result with its avatar and name, linking to the team page.
 */
export function TeamResult({
	suggestionId,
	team,
	isActive,
	onOpen,
}: SuggestionOptionProps & { team: TeamSearchResult }) {
	return (
		<AnchorLink
			href={`/teams/${team.teamId}`}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			<TeamAvatar team={team} className="size-6" />
			<span className="min-w-0 flex-1 truncate">{team.name}</span>
		</AnchorLink>
	)
}

/**
 * A user result with their avatar and username, linking to their profile.
 */
export function UserResult({
	suggestionId,
	user,
	isActive,
	onOpen,
}: SuggestionOptionProps & { user: UserSearchResult }) {
	return (
		<AnchorLink
			href={`/profiles/${user.userId}`}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			<UserAvatar
				userId={user.userId}
				username={user.username}
				avatarVersion={user.avatarVersion}
				className="size-4 shrink-0"
			/>
			<span className="min-w-0 flex-1 truncate">{user.username}</span>
			<span className="text-muted-foreground shrink-0 text-xs">Profile</span>
		</AnchorLink>
	)
}

/**
 * A resource result with a resource kind icon, title, and source that opens the resource in a new tab and records a view.
 */
export function ResourceResult({
	suggestionId,
	resource,
	isActive,
	onOpen,
}: SuggestionOptionProps & { resource: TopicFinding }) {
	const Icon = RESOURCE_KIND_ICON[resource.resourceKind]
	return (
		<AnchorLink
			href={resource.url}
			isUserContent
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={() => {
				void sendTopicFindingOpened(resource.findingId)
				onOpen()
			}}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			<Icon className="text-muted-foreground size-4 shrink-0" aria-label={resource.resourceKind} />
			<span className="min-w-0 flex-1 truncate">{resource.title ?? resource.url}</span>
			<span className="text-muted-foreground shrink-0 text-xs">{resource.source}</span>
		</AnchorLink>
	)
}
