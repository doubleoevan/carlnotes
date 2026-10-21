// what a private team's page shows a non-member or a visitor: the page's shape, and the notice that offers a way in
import { useNavigate } from "@tanstack/react-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { JoinTeamButton } from "./JoinTeamButton"

// the decorative rows the gated page draws where its tables would be
const TEAM_SKELETON_ROWS = ["members", "topics", "footer"]

/**
 * The team page's shape while it is gated: the name over decorative pulse rows.
 */
export function TeamSkeleton({ teamName }: { teamName: string }) {
	return (
		<>
			<header className="flex items-center gap-4">
				<div aria-hidden="true" className="bg-muted size-16 shrink-0 animate-pulse rounded-full" />
				<h1 className="font-display text-2xl">{teamName}</h1>
			</header>
			{/* everything below the name is decorative pulse, hidden from assistive tech as one block */}
			<div aria-hidden="true" className="mt-6 space-y-4">
				{TEAM_SKELETON_ROWS.map((skeletonKey) => (
					<div key={skeletonKey} className="bg-muted h-10 w-full animate-pulse rounded" />
				))}
			</div>
		</>
	)
}

/**
 * What a non-member or a visitor is told about a private team, and how they get in: asking to join, or an invitation.
 */
export function TeamGateNotice({
	teamId,
	teamName,
	isSignedIn,
	hasRequestedToJoin,
	onChanged,
}: {
	teamId: string
	teamName: string
	isSignedIn: boolean
	hasRequestedToJoin: boolean
	onChanged: () => void
}) {
	const navigate = useNavigate()
	return (
		<Dialog open onOpenChange={() => navigate({ to: "/" })}>
			{/* the gate's own actions are the only ways out, so there is no ✕ */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>This team is invite-only</DialogTitle>
				<DialogDescription>
					{isSignedIn
						? `Ask to join and a leader of ${teamName} can add you, or they can send you an invitation.`
						: `Sign up, then ask a leader of ${teamName} for an invitation.`}
				</DialogDescription>
				<DialogFooter>
					{isSignedIn && (
						<JoinTeamButton
							teamId={teamId}
							teamName={teamName}
							hasJoinRequest={hasRequestedToJoin}
							isSignedIn
							onChangeRequest={onChanged}
						/>
					)}
					{!isSignedIn && (
						<AnchorLink href="/signup?cta=team-gate" className={buttonVariants({ variant: "default" })}>
							Sign up
						</AnchorLink>
					)}
					<Button variant="outline" onClick={() => navigate({ to: "/" })}>
						Back to topics
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
