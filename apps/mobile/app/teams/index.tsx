import { authClient } from "@carlnotes/client/authClient"
import { fetchTeams } from "@carlnotes/client/teamClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { useQuery } from "@tanstack/react-query"
import { Plus, Users } from "lucide-react-native"
import { useState } from "react"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SentTeamInvitesTable } from "@/components/table/TeamInvitesTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"

/**
 * Lists the user's teams and pending invitations.
 */
export default function TeamsScreen() {
	// load memberships and invitations for the current account
	const { data: session } = authClient().useSession()
	const [isCreating, setIsCreating] = useState(false)
	const query = useQuery({ queryKey: ["teams", session?.user.id], queryFn: fetchTeams })
	const handleReload = (): void => {
		void query.refetch()
	}
	return (
		<PageScreen
			title="Teams"
			icon={Users}
			titleBadge={<UserMenuUpdateCountBadge label="Teams" />}
			byline={session && <UserProfileLink user={toSessionProfileIdentity(session.user)} />}
			contentClassName="mt-2 gap-0"
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
			action={
				<Button accessibilityLabel="New team" onPress={() => setIsCreating(true)}>
					<Icon as={Plus} className="size-4" />
					<Text>New team</Text>
				</Button>
			}
		>
			{query.isPending ? (
				<PageSkeleton kind="teams" />
			) : query.data ? (
				<>
					<CollapsibleSection title="Your teams">
						{query.data.teams.length || query.data.receivedInvites.length ? (
							<TeamsMembershipTable
								teams={query.data.teams}
								receivedInvites={query.data.receivedInvites}
								onChanged={handleReload}
							/>
						) : (
							<Button variant="link" accessibilityLabel="Start a team" onPress={() => setIsCreating(true)}>
								<Text>Start a team. Carl brews for everyone at once.</Text>
							</Button>
						)}
					</CollapsibleSection>
					{query.data.sentInvites.length > 0 && (
						<CollapsibleSection title="Your team invitations">
							<SentTeamInvitesTable invites={query.data.sentInvites} onReload={handleReload} />
						</CollapsibleSection>
					)}
				</>
			) : (
				<Text className="text-destructive">Teams didn't load. Pull to try again.</Text>
			)}
			{isCreating && <EditTeamModal onClose={() => setIsCreating(false)} />}
		</PageScreen>
	)
}
