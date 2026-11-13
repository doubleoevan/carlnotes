import { authClient } from "@carlnotes/client/authClient"
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamMember } from "@carlnotes/contracts/teams"
import { type ComponentType, useRef, useState } from "react"
import {
	type ConfirmationCopy,
	isStepDown,
	STEP_DOWN_CONFIRMATION,
	toLeaveOrRemoveMemberConfirmation,
} from "../lib/confirmationCopy"
import { toTeamMembersTableColumns } from "../lib/teamMembersTableColumns"
import type { TableColumn } from "./DataTable"

const VISIBILITY_FAILED_TEXT = "Your visibility didn't save. Try again."
const ROLE_OPTIONS = ["member", "leader"]
const VISIBILITY_OPTIONS = ["shown", "hidden"]

export type TeamMembersTableElements = {
	Text: ComponentType<{ children: string }>
	MemberLink: ComponentType<{ member: TeamMember }>
	// a leader's role choice, and the member's own choice to show on the public page
	Select: ComponentType<{
		label: string
		value: string
		options: string[]
		isDisabled: boolean
		onChange: (value: string) => void
	}>
	// the active switch and the remove button. the action and the member's name word the label and the tooltip
	ActiveSwitch: ComponentType<{
		action: string
		name: string
		isChecked: boolean
		isDisabled: boolean
		onChange: () => void
	}>
	RemoveButton: ComponentType<{ name: string; isDisabled: boolean; onPress: () => void }>
	// the sorted, paged table, starting sorted by member
	Table: ComponentType<{ members: TeamMember[]; columns: TableColumn<TeamMember>[] }>
}

/**
 * Renders a team's members: who belongs, the role a leader may change, each member's own visibility, and the active
 * switch and remove button for a leader and for the user's own row.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isTeamLeader,
	isReadOnly = false,
	onChanged,
	confirm,
	notify,
	elements: { Text, MemberLink, Select, ActiveSwitch, RemoveButton, Table },
}: {
	teamId: string
	members: TeamMember[]
	// how many opted out of the public members list
	hiddenMemberCount: number
	isTeamLeader: boolean
	// a page that only reads the team, like the admin console, where no row acts as the user's own
	isReadOnly?: boolean
	onChanged: () => void
	// the app's confirmation, which runs the action once accepted
	confirm: (copy: ConfirmationCopy, onConfirm: () => void | Promise<void>) => void
	// what a change says once it saves or fails
	notify: (text: string, isError: boolean) => void
	elements: TeamMembersTableElements
}) {
	// the user's own row and permissions. a read-only page grants neither
	const { data: session } = authClient().useSession()
	const currentUserId = isReadOnly ? null : (session?.user.id ?? null)
	const canManage = isTeamLeader && !isReadOnly
	const canRemove = (member: TeamMember): boolean => canManage || member.userId === currentUserId
	const hasRemovalColumns = canManage || members.some((member) => member.userId === currentUserId)

	// one change at a time. it says what failed, says what saved, and reloads the page
	const isMemberChangeSaving = useRef(false)
	const [isPending, setIsPending] = useState(false)
	async function saveMemberChange(action: () => Promise<string | null>): Promise<void> {
		if (isMemberChangeSaving.current) {
			return
		}
		isMemberChangeSaving.current = true
		setIsPending(true)
		try {
			const successText = await action()
			if (successText) {
				notify(successText, false)
			}
			onChanged()
		} catch (error) {
			notify(error instanceof Error ? error.message : "That change didn't save. Try again.", true)
		} finally {
			isMemberChangeSaving.current = false
			setIsPending(false)
		}
	}

	// the role change. a leader stepping down confirms first
	function changeRole(member: TeamMember, role: string): Promise<void> {
		return saveMemberChange(async () => {
			await sendTeamMemberRole(teamId, member.userId, isLeaderRole(role) ? "leader" : "member")
			return null
		})
	}
	function handleRoleChange(member: TeamMember, role: string): void {
		if (isStepDown({ memberUserId: member.userId, currentUserId, role })) {
			confirm(STEP_DOWN_CONFIRMATION, () => changeRole(member, role))
			return
		}
		void changeRole(member, role)
	}

	// removing someone, or leaving, which confirms first
	function handleRemovePress(member: TeamMember): void {
		confirm(toLeaveOrRemoveMemberConfirmation({ member, currentUserId }), () =>
			saveMemberChange(async () => {
				await sendRemoveTeamMember(teamId, member.userId)
				return member.userId === currentUserId ? "You left the team." : `Removed ${member.username} from the team.`
			}),
		)
	}

	// switching a waiting request on admits them, unless the team is full or the request was withdrawn
	function handleApprove(member: TeamMember): void {
		void saveMemberChange(async () => {
			const outcome = await sendApproveJoinRequest(teamId, member.userId)
			if (outcome === "limited") {
				throw new Error("The team is full. A paying leader lifts the limit.")
			}
			if (outcome !== "joined") {
				throw new Error(`${member.username} didn't join. Their request may have been withdrawn.`)
			}
			return `Added ${member.username} to the team.`
		})
	}

	// the member-visibility opt-out only changes the user's own row
	function handleVisibilityChange(member: TeamMember, visibility: string): void {
		void saveMemberChange(async () => {
			await setTeamMemberVisibility(teamId, member.userId, visibility === "shown").catch(() => {
				throw new Error(VISIBILITY_FAILED_TEXT)
			})
			return null
		})
	}

	// the shared columns with this platform's cells. a reader reads the role and the visibility as text
	const columns = toTeamMembersTableColumns({
		members,
		hiddenMemberCount,
		hasRemovalColumns,
		renderText: (text) => <Text>{text}</Text>,
		renderMember: (member) => <MemberLink member={member} />,
		renderRole: (member) =>
			canManage ? (
				<Select
					label={`${member.username} role`}
					value={member.role}
					options={ROLE_OPTIONS}
					isDisabled={isPending}
					onChange={(role) => handleRoleChange(member, role)}
				/>
			) : (
				<Text>{member.role}</Text>
			),
		renderVisibility: (member) =>
			member.userId === currentUserId ? (
				<Select
					label="Your visibility on the public page"
					value={member.isMemberVisible ? "shown" : "hidden"}
					options={VISIBILITY_OPTIONS}
					isDisabled={isPending}
					onChange={(visibility) => handleVisibilityChange(member, visibility)}
				/>
			) : (
				<Text>{member.isMemberVisible ? "shown" : "hidden"}</Text>
			),
		// off is a request to join, which a leader switches on to admit. switching a member off removes them
		renderActive: (member) =>
			canRemove(member) && (
				<ActiveSwitch
					action={member.isActive ? "Deactivate" : "Activate"}
					name={member.username}
					isChecked={member.isActive}
					isDisabled={isPending || (!member.isActive && !canManage)}
					onChange={() => (member.isActive ? handleRemovePress(member) : handleApprove(member))}
				/>
			),
		renderRemove: (member) =>
			canRemove(member) && (
				<RemoveButton name={member.username} isDisabled={isPending} onPress={() => handleRemovePress(member)} />
			),
	})
	return <Table members={members} columns={columns} />
}
