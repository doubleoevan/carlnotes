// the menu pattern: a popover of options under the search bar's sort button or the bordered Team Up button

import { TOPIC_FINDING_SORTS, type TopicFindingSort } from "@carlnotes/contracts/findings"
import type { TeamIdentity } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ArrowUpDown, Plus, Search, Users, X } from "lucide-react"
import { fn } from "storybook/test"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { NewTeamOption, TeamActionOption } from "@/components/team/TeamMenuOptions"
import { TopicFeedSortOptions } from "@/components/topic/TopicFeedSort"
import { MENU_BUTTON_CLASS, MENU_DIVIDER_CLASS, SEARCH_BAR_ICON_CLASS } from "@/lib/styleClasses"
import { toOwnFrameDocs } from "../../../.storybook/parameters"

// the invented teams the team menu lists. a null avatar version draws the initials
const HOLDING_TEAMS: TeamIdentity[] = [{ teamId: "team-river", name: "River Lab", avatarVersion: null }]
const OTHER_TEAMS: TeamIdentity[] = [
	{ teamId: "team-harbor", name: "Harbor Readers", avatarVersion: null },
	{ teamId: "team-orchard", name: "Orchard Research Group", avatarVersion: null },
]

/**
 * Renders a popover menu the way the app builds one: the sort menu, or the team menu with its dividers.
 */
function MenuPattern({
	menu,
	selectedSort,
	isOpen,
	onSelectOption,
}: {
	// which of the app's menus the popover shows
	menu: "sort" | "team"
	// the sort mode the sort menu marks as selected
	selectedSort: TopicFindingSort
	isOpen: boolean
	onSelectOption: (optionName: string) => void
}) {
	// a new key remounts the popover, so the open control applies on every change
	return menu === "sort" ? (
		<SearchBarSortMenu
			key={String(isOpen)}
			isOpen={isOpen}
			selectedSort={selectedSort}
			onSelectOption={onSelectOption}
		/>
	) : (
		<TeamUpMenu key={String(isOpen)} isOpen={isOpen} onSelectOption={onSelectOption} />
	)
}

// the search bar with its icon-only sort button after the divider, and the sort modes under it
function SearchBarSortMenu({
	isOpen,
	selectedSort,
	onSelectOption,
}: {
	isOpen: boolean
	selectedSort: TopicFindingSort
	onSelectOption: (optionName: string) => void
}) {
	return (
		<div className="bg-card border-border flex flex-1 items-center gap-2 rounded-lg border py-2 pr-2 pl-3 shadow-raised">
			{/* the magnifying glass, then the search input */}
			<Search className="text-muted-foreground size-4 shrink-0" />
			<Input
				aria-label="Search topics, podcasts, findings, teams and users..."
				placeholder="Topics, podcasts, findings, teams, users…"
				className="h-11 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 sm:h-9 dark:bg-transparent"
			/>
			{/* the divider, then the sort button with its tooltip */}
			<div className="flex shrink-0 items-center">
				<div className="bg-border h-6 w-px" />
				<Popover defaultOpen={isOpen}>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<PopoverTrigger className={SEARCH_BAR_ICON_CLASS} aria-label="Sort">
									<ArrowUpDown className="size-4" />
								</PopoverTrigger>
							</span>
						</TooltipTrigger>
						<TooltipContent>Sort</TooltipContent>
					</Tooltip>
					{/* the sort modes, one row each, with the selected tint and a check on the active one */}
					<PopoverContent align="end" sideOffset={13} className="w-40" bodyClassName="p-1" aria-label="Sort">
						<TopicFeedSortOptions selectedSort={selectedSort} onSelectSort={onSelectOption} />
					</PopoverContent>
				</Popover>
			</div>
		</div>
	)
}

// the bordered Team Up button and its menu. River Lab holds the topic, so the icon fills in the primary color
function TeamUpMenu({ isOpen, onSelectOption }: { isOpen: boolean; onSelectOption: (optionName: string) => void }) {
	return (
		<Popover defaultOpen={isOpen}>
			<PopoverTrigger asChild>
				<button type="button" className={MENU_BUTTON_CLASS}>
					<Users className="text-primary size-4 fill-current" />
					Team Up
				</button>
			</PopoverTrigger>
			<TeamUpMenuOptions onSelectOption={onSelectOption} />
		</Popover>
	)
}

// the teams that hold the topic, a divider, the teams that could take it, a divider, and New team
function TeamUpMenuOptions({ onSelectOption }: { onSelectOption: (optionName: string) => void }) {
	return (
		<PopoverContent align="end" className="w-56" bodyClassName="p-1" aria-label="Team Up">
			{/* each option removes the topic from a team that holds it */}
			{HOLDING_TEAMS.map((team) => (
				<TeamActionOption
					key={team.teamId}
					team={team}
					actionLabel="Remove topic from"
					Icon={X}
					onSelect={() => onSelectOption(`Remove topic from ${team.name}`)}
				/>
			))}
			<div className={MENU_DIVIDER_CLASS} />
			{/* each option adds the topic to a team */}
			{OTHER_TEAMS.map((team) => (
				<TeamActionOption
					key={team.teamId}
					team={team}
					actionLabel="Add topic to"
					Icon={Plus}
					onSelect={() => onSelectOption(`Add topic to ${team.name}`)}
				/>
			))}
			<div className={MENU_DIVIDER_CLASS} />
			{/* the highlighted New team option every team menu ends with */}
			<NewTeamOption onCreate={() => onSelectOption("New team")} />
		</PopoverContent>
	)
}

const meta = {
	title: "Patterns/Menu",
	component: MenuPattern,
	args: { menu: "sort", selectedSort: "newest", isOpen: true, onSelectOption: fn() },
	argTypes: {
		menu: { control: "inline-radio", options: ["sort", "team"] },
		selectedSort: { control: "inline-radio", options: [...TOPIC_FINDING_SORTS] },
		isOpen: { control: "boolean" },
		onSelectOption: { control: false },
	},
	parameters: {
		// the docs page shows each story in its own frame. an open popover portals out of an inline story
		docs: toOwnFrameDocs(320),
	},
	// room under the menu's trigger for the open panel. the row starts its items at the top, as the app's toolbar does
	decorators: [
		(Story) => (
			<div
				style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", minHeight: 280, maxWidth: 360 }}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MenuPattern>

export default meta
type Story = StoryObj<typeof meta>

// the sort menu open under the search bar's sort button, with the newest sort selected
export const SortMenu: Story = {}

// the team menu open, its groups split by dividers and ending in New team
export const TeamMenu: Story = { args: { menu: "team" } }

// the search bar's sort button alone, with its menu closed
export const Closed: Story = { args: { isOpen: false } }
