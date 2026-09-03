import type { InviteRejection } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { sendAcceptInvite } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { usePageTitle } from "@/hooks/usePageTitle"
import { INVITE_REJECTIONS } from "./inviteRejections"

/**
 * The page an invite link opens. A signed-out visitor is sent to log in and comes back here,
 * and a signed-in user accepts the token and opens the topic or team that sent the invite.
 */
export function InvitePage() {
	usePageTitle("Invitation")
	const { token } = useParams()
	const navigate = useNavigate()
	const { data: session, isPending } = authClient.useSession()
	const [inviteRejection, setInviteRejection] = useState<InviteRejection | "teamFull" | null>(null)

	// accept the token exactly once, as soon as the session loads, then go to the topic or team it opens
	const isAcceptingInviteRef = useRef(false)
	useEffect(() => {
		if (isPending || !session || isAcceptingInviteRef.current) {
			return
		}
		isAcceptingInviteRef.current = true
		void sendAcceptInvite(token ?? "")
			.catch(() => {
				// a network failure may pass on a later visit, so the once-latch opens back up
				isAcceptingInviteRef.current = false
				return { status: "unknown" } as const
			})
			.then((inviteResponse) => {
				// navigate to the accepted topic
				if (inviteResponse.status === "joined") {
					navigate(`/topics/${inviteResponse.topicId}`, { replace: true })
					return
				}
				// navigate to the accepted team
				if (inviteResponse.status === "joinedTeam" || inviteResponse.status === "requestedTeam") {
					navigate(`/teams/${inviteResponse.teamId}`, { replace: true })
					return
				}
				setInviteRejection(inviteResponse.status)
			})
	}, [isPending, session, token, navigate])

	// the session decides whether this visitor can accept at all, so nothing renders until it resolves
	if (isPending) {
		return <CoffeeLoading />
	}

	// a signed-out visitor logs in and returns to this same url which includes the invitation
	if (!session) {
		return <Navigate to={`/login?next=/invite/${token}`} replace />
	}

	return (
		<div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-4 py-12">
			<CoffeeMug className="size-12" />
			{/* the invite rejection with its way forward, or a loading line while the acceptance runs */}
			{inviteRejection ? (
				<div className="text-center">
					<p className="text-lg font-semibold">{INVITE_REJECTIONS[inviteRejection]}</p>
					<p className="text-muted-foreground mt-2 text-sm">
						{inviteRejection === "teamFull" ? (
							"Ask a team leader to make room, then try again."
						) : (
							<>
								{"Ask whoever invited you for a fresh link, or "}
								<AnchorLink href="/" className="text-link hover:underline">
									go find a topic
								</AnchorLink>
							</>
						)}
					</p>
				</div>
			) : (
				<p className="text-muted-foreground text-center text-sm">Carl is checking your invitation…</p>
			)}
		</div>
	)
}
