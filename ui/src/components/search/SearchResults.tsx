import type { TopicFeed, TopicFinding, UserSearchResult } from "@shared/contracts"
import { Hash } from "lucide-react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { sendTopicFindingOpened } from "@/lib/topicClient"
import { cn, RESOURCE_KIND_ICON } from "@/lib/utils"

// what every suggestion row needs to be an announced listbox option that clears the search when clicked
type SuggestionRowProps = { suggestionId: string; isActive: boolean; onOpen: () => void }

/**
 * A topic result with a topic icon and name that links to the topic page. isActive marks the arrow-key highlight.
 */
export function TopicResult({ suggestionId, topic, isActive, onOpen }: SuggestionRowProps & { topic: TopicFeed }) {
	return (
		<AnchorLink
			href={`/topics/${topic.id}`}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm", isActive && "bg-accent")}
		>
			{/* decorative, since the trailing "Topic" text already names the kind */}
			<Hash className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate">{topic.name}</span>
			<span className="text-muted-foreground shrink-0 text-xs">Topic</span>
		</AnchorLink>
	)
}

/**
 * A user result with their avatar and username, linking to their profile.
 */
export function UserResult({ suggestionId, user, isActive, onOpen }: SuggestionRowProps & { user: UserSearchResult }) {
	return (
		<AnchorLink
			href={`/profiles/${user.userId}`}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm", isActive && "bg-accent")}
		>
			<UserAvatar
				userId={user.userId}
				username={user.username}
				avatarSource={user.avatarSource}
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
}: SuggestionRowProps & { resource: TopicFinding }) {
	const Icon = RESOURCE_KIND_ICON[resource.resourceKind]
	return (
		<AnchorLink
			href={resource.url}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={() => {
				void sendTopicFindingOpened(resource.findingId)
				onOpen()
			}}
			className={cn("hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm", isActive && "bg-accent")}
		>
			<Icon className="text-muted-foreground size-4 shrink-0" aria-label={resource.resourceKind} />
			<span className="min-w-0 flex-1 truncate">{resource.title ?? resource.url}</span>
			<span className="text-muted-foreground shrink-0 text-xs">{resource.source}</span>
		</AnchorLink>
	)
}
