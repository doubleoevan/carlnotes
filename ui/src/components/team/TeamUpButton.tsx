import type { TeamSummary, TopicResponse } from "@shared/contracts"
import { Plus, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { fetchTeams, sendAddTopicTeam, sendRemoveTopicFromTeam } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS, MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * One team row in a Team Up menu: the avatar and name.
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
 * Whether Team Up renders. It shows for signed-in users, and never on someone else's private topic.
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
	// whether this button is the page's one call to action
	isHighlighted: boolean
	onChanged: () => void
}) {
	const [isCreating, setIsCreating] = useState(false)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	// the topics the create modal offers, loaded when it opens
	const [modalTopics, setModalTopics] = useState<{ id: string; name: string }[]>([])
	// the teams the user leads, null until they load
	const [ledTeams, setLedTeams] = useState<TeamSummary[] | null>(null)

	const isHidden = !isTeamUpShown(topic, isSignedIn)

	// load the teams the user leads when the button shows
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

	// a team holds the topic when it owns it or a share put it in the team's chat room
	const topicTeamIds = new Set(topic.roomTeams.map((held) => held.teamId))
	if (topic.team) {
		topicTeamIds.add(topic.team.teamId)
	}

	// open the create modal with the addable topics, this topic included
	const openCreateModal = async (): Promise<void> => {
		const addable = await fetchAddableTopics()
		const withTopic = addable.some((offered) => offered.id === topic.id)
			? addable
			: [{ id: topic.id, name: topic.name }, ...addable]
		setModalTopics(withTopic)
		setIsCreating(true)
	}

	// the filled button shows for a leader of a team that has the topic
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
				{/* the create modal, with this topic preselected */}
				{isCreating && (
					<EditTeamModal userTopics={modalTopics} initialTopicIds={[topic.id]} onClose={() => setIsCreating(false)} />
				)}
			</>
		)
	}

	// add the topic to the team and refresh the button
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

	// a user who leads no team goes straight to the create modal
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
		// keep the fetched teams. the click can run before the effect has loaded them
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
				<PopoverContent align="end" className="w-56" bodyClassName="p-1">
					{/* the teams this topic can join, then the New team row */}
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
			{/* the create modal, with this topic preselected */}
			{isCreating && (
				<EditTeamModal userTopics={modalTopics} initialTopicIds={[topic.id]} onClose={() => setIsCreating(false)} />
			)}
		</>
	)
}

// the filled Team Up button and its menu, for a leader of a team that has the topic
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
	// whether this button is the page's one call to action
	isHighlighted: boolean
	onChanged: () => void
	onCreate: () => void
}) {
	const [isOpen, setIsOpen] = useState(false)

	// remove the topic from the team and refresh the button
	const handleDetach = async (team: TeamSummary): Promise<void> => {
		setIsOpen(false)
		await sendRemoveTopicFromTeam(team.teamId, topicId)
		toast(`Removed topic from ${team.name}.`)
		onChanged()
	}

	// add the topic to the team and refresh the button
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
					{/* the filled icon. it takes the primary color unless the button is highlighted */}
					<Users className={cn("size-4 fill-current", !isHighlighted && "text-primary")} />
					Team Up
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56" bodyClassName="p-1">
				{/* the teams that have the topic. the whole row removes it, and the X shows that */}
				{teamsWithTopic.map((team) => (
					<TeamActionRow
						key={team.teamId}
						team={team}
						verb="Remove topic from"
						Icon={X}
						onSelect={() => void handleDetach(team)}
					/>
				))}
				{/* the led teams that could still take the topic */}
				{otherTeams.length > 0 && <div className="bg-border my-1 h-px" />}
				{otherTeams.map((team) => (
					<TeamActionRow
						key={team.teamId}
						team={team}
						verb="Add topic to"
						Icon={Plus}
						onSelect={() => void handleAdd(team)}
					/>
				))}
				{/* the New team row */}
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

// one team option in the Team Up menu. the whole option acts, and the icon at its end shows which way
function TeamActionRow({
	team,
	verb,
	Icon,
	onSelect,
}: {
	team: TeamSummary
	// what the row does, read in its tooltip and its accessible name
	verb: string
	Icon: typeof Plus
	onSelect: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" onClick={onSelect} aria-label={`${verb} ${team.name}`} className={MENU_OPTION_CLASS}>
					<TeamAvatar team={team} className="size-5" />
					<span className="min-w-0 flex-1 truncate">{team.name}</span>
					<Icon className="text-muted-foreground size-4 shrink-0" />
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{verb} <span className="font-semibold">{team.name}</span>
			</TooltipContent>
		</Tooltip>
	)
}
