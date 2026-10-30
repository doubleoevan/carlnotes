import { authClient } from "@carlnotes/client/authClient"
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import type { TeamMember } from "@carlnotes/contracts/teams"
import { memberSortValues, toTeamMembersTableColumns } from "@carlnotes/core/lib/teamMembersTableColumns"
import { X } from "lucide-react-native"
import { View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { DataTable } from "./DataTable"

/**
 * Applies the web's member permissions and shared columns to native team management.
 */
export function TeamMembersTable({
	teamId,
	members,
	hiddenMemberCount,
	isTeamLeader,
	isReadOnly = false,
	onChanged,
}: {
	teamId: string
	members: TeamMember[]
	hiddenMemberCount: number
	isTeamLeader: boolean
	isReadOnly?: boolean
	onChanged: () => void
}) {
	// a public profile inspection never grants the current account's own controls
	const { data: session } = authClient().useSession()
	const currentUserId = isReadOnly ? null : session?.user.id
	const canManage = isTeamLeader && !isReadOnly
	const hasRemovalColumns = canManage || members.some((member) => member.userId === currentUserId)
	const mutation = usePageMutation(onChanged)
	const canRemove = (member: TeamMember): boolean => canManage || member.userId === currentUserId
	async function handleRole(member: TeamMember, role: string): Promise<void> {
		if (!(await sendTeamMemberRole(teamId, member.userId, role === "leader" ? "leader" : "member"))) {
			throw new Error("Promote another leader first. A team can't lose its last one.")
		}
	}
	async function handleRemove(member: TeamMember): Promise<void> {
		if (!(await sendRemoveTeamMember(teamId, member.userId))) {
			throw new Error("Promote another leader first. A team can't lose its last one.")
		}
	}
	async function handleActive(member: TeamMember): Promise<void> {
		if (member.isActive) {
			await handleRemove(member)
			return
		}
		const outcome = await sendApproveJoinRequest(teamId, member.userId)
		if (outcome === "limited") {
			throw new Error("The team is full. A paying leader lifts the limit.")
		}
		if (outcome !== "joined") {
			throw new Error(`${member.username} didn't join. Their request may have been withdrawn.`)
		}
	}
	const columns = toTeamMembersTableColumns({
		members,
		hiddenMemberCount,
		hasRemovalColumns,
		renderText: (text) => <Text className="text-sm text-muted-foreground">{text}</Text>,
		renderMember: (member) => <UserProfileLink user={member} />,
		renderRole: (member) =>
			canManage ? (
				<ChoiceSelect
					label={`${member.username} role`}
					value={member.role}
					options={[
						{ value: "member", label: "member" },
						{ value: "leader", label: "leader" },
					]}
					isDisabled={mutation.isPending}
					onChange={(role) => void mutation.run(() => handleRole(member, role))}
				/>
			) : (
				<Text className="text-sm text-muted-foreground">{member.role}</Text>
			),
		renderVisibility: (member) =>
			member.userId === currentUserId ? (
				<ChoiceSelect
					label="Your visibility on the public page"
					value={member.isMemberVisible ? "shown" : "hidden"}
					options={[
						{ value: "shown", label: "shown" },
						{ value: "hidden", label: "hidden" },
					]}
					isDisabled={mutation.isPending}
					onChange={(visibility) =>
						void mutation.run(() => setTeamMemberVisibility(teamId, member.userId, visibility === "shown"))
					}
				/>
			) : (
				<Text className="text-sm text-muted-foreground">{member.isMemberVisible ? "shown" : "hidden"}</Text>
			),
		renderActive: (member) =>
			canRemove(member) && (
				<PreferenceSwitch
					label={`${member.isActive ? "Deactivate" : "Activate"} ${member.username}`}
					isChecked={member.isActive}
					isDisabled={mutation.isPending || (!member.isActive && !canManage)}
					onChange={() => void mutation.run(() => handleActive(member))}
				/>
			),
		renderRemove: (member) =>
			canRemove(member) && (
				<Button
					size="icon-sm"
					variant="ghost"
					accessibilityLabel={`Remove ${member.username} from the team`}
					disabled={mutation.isPending}
					onPress={() => void mutation.run(() => handleRemove(member))}
				>
					<Icon as={X} className="size-4" />
				</Button>
			),
	})
	return (
		<View className="gap-2">
			<DataTable
				rows={members}
				columns={columns}
				valueByKey={memberSortValues}
				initialSort={{ key: "member" }}
				getRowId={(member) => member.userId}
			/>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</View>
	)
}
