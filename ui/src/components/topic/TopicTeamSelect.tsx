// the topic edit modal's teams field: which of the user's led teams hold the topic after the save
import type { TeamSummary, TopicResponse } from "@shared/contracts"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
	fetchTeamNameTaken,
	fetchTeams,
	sendAddTopicTeam,
	sendCreateTeam,
	sendRemoveTopicFromTeam,
} from "@/clients/teamClient"
import { FieldLabel } from "@/components/common/FieldLabel"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { type PendingInvite, sendPendingInvites, TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Input } from "@/components/primitives/input"
import { Switch } from "@/components/primitives/switch"
import { NEW_TEAM_CHOICE, NEW_TEAM_OPTION, toTeamChoices } from "@/lib/topicTeamChoices"

// the teams choice with the writes that apply it
export type TopicTeamField = ReturnType<typeof useTopicTeamChoice>

/**
 * The teams holding the topic after an edit. Led teams toggle on and off, and the New team row creates
 * one more holding team after the save. A holding team the user does not lead is left alone.
 */
export function useTopicTeamChoice(topic: TopicResponse | undefined, initialTeam?: { teamId: string; name: string }) {
	const [teams, setTeams] = useState<TeamSummary[] | null>(null)
	// a create opened from a team page starts on that team. anything else waits for the teams to load
	const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(initialTeam ? [initialTeam.teamId] : [])
	// a new team's fields: its name, its visibility, and the invitations sent once it exists
	const [newTeamName, setNewTeamName] = useState("")
	const [isNewTeamPublic, setNewTeamPublic] = useState(false)
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
	const [newTeamRejection, setNewTeamRejection] = useState<string | null>(null)

	// the ids of the user's teams that already hold the topic
	const holdingTeamIds = (topic?.roomTeams ?? []).map((roomTeam) => roomTeam.teamId)

	// the led teams load with the modal, seeding the selection with the ones already holding the topic
	// biome-ignore lint/correctness/useExhaustiveDependencies: the topic id identifies the seed
	useEffect(() => {
		fetchTeams()
			.then((index) => {
				const ledTeams = index.teams.filter((team) => team.role === "leader")
				setTeams(ledTeams)
				const heldLedTeamIds = ledTeams.map((team) => team.teamId).filter((teamId) => holdingTeamIds.includes(teamId))
				// an existing topic starts on the led teams that hold it. a new one takes the first team led, never none
				setSelectedTeamIds((chosen) => {
					if (chosen.length > 0) {
						return chosen
					}
					if (topic) {
						return heldLedTeamIds
					}
					return ledTeams[0] ? [ledTeams[0].teamId] : []
				})
			})
			.catch(() => setTeams([]))
	}, [topic?.id])

	// the teams offered: every led team, plus the create-page team when it is not led
	const offeredTeams = (teams ?? []).some((team) => team.teamId === initialTeam?.teamId)
		? (teams ?? [])
		: [...(teams ?? []), ...(initialTeam ? [initialTeam] : [])]

	// what the field actually selected: the real teams, and whether the New team row is on
	const selectedRealTeamIds = selectedTeamIds.filter((teamId) => teamId !== NEW_TEAM_CHOICE)
	const isNewTeamSelected = selectedTeamIds.includes(NEW_TEAM_CHOICE)

	// a non-private topic must land on a team: a led one selected, a new one named, or a team of the
	// user's that already holds it and is not theirs to manage here
	const heldElsewhereCount = holdingTeamIds.filter(
		(teamId) => !(teams ?? []).some((team) => team.teamId === teamId),
	).length
	const isTeamChosen =
		teams === null ||
		selectedRealTeamIds.length > 0 ||
		heldElsewhereCount > 0 ||
		(isNewTeamSelected && newTeamName.trim() !== "")

	// apply the selection once the topic is saved: create the named team, add the newly picked, drop the unpicked
	const assignTopicTeam = async (topicId: string): Promise<void> => {
		if (teams === null) {
			return
		}
		// the new team is created holding the topic, with its queued invitations sent
		if (isNewTeamSelected && newTeamName.trim() !== "") {
			await createNewTeam(topicId, { name: newTeamName, isPublic: isNewTeamPublic, pendingInvites })
		}

		// the diff against the led teams that held the topic when the modal opened
		const heldLedTeamIds = teams.map((team) => team.teamId).filter((teamId) => holdingTeamIds.includes(teamId))
		const addedTeamIds = selectedRealTeamIds.filter((teamId) => !heldLedTeamIds.includes(teamId))
		const removedTeamIds = heldLedTeamIds.filter((teamId) => !selectedRealTeamIds.includes(teamId))

		// adds first, so the topic never passes through a moment with no team. a rejection shows in a toast
		const addRejections = await Promise.all(addedTeamIds.map((teamId) => sendAddTopicTeam(teamId, topicId)))
		await Promise.all(removedTeamIds.map((teamId) => sendRemoveTopicFromTeam(teamId, topicId)))
		const addRejection = addRejections.find(Boolean)
		if (addRejection) {
			toast.error(addRejection)
		}
	}

	// the blur check runs before the save does, and typing again clears the note
	const checkNewTeamName = (): void => {
		const teamName = newTeamName.trim()
		if (teamName === "") {
			return
		}
		void fetchTeamNameTaken(teamName)
			.then((isTeamNameTaken) => {
				setNewTeamRejection(isTeamNameTaken ? "A team already has that name." : null)
			})
			.catch(() => setNewTeamRejection(null))
	}
	return {
		offeredTeams,
		selectedTeamIds,
		setSelectedTeamIds,
		isNewTeamSelected,
		newTeamName,
		setNewTeamName,
		newTeamRejection,
		checkNewTeamName,
		isNewTeamPublic,
		setNewTeamPublic,
		pendingInvites,
		setPendingInvites,
		isTeamChosen,
		assignTopicTeam,
	}
}

// create the new team holding the saved topic and send its queued invitations
async function createNewTeam(
	topicId: string,
	newTeam: { name: string; isPublic: boolean; pendingInvites: PendingInvite[] },
): Promise<void> {
	if (!newTeam.name.trim()) {
		return
	}
	const createTeamResponse = await sendCreateTeam({
		name: newTeam.name.trim(),
		description: null,
		topicIds: [topicId],
		isPublic: newTeam.isPublic,
	})
	if ("rejection" in createTeamResponse) {
		toast.error(
			createTeamResponse.rejection === "name-taken"
				? "A team already holds that name."
				: "That's a lot of teams for one day. Try again tomorrow.",
		)
		return
	}
	await sendPendingInvites(createTeamResponse.teamId, newTeam.pendingInvites)
}

/**
 * The topic teams multiselect: the led teams this topic may sit on, and a new team created on save.
 */
export function TopicTeamSelect({ teamField, isTeamMissing }: { teamField: TopicTeamField; isTeamMissing?: boolean }) {
	return (
		<div className="space-y-3">
			<div>
				<FieldLabel isRequired>Teams</FieldLabel>
				<MultiCombobox
					options={toTeamChoices(teamField.offeredTeams)}
					values={teamField.selectedTeamIds}
					onUpdateValues={teamField.setSelectedTeamIds}
					placeholder="Pick teams…"
					emptyLabel="No teams to pick."
					pinnedOption={NEW_TEAM_OPTION}
				/>
				{/* the note names the field a blocked save stopped on */}
				{isTeamMissing && (
					<p className="text-destructive mt-1 text-xs">
						A public or invite topic lives on a team. Pick or create one, or set Visibility to private.
					</p>
				)}
			</div>
			{teamField.isNewTeamSelected && (
				<>
					<div>
						<FieldLabel>Name</FieldLabel>
						<Input
							value={teamField.newTeamName}
							placeholder="what to call it…"
							onChange={(event) => teamField.setNewTeamName(event.target.value)}
							onBlur={teamField.checkNewTeamName}
						/>
						{teamField.newTeamRejection && (
							<p className="text-destructive mt-1 text-xs">{teamField.newTeamRejection}</p>
						)}
					</div>
					<TeamInviteFields
						teamId={null}
						teamName={teamField.newTeamName}
						pendingInvites={teamField.pendingInvites}
						onPendingInvitesChange={teamField.setPendingInvites}
					/>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							checked={teamField.isNewTeamPublic}
							onCheckedChange={teamField.setNewTeamPublic}
							aria-label="Public"
						/>
						Public
					</div>
				</>
			)}
		</div>
	)
}
