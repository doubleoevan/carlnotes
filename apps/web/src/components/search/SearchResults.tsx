import { sendTopicFindingOpened } from "@carlnotes/client/topicClient"
import type { SearchRow } from "@carlnotes/contracts/search"
import { cn } from "@carlnotes/nightshift/classNames"
import { ArrowRight } from "lucide-react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { RESOURCE_KIND_ICON } from "@/lib/utils"
import { SEARCH_RESULT_KIND_ICON } from "./searchFilterOptions"

// what every suggestion option needs to be an announced listbox option that clears the search when clicked
type SuggestionOptionProps = { suggestionId: string; isActive: boolean; onOpen: () => void }

// the layout every suggestion option shares, and its hover tint
const SUGGESTION_OPTION_CLASS = "hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm"

/**
 * One search result in the typeahead, linking to its page: a topic, a podcast episode with its topic's name, a finding
 * that opens its resource in a new tab and records the open, a team, or a profile. isActive marks the arrow-key
 * highlight.
 */
export function SearchRowOption({
	suggestionId,
	searchRow,
	isActive,
	onOpen,
}: SuggestionOptionProps & { searchRow: SearchRow }) {
	// a finding opens its resource and records the open, and every other row opens its page
	const href = searchRow.kind === "finding" ? searchRow.finding.url : searchRow.path
	const handleClick = (): void => {
		if (searchRow.kind === "finding") {
			void sendTopicFindingOpened(searchRow.finding.findingId)
		}
		onOpen()
	}
	return (
		<AnchorLink
			href={href}
			isUserContent={searchRow.kind === "finding"}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={handleClick}
			className={cn(SUGGESTION_OPTION_CLASS, isActive && "bg-accent")}
		>
			<SearchRowOptionContent searchRow={searchRow} />
		</AnchorLink>
	)
}

/**
 * The last typeahead option, which opens the search page with every result.
 */
export function SeeAllResultsOption({
	suggestionId,
	href,
	rowCount,
	isActive,
	onOpen,
}: SuggestionOptionProps & { href: string; rowCount: number }) {
	return (
		<AnchorLink
			href={href}
			id={suggestionId}
			role="option"
			aria-selected={isActive}
			onClick={onOpen}
			className={cn(SUGGESTION_OPTION_CLASS, "text-muted-foreground", isActive && "bg-accent")}
		>
			<ArrowRight className="size-4 shrink-0" aria-hidden="true" />
			<span className="flex-1">See all {rowCount} results</span>
		</AnchorLink>
	)
}

// a row's icon or avatar, its name, and what names its kind
function SearchRowOptionContent({ searchRow }: { searchRow: SearchRow }) {
	switch (searchRow.kind) {
		// a topic, labeled Topic at the row's end
		case "topic":
			return (
				<>
					<SEARCH_RESULT_KIND_ICON.topics className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate">{searchRow.name}</span>
					<span className="text-muted-foreground shrink-0 text-xs">Topic</span>
				</>
			)
		// a podcast episode, with its topic's name
		case "podcastEpisode":
			return (
				<>
					<SEARCH_RESULT_KIND_ICON.podcastEpisodes
						className="text-muted-foreground size-4 shrink-0"
						aria-label="Podcast episode"
					/>
					<span className="min-w-0 flex-1 truncate">{searchRow.name}</span>
					<span className="text-muted-foreground max-w-[40%] shrink-0 truncate text-xs">{searchRow.topic.name}</span>
				</>
			)
		// a finding, with its resource kind's icon and its source
		case "finding": {
			const ResourceKindIcon = RESOURCE_KIND_ICON[searchRow.finding.resourceKind]
			return (
				<>
					<ResourceKindIcon
						className="text-muted-foreground size-4 shrink-0"
						aria-label={searchRow.finding.resourceKind}
					/>
					<span className="min-w-0 flex-1 truncate">{searchRow.name}</span>
					<span className="text-muted-foreground shrink-0 text-xs">{searchRow.finding.source}</span>
				</>
			)
		}
		// a team with its avatar
		case "team":
			return (
				<>
					<TeamAvatar team={searchRow.team} className="size-6" />
					<span className="min-w-0 flex-1 truncate">{searchRow.name}</span>
				</>
			)
		// a profile with its avatar, labeled Profile at the row's end
		case "user":
			return (
				<>
					<UserAvatar
						userId={searchRow.user.userId}
						username={searchRow.user.username}
						avatarVersion={searchRow.user.avatarVersion}
						className="size-4 shrink-0"
					/>
					<span className="min-w-0 flex-1 truncate">{searchRow.name}</span>
					<span className="text-muted-foreground shrink-0 text-xs">Profile</span>
				</>
			)
	}
}
