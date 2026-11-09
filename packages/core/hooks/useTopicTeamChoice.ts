import {
	fetchLeaderTeams,
	fetchTeamNameTaken,
	sendAddTopicTeam,
	sendRemoveTopicFromTeam,
	sendUpdateTeam,
} from "@carlnotes/client/teamClient"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useRef, useState } from "react"
import { createTeam, TEAM_REJECTION_REASONS } from "../lib/saveTeam"
import type { PendingInvite } from "../lib/teamFields"
import { sendPendingTeamInvites } from "../lib/teamInvites"
import { NEW_TEAM_CHOICE } from "../lib/topicTeamChoices"

export type TopicTeamField = {
	// the teams offered and the ones selected
	offeredTeams: { teamId: string; name: string }[]
	selectedTeamIds: string[]
	setSelectedTeamIds: (ids: string[]) => void
	// whether the New team option is on, and the new team's name
	isNewTeamSelected: boolean
	newTeamName: string
	setNewTeamName: (name: string) => void
	// the name check's note and the check itself
	newTeamRejection: string | null
	checkNewTeamName: () => void
	// the new team's visibility and the invitations it sends once it exists
	isNewTeamPublic: boolean
	setIsNewTeamPublic: (value: boolean) => void
	pendingInvites: PendingInvite[]
	setPendingInvites: (invites: PendingInvite[]) => void
	// whether the save may go ahead, the write after it, and the load state
	isTeamChosen: boolean
	assignTopicTeam: (topicId: string) => Promise<void>
	loadError: string | null
	isLoading: boolean
}

/**
 * Shares the Topic editor's team selection, permissions, and writes across platforms.
 */
export function useTopicTeamChoice(
	topic: TopicResponse | undefined,
	initialTeam?: { teamId: string; name: string },
): TopicTeamField {
	const createdTeam = useRef<{ teamId: string; name: string } | null>(null)
	const savedTeamIds = useRef(new Set<string>())
	const nameCheckRevision = useRef(0)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [teams, setTeams] = useState<TeamSummary[] | null>(null)
	// a create opened from a team page starts on that team. anything else waits for the teams to load
	const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(initialTeam ? [initialTeam.teamId] : [])
	// a new team's fields: its name, its visibility, and the invitations sent once it exists
	const [newTeamName, setNewTeamNameState] = useState("")
	const [isNewTeamPublic, setIsNewTeamPublic] = useState(false)
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
	const [newTeamRejection, setNewTeamRejection] = useState<string | null>(null)

	// the ids of the user's teams that already hold the topic
	const holdingTeamIds = (topic?.roomTeams ?? []).map((roomTeam) => roomTeam.teamId)

	// the leader teams load with the modal, seeding the selection with the ones already holding the topic
	// biome-ignore lint/correctness/useExhaustiveDependencies: the topic id identifies the seed
	useEffect(() => {
		let isCurrent = true
		fetchLeaderTeams()
			.then((leaderTeams) => {
				if (!isCurrent) {
					return
				}
				// the leader teams, and the ones among them already holding the topic, which a retry compares against
				setTeams(leaderTeams)
				const holdingLeaderTeamIds = leaderTeams
					.map((team) => team.teamId)
					.filter((teamId) => holdingTeamIds.includes(teamId))
				savedTeamIds.current = new Set(holdingLeaderTeamIds)
				// an existing topic starts on the leader teams that hold it. a new one takes the first team led, never none
				setSelectedTeamIds((chosen) => {
					if (chosen.length > 0) {
						return chosen
					}
					// an existing topic keeps the teams holding it
					if (topic) {
						return holdingLeaderTeamIds
					}
					return leaderTeams[0] ? [leaderTeams[0].teamId] : []
				})
			})
			// a failed load shows its note in place of the teams
			.catch(() => {
				if (isCurrent) {
					setLoadError("Teams didn’t load. Close and reopen the form to try again.")
				}
			})
		// a closed modal or a new topic ignores the load still in flight
		return () => {
			isCurrent = false
		}
	}, [topic?.id])

	// the teams offered: every leader team, plus the create-page team when it is not led
	const offeredTeams = (teams ?? []).some((team) => team.teamId === initialTeam?.teamId)
		? (teams ?? [])
		: [...(teams ?? []), ...(initialTeam ? [initialTeam] : [])]

	// what the field actually selected: the real teams, and whether the New team row is on
	const selectedRealTeamIds = selectedTeamIds.filter((teamId) => teamId !== NEW_TEAM_CHOICE)
	const isNewTeamSelected = selectedTeamIds.includes(NEW_TEAM_CHOICE)

	// a non-private topic must land on a team: a led one selected, a new one named, or one held where the user can't manage
	const isTeamChosen =
		teams !== null &&
		(selectedRealTeamIds.length > 0 ||
			isTopicHeldElsewhere(topic, teams) ||
			(isNewTeamSelected && newTeamName.trim() !== ""))

	// apply the selection once the topic is saved: create the named team, add the newly picked, drop the unpicked
	const assignTopicTeam = async (topicId: string): Promise<void> => {
		if (teams === null) {
			throw new Error(loadError ?? "Wait for teams to finish loading.")
		}
		// retain each accepted write so retrying compares against the server's current memberships
		const desiredTeamIds = new Set(selectedRealTeamIds)
		if (isNewTeamSelected && newTeamName.trim() !== "") {
			desiredTeamIds.add(await createSelectedTeam(topicId))
		}
		// the memberships, then the new team's invitations
		await saveTopicTeams({ topicId, desiredTeamIds, savedTeamIds: savedTeamIds.current })
		if (isNewTeamSelected && createdTeam.current) {
			await sendNewTeamInvites(createdTeam.current.teamId)
		}
	}

	// retain the created identity through later upload or invitation failures
	async function createSelectedTeam(topicId: string): Promise<string> {
		// the first save creates the team
		if (!createdTeam.current) {
			const createTeamResult = await createTeam({
				name: newTeamName.trim(),
				description: null,
				topicIds: [topicId],
				isPublic: isNewTeamPublic,
			})
			if ("rejection" in createTeamResult) {
				throw new Error(createTeamResult.rejection)
			}
			createdTeam.current = { teamId: createTeamResult.teamId, name: newTeamName.trim() }
			savedTeamIds.current.add(createTeamResult.teamId)
		} else {
			// a retry saves the created team's current name and visibility
			const rejection = await sendUpdateTeam(createdTeam.current.teamId, {
				name: newTeamName.trim(),
				description: null,
				isPublic: isNewTeamPublic,
			})
			if (rejection) {
				throw new Error(TEAM_REJECTION_REASONS[rejection])
			}
			createdTeam.current.name = newTeamName.trim()
		}
		return createdTeam.current.teamId
	}

	// remove sent invitations from a retry without clearing unsent choices
	async function sendNewTeamInvites(teamId: string): Promise<void> {
		await sendPendingTeamInvites({ teamId, invites: pendingInvites, setPendingInvites })
	}

	// the blur check runs before the save does, and typing again clears the note
	const checkNewTeamName = (): void => {
		const teamName = newTeamName.trim()
		const revision = ++nameCheckRevision.current
		if (teamName === "" || teamName.toLowerCase() === createdTeam.current?.name.toLowerCase()) {
			return
		}
		// a stale check never overwrites a newer one
		void fetchTeamNameTaken(teamName)
			.then((isTeamNameTaken) => {
				if (revision === nameCheckRevision.current) {
					setNewTeamRejection(isTeamNameTaken ? TEAM_REJECTION_REASONS["name-taken"] : null)
				}
			})
			.catch(() => {})
	}
	// discard a name check when the draft name changes
	const setNewTeamName = (name: string): void => {
		nameCheckRevision.current += 1
		setNewTeamNameState(name)
		setNewTeamRejection(null)
	}
	return {
		loadError,
		isLoading: teams === null && loadError === null,
		offeredTeams,
		selectedTeamIds,
		setSelectedTeamIds,
		isNewTeamSelected,
		newTeamName,
		setNewTeamName,
		newTeamRejection,
		checkNewTeamName,
		isNewTeamPublic,
		setIsNewTeamPublic,
		pendingInvites,
		setPendingInvites,
		isTeamChosen,
		assignTopicTeam,
	}
}

/**
 * Applies team membership changes while retaining every accepted write for a retry.
 */
export async function saveTopicTeams({
	topicId,
	desiredTeamIds,
	savedTeamIds,
}: {
	topicId: string
	desiredTeamIds: ReadonlySet<string>
	savedTeamIds: Set<string>
}): Promise<void> {
	// add all selected teams before removing any existing membership
	for (const teamId of desiredTeamIds) {
		if (savedTeamIds.has(teamId)) {
			continue
		}
		// a rejected add stops the save, and an accepted one is remembered for a retry
		const rejection = await sendAddTopicTeam(teamId, topicId)
		if (rejection) {
			throw new Error(rejection)
		}
		savedTeamIds.add(teamId)
	}
	// keep rejected removals in the saved set until the server accepts them
	for (const teamId of savedTeamIds) {
		if (desiredTeamIds.has(teamId)) {
			continue
		}
		// a rejected removal stops the save, and an accepted one leaves the saved set
		if (!(await sendRemoveTopicFromTeam(teamId, topicId))) {
			throw new Error("A team change didn’t save. Try again.")
		}
		savedTeamIds.delete(teamId)
	}
}

/**
 * Returns whether a team the user doesn't lead already holds the topic: its owning team, or a team of the user's that
 * shares it. Such a team keeps the topic on a team whatever the user's own teams are set to.
 */
export function isTopicHeldElsewhere(
	topic: Pick<TopicResponse, "team" | "roomTeams"> | undefined,
	leaderTeams: { teamId: string }[],
): boolean {
	// the owning team and every holding team of the user's, less the ones the user leads
	const holdingTeamIds = [
		...(topic?.team ? [topic.team.teamId] : []),
		...(topic?.roomTeams ?? []).map((team) => team.teamId),
	]
	return holdingTeamIds.some((teamId) => !leaderTeams.some((team) => team.teamId === teamId))
}
