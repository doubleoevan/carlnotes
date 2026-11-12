import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { useTeams } from "@carlnotes/core/hooks/useTeams"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { Plus, Users } from "lucide-react-native"
import { useState } from "react"
import {
	MOBILE_AVATAR_HEADER_ELEMENTS,
	MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { EmptyListCard } from "@/components/table/TableCard"
import { SentTeamInvitesTable } from "@/components/table/TeamInvitesTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { HIGHLIGHTED_PAGE_BUTTON_CLASS } from "@/pageButtonClasses"

/**
 * Lists the user's teams and pending invitations.
 */
export default function TeamsScreen() {
	// load memberships and invitations for the current account
	const { data: session } = authClient().useSession()
	const [isCreating, setIsCreating] = useState(false)
	const query = useTeams()
	const handleReload = (): void => {
		void query.refetch()
	}
	return (
		<PageScreen
			title="Teams"
			icon={Users}
			titleBadge={<UserMenuUpdateCountBadge label="Teams" />}
			byline={
				session ? (
					<AvatarHeader
						subject={{ subjectKind: "user", user: toSessionProfileIdentity(session.user) }}
						elements={MOBILE_AVATAR_HEADER_ELEMENTS}
					/>
				) : (
					<AvatarHeaderSkeleton elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />
				)
			}
			contentClassName="mt-2 gap-0"
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
			action={
				<Button
					className={HIGHLIGHTED_PAGE_BUTTON_CLASS}
					accessibilityLabel="New team"
					onPress={() => setIsCreating(true)}
				>
					<Icon as={Plus} className="size-4" />
					<Text>New team</Text>
				</Button>
			}
		>
			{query.isPending ? (
				<PageSkeleton kind="teams" />
			) : query.data ? (
				<>
					<CollapsibleSection title="Your teams" countLabel={toSectionCountLabel(query.data.teams.length, "team")}>
						{query.data.teams.length || query.data.receivedInvites.length ? (
							<TeamsMembershipTable
								teams={query.data.teams}
								receivedInvites={query.data.receivedInvites}
								onChanged={handleReload}
							/>
						) : (
							<EmptyListCard>
								<Button
									variant="link"
									accessibilityLabel="Start a team"
									onPress={() => setIsCreating(true)}
									className="self-start"
								>
									<Text>Start a team. Carl brews for everyone at once.</Text>
								</Button>
							</EmptyListCard>
						)}
					</CollapsibleSection>
					{query.data.sentInvites.length > 0 && (
						<CollapsibleSection
							title="Your team invites"
							countLabel={toSectionCountLabel(query.data.sentInvites.length, "invite")}
						>
							<SentTeamInvitesTable invites={query.data.sentInvites} onReload={handleReload} />
						</CollapsibleSection>
					)}
				</>
			) : (
				<LoadFailedNotice message="Teams didn't load." retryLabel="Retry loading teams" onRetry={handleReload} />
			)}
			{isCreating && <EditTeamModal onClose={() => setIsCreating(false)} />}
		</PageScreen>
	)
}
