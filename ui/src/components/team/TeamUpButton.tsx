import type { TeamSummary, TopicResponse } from "@shared/contracts"
import { Plus, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { fetchTeams, sendAddTopicTeam, sendRemoveTopicFromTeam } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// one row inside the team menu
export const MENU_OPTION_CLASS = "hover:bg-accent flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm"

/**
 * One team row in a Team Up menu: the avatar and name, doing whatever the caller sends.
 */
export function TeamOption({
	team,
	onSelect,
}: {
	team: { teamId: string; name: string; hasAvatar: boolean }
	onSelect: () => void
}) {
	return (
		<button type="button" onClick={onSelect} className={MENU_OPTION_CLASS}>
			<TeamAvatar team={team} className="size-5" />
			<span className="truncate">{team.name}</span>
		</button>
	)
}

/**
 * The highlighted New team row every Team Up menu ends with.
 */
export function NewTeamOption({ onCreate }: { onCreate: () => void }) {
	return (
		<button type="button" onClick={onCreate} className={cn(MENU_OPTION_CLASS, "text-link")}>
			<Plus className="size-4 shrink-0" />
			New team
		</button>
	)
}

/**
 * Whether Team Up renders. It is for signed-in users, and someone else's private topic is not theirs to hand over.
 */
export function isTeamUpShown(topic: Pick<TopicResponse, "isOwner" | "visibility">, isSignedIn: boolean): boolean {
	return isSignedIn && !(topic.visibility === "private" && !topic.isOwner)
}

export function TeamUpButton({
	topic,
	isSignedIn,
	isHighlighted,
	onChanged,
}: {
	topic: TopicResponse
	isSignedIn: boolean
	// whether this button is the page's one call to action, which decides its fill
	isHighlighted: boolean
	onChanged: () => void
}) {
	const _navigate = useNavigate()
	const [isCreating, setIsCreating] = useState(false)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	// what the create modal offers, gathered when it opens, this topic included
	const [modalTopics, setModalTopics] = useState<{ id: string; name: string }[]>([])
	// the teams the user leads, loaded once so the click knows whether it has a menu to show
	const [ledTeams, setLedTeams] = useState<TeamSummary[] | null>(null)

	const isHidden = !isTeamUpShown(topic, isSignedIn)

	// the memberships load with the button, which has to answer the click at once
	useEffect(() => {
		if (isHidden) {
			return
		}
		fetchTeams()
			.then((index) => setLedTeams(index.teams.filter((team) => team.role === "leader")))
			.catch(() => setLedTeams([]))
	}, [isHidden])
	if (isHidden) {
		return null
	}

	// a team holds the topic when it owns it or a share put it in the team's room
	const topicTeamIds = new Set(topic.roomTeams.map((held) => held.teamId))
	if (topic.team) {
		topicTeamIds.add(topic.team.teamId)
	}

	// the create modal offers the addable set in the server's order, this topic checked so it comes along
	const openCreateModal = async (): Promise<void> => {
		const addable = await fetchAddableTopics()
		const withTopic = addable.some((offered) => offered.id === topic.id)
			? addable
			: [{ id: topic.id, name: topic.name }, ...addable]
		setModalTopics(withTopic)
		setIsCreating(true)
	}

	// the filled shape belongs to a leader of a team that has the topic, a user who can change that
	const ledTeamsWithTopic = (ledTeams ?? []).filter((team) => topicTeamIds.has(team.teamId))
	if (topicTeamIds.size > 0 && ledTeams === null) {
		return null
	}
	if (ledTeamsWithTopic.length > 0) {
		return (
			<>
				<HeldTeamMenu
					teamsWithTopic={ledTeamsWithTopic}
					otherTeams={(ledTeams ?? []).filter((team) => !topicTeamIds.has(team.teamId))}
					topicId={topic.id}
					isHighlighted={isHighlighted}
					onChanged={onChanged}
					onCreate={() => void openCreateModal()}
				/>
				{/* the shared modal, with this topic checked so teaming up brings it along */}
				{isCreating && (
					<EditTeamModal userTopics={modalTopics} initialTopicIds={[topic.id]} onClose={() => setIsCreating(false)} />
				)}
			</>
		)
	}

	// attaching stays on the topic page, which reloads to show the filled icon
	const handleAttach = async (team: TeamSummary): Promise<void> => {
		setIsMenuOpen(false)
		const rejection = await sendAddTopicTeam(team.teamId, topic.id)
		if (rejection) {
			toast.error("That topic didn't attach. It may already be on that team.")
			return
		}
		toast(`Added topic to ${team.name}.`)
		onChanged()
	}

	// a user who leads no team has nothing to select from, so the button goes straight to creating one
	const handleClick = async (): Promise<void> => {
		const led =
			ledTeams ??
			(await fetchTeams()
				.then((index) => index.teams.filter((team) => team.role === "leader"))
				.catch(() => []))
		if (led.length === 0) {
			await openCreateModal()
			return
		}
		// a click that beat the effect keeps what it fetched, so the menu it opens is never empty
		setLedTeams(led)
		setIsMenuOpen(true)
	}

	return (
		<>
			<Popover open={isMenuOpen} onOpenChange={(isOpen) => !isOpen && setIsMenuOpen(false)}>
				<PopoverTrigger asChild>
					<button
						type="button"
						onClick={() => void handleClick()}
						className={cn(MENU_BUTTON_CLASS, isHighlighted && MENU_BUTTON_HIGHLIGHT_CLASS)}
					>
						<Users className="size-4" />
						Team Up
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-56 p-1">
					{/* the teams this topic can join, then the way to make a new one */}
					{(ledTeams ?? []).map((team) => (
						<Tooltip key={team.teamId}>
							<TooltipTrigger asChild>
								<button type="button" onClick={() => void handleAttach(team)} className={MENU_OPTION_CLASS}>
									<TeamAvatar team={team} className="size-5" />
									<span className="truncate">{team.name}</span>
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Add topic to <span className="font-semibold">{team.name}</span>
							</TooltipContent>
						</Tooltip>
					))}
					<div className="bg-border my-1 h-px" />
					<NewTeamOption
						onCreate={() => {
							setIsMenuOpen(false)
							void openCreateModal()
						}}
					/>
				</PopoverContent>
			</Popover>
			{/* the shared modal, with this topic checked so teaming up brings it along */}
			{isCreating && (
				<EditTeamModal userTopics={modalTopics} initialTopicIds={[topic.id]} onClose={() => setIsCreating(false)} />
			)}
		</>
	)
}

// the filled shape a leader of a team with the topic sees
function HeldTeamMenu({
	teamsWithTopic,
	otherTeams,
	topicId,
	isHighlighted,
	onChanged,
	onCreate,
}: {
	teamsWithTopic: TeamSummary[]
	// the user's led teams that do not hold the topic yet
	otherTeams: TeamSummary[]
	topicId: string
	// whether this button is the page's one call to action, which decides its fill
	isHighlighted: boolean
	onChanged: () => void
	onCreate: () => void
}) {
	const navigate = useNavigate()
	const [isOpen, setIsOpen] = useState(false)

	// removing takes the topic off that team, and the reload redraws the button from what is left
	const handleDetach = async (team: TeamSummary): Promise<void> => {
		setIsOpen(false)
		await sendRemoveTopicFromTeam(team.teamId, topicId)
		toast(`Removed topic from ${team.name}.`)
		onChanged()
	}

	// adding shares the topic into the team, and the reload lists the new holding without leaving the page
	const handleAdd = async (team: TeamSummary): Promise<void> => {
		setIsOpen(false)
		const rejection = await sendAddTopicTeam(team.teamId, topicId)
		if (rejection) {
			toast.error("That topic didn't attach. It may already be on that team.")
			return
		}
		onChanged()
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button type="button" className={cn(MENU_BUTTON_CLASS, isHighlighted && MENU_BUTTON_HIGHLIGHT_CLASS)}>
					{/* the icon fills once a led team holds the topic, in the highlighted button's own color */}
					<Users className={cn("size-4 fill-current", !isHighlighted && "text-primary")} />
					Team Up
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-1">
				{/* the teams that have the topic, each with an X button that removes it */}
				{teamsWithTopic.map((team) => (
					<div key={team.teamId} className="flex items-center">
						<button
							type="button"
							onClick={() => navigate(`/teams/${team.teamId}`)}
							className={cn(MENU_OPTION_CLASS, "min-w-0 flex-1")}
						>
							<TeamAvatar team={team} className="size-5" />
							<span className="truncate">{team.name}</span>
						</button>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => void handleDetach(team)}
									aria-label={`Remove topic from ${team.name}`}
									className="text-muted-foreground hover:text-foreground rounded-md p-2"
								>
									<X className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Remove topic from <span className="font-semibold">{team.name}</span>
							</TooltipContent>
						</Tooltip>
					</div>
				))}
				{/* the led teams that could still take the topic */}
				{otherTeams.length > 0 && <div className="bg-border my-1 h-px" />}
				{otherTeams.map((team) => (
					<div key={team.teamId} className="flex items-center">
						<button
							type="button"
							onClick={() => navigate(`/teams/${team.teamId}`)}
							className={cn(MENU_OPTION_CLASS, "min-w-0 flex-1")}
						>
							<TeamAvatar team={team} className="size-5" />
							<span className="truncate">{team.name}</span>
						</button>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => void handleAdd(team)}
									aria-label={`Add topic to ${team.name}`}
									className="text-muted-foreground hover:text-foreground rounded-md p-2"
								>
									<Plus className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Add topic to <span className="font-semibold">{team.name}</span>
							</TooltipContent>
						</Tooltip>
					</div>
				))}
				{/* the way to make a new team, offered the topic */}
				<div className="bg-border my-1 h-px" />
				<NewTeamOption
					onCreate={() => {
						setIsOpen(false)
						onCreate()
					}}
				/>
			</PopoverContent>
		</Popover>
	)
}
