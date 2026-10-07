import type { TeamSummary, TopicResponse } from "@shared/contracts"
import { Plus, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { fetchLeaderTeams, sendAddTopicTeam, sendRemoveTopicFromTeam } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { NewTeamOption, TeamActionOption } from "@/components/team/TeamMenuOptions"
import { MENU_BUTTON_CLASS, MENU_DIVIDER_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * Whether the user may add the topic to a team, signed in and never on someone else's private topic.
 */
export function isAddTopicToTeamShown(
	topic: Pick<TopicResponse, "isTopicOwner" | "visibility">,
	isSignedIn: boolean,
): boolean {
	return isSignedIn && !(topic.visibility === "private" && !topic.isTopicOwner)
}

// the topic fields that adding the topic to a team reads
export type AddTopicToTeamTopic = Pick<
	TopicResponse,
	"id" | "name" | "isTopicOwner" | "visibility" | "team" | "roomTeams"
>

// the add topic to team actions on one topic. the user's leader teams with and without the topic,
// whether the owning team or one of the user's teams holds the topic, adding and removing the topic,
// and the New team modal
export type AddTopicToTeamState = {
	leaderTeams: TeamSummary[] | null
	leaderTeamsWithTopic: TeamSummary[]
	leaderTeamsWithoutTopic: TeamSummary[]
	hasHoldingTeams: boolean
	loadLeaderTeams: () => Promise<TeamSummary[]>
	addTopicToTeam: (team: TeamSummary) => Promise<void>
	removeTopicFromTeam: (team: TeamSummary) => Promise<void>
	openNewTeamModal: () => Promise<void>
	newTeamModal: React.ReactNode
}

// the topic, whether to load the user's teams, and the call that runs after the topic's teams change
type UseAddTopicToTeamOptions = {
	topic: AddTopicToTeamTopic
	shouldLoadLeaderTeams: boolean
	onTopicTeamsChanged: () => void
}

/**
 * Loads the teams that the user leads and returns the add topic to team actions on the topic.
 */
export function useAddTopicToTeam({
	topic,
	shouldLoadLeaderTeams,
	onTopicTeamsChanged,
}: UseAddTopicToTeamOptions): AddTopicToTeamState {
	// the teams that the user leads, null until the teams load, and whether the New team modal is open
	const [leaderTeams, setLeaderTeams] = useState<TeamSummary[] | null>(null)
	const [isNewTeamModalOpen, setIsNewTeamModalOpen] = useState(false)
	// the topics that the New team modal offers, loaded when the modal opens
	const [newTeamModalTopics, setNewTeamModalTopics] = useState<{ id: string; name: string }[]>([])

	// load the teams that the user leads if shouldLoadLeaderTeams is true
	useEffect(() => {
		if (!shouldLoadLeaderTeams) {
			return
		}
		void fetchLeaderTeamsOrNone().then(setLeaderTeams)
	}, [shouldLoadLeaderTeams])

	// the teams that hold the topic among the owning team and the user's own teams
	const holdingTeamIds = new Set(topic.roomTeams.map((roomTeam) => roomTeam.teamId))
	if (topic.team) {
		holdingTeamIds.add(topic.team.teamId)
	}

	// split the user's leader teams into the teams that hold the topic and the teams that don't
	const leaderTeamsWithTopic = (leaderTeams ?? []).filter((team) => holdingTeamIds.has(team.teamId))
	const leaderTeamsWithoutTopic = (leaderTeams ?? []).filter((team) => !holdingTeamIds.has(team.teamId))

	// return the teams that the user leads, fetching the teams first if the effect has not loaded the teams yet
	const loadLeaderTeams = async (): Promise<TeamSummary[]> => {
		const loadedLeaderTeams = leaderTeams ?? (await fetchLeaderTeamsOrNone())
		setLeaderTeams(loadedLeaderTeams)
		return loadedLeaderTeams
	}

	// add the topic to the team and show a toast, or an error toast if the api rejects the topic
	const addTopicToTeam = async (team: TeamSummary): Promise<void> => {
		const rejection = await sendAddTopicTeam(team.teamId, topic.id)
		if (rejection) {
			toast.error("That topic didn't get added.")
			return
		}
		toast(`Added topic to ${team.name}.`)
		onTopicTeamsChanged()
	}

	// remove the topic from the team, and show a toast if the removal worked
	const removeTopicFromTeam = async (team: TeamSummary): Promise<void> => {
		const isTopicRemoved = await sendRemoveTopicFromTeam(team.teamId, topic.id)
		if (!isTopicRemoved) {
			return
		}
		toast(`Removed topic from ${team.name}.`)
		onTopicTeamsChanged()
	}

	// open the New team modal with the topics that the user may add, this topic included
	const openNewTeamModal = async (): Promise<void> => {
		const addableTopics = await fetchAddableTopics()
		const isTopicAddable = addableTopics.some((addableTopic) => addableTopic.id === topic.id)
		setNewTeamModalTopics(isTopicAddable ? addableTopics : [{ id: topic.id, name: topic.name }, ...addableTopics])
		setIsNewTeamModalOpen(true)
	}

	// the New team modal, with this topic picked
	const newTeamModal = isNewTeamModalOpen ? (
		<EditTeamModal
			userTopics={newTeamModalTopics}
			initialTopicIds={[topic.id]}
			onClose={() => setIsNewTeamModalOpen(false)}
		/>
	) : null
	return {
		leaderTeams,
		leaderTeamsWithTopic,
		leaderTeamsWithoutTopic,
		hasHoldingTeams: holdingTeamIds.size > 0,
		loadLeaderTeams,
		addTopicToTeam,
		removeTopicFromTeam,
		openNewTeamModal,
		newTeamModal,
	}
}

/**
 * The add topic to team options for the topic, ending in New team.
 */
export function AddTopicToTeamOptionList({
	addTopicToTeamState,
	onSelect,
}: {
	addTopicToTeamState: AddTopicToTeamState
	onSelect?: () => void
}) {
	return (
		<>
			{/* the user's leader teams that hold the topic. each option removes the topic, shown by its X icon */}
			{addTopicToTeamState.leaderTeamsWithTopic.map((team) => (
				<TeamActionOption
					key={team.teamId}
					team={team}
					actionLabel="Remove topic from"
					Icon={X}
					onSelect={() => {
						onSelect?.()
						void addTopicToTeamState.removeTopicFromTeam(team)
					}}
				/>
			))}
			{/* the leader teams that could still take the topic */}
			{addTopicToTeamState.leaderTeamsWithTopic.length > 0 &&
				addTopicToTeamState.leaderTeamsWithoutTopic.length > 0 && <div className={MENU_DIVIDER_CLASS} />}
			{addTopicToTeamState.leaderTeamsWithoutTopic.map((team) => (
				<TeamActionOption
					key={team.teamId}
					team={team}
					actionLabel="Add topic to"
					Icon={Plus}
					onSelect={() => {
						onSelect?.()
						void addTopicToTeamState.addTopicToTeam(team)
					}}
				/>
			))}
			{/* the New team option */}
			{(addTopicToTeamState.leaderTeams ?? []).length > 0 && <div className={MENU_DIVIDER_CLASS} />}
			<NewTeamOption
				onCreate={() => {
					onSelect?.()
					void addTopicToTeamState.openNewTeamModal()
				}}
			/>
		</>
	)
}

/**
 * The add topic to team button and its menu, with its icon filled if a team that the user leads holds the topic.
 */
export function AddTopicToTeamButton({
	topic,
	isSignedIn,
	onTopicTeamsChanged,
}: {
	topic: AddTopicToTeamTopic
	isSignedIn: boolean
	onTopicTeamsChanged: () => void
}) {
	// whether the menu is open, whether the button shows, and the add topic to team actions
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const isAddTopicToTeamButtonShown = isAddTopicToTeamShown(topic, isSignedIn)
	const addTopicToTeamState = useAddTopicToTeam({
		topic,
		shouldLoadLeaderTeams: isAddTopicToTeamButtonShown,
		onTopicTeamsChanged,
	})
	if (!isAddTopicToTeamButtonShown) {
		return null
	}

	// wait for the user's teams on a topic that a team holds. the button never switches from plain to filled
	if (addTopicToTeamState.hasHoldingTeams && addTopicToTeamState.leaderTeams === null) {
		return null
	}

	// fill the icon if a team that the user leads holds the topic
	const isAddTopicToTeamIconFilled = addTopicToTeamState.leaderTeamsWithTopic.length > 0

	// a user who leads no team goes straight to the New team modal
	const handleClick = async (): Promise<void> => {
		const loadedLeaderTeams = await addTopicToTeamState.loadLeaderTeams()
		if (loadedLeaderTeams.length === 0) {
			await addTopicToTeamState.openNewTeamModal()
			return
		}
		setIsMenuOpen(true)
	}

	return (
		<>
			<Popover open={isMenuOpen} onOpenChange={(isOpen) => !isOpen && setIsMenuOpen(false)}>
				<PopoverTrigger asChild>
					<button type="button" onClick={() => void handleClick()} className={MENU_BUTTON_CLASS}>
						{/* the filled icon takes the primary color */}
						<Users className={cn("size-4", isAddTopicToTeamIconFilled && "text-primary fill-current")} />
						Team Up
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-56" bodyClassName="p-1">
					<AddTopicToTeamOptionList addTopicToTeamState={addTopicToTeamState} onSelect={() => setIsMenuOpen(false)} />
				</PopoverContent>
			</Popover>
			{/* the New team modal, with this topic picked */}
			{addTopicToTeamState.newTeamModal}
		</>
	)
}

// the teams that the user leads, or none if the teams fail to load
async function fetchLeaderTeamsOrNone(): Promise<TeamSummary[]> {
	return fetchLeaderTeams().catch(() => [])
}
