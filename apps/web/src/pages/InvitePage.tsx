import { authClient } from "@carlnotes/client/authClient"
import { sendAcceptInvite } from "@carlnotes/client/topicClient"
import type { InviteRejection } from "@carlnotes/contracts/invites"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { getRouteApi, Navigate, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { usePageTitle } from "@/hooks/usePageTitle"
import { SESSION_PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { INVITE_REJECTIONS } from "./inviteRejections"

// the invite route, whose token param is the invite url's token
const inviteRoute = getRouteApi("/invite/$token")

/**
 * The page an invite link opens. A signed-out visitor is sent to log in and comes back here,
 * and a signed-in user accepts the token and opens the topic or team that sent the invite.
 */
export function InvitePage() {
	usePageTitle("Invitation")
	const { token } = inviteRoute.useParams()
	const navigate = useNavigate()
	const { data: session, isPending } = authClient.useSession()
	const [inviteRejection, setInviteRejection] = useState<InviteRejection | "teamFull" | null>(null)
	// whether the acceptance request failed to reach the api, which a retry may pass
	const [isInviteAcceptFailed, setIsInviteAcceptFailed] = useState(false)

	// accept the token once, then go to the topic or team it opens. a failed request opens the once-latch back up
	const isAcceptingInviteRef = useRef(false)
	const acceptInvite = useCallback((): void => {
		if (isAcceptingInviteRef.current) {
			return
		}
		isAcceptingInviteRef.current = true
		setIsInviteAcceptFailed(false)
		void sendAcceptInvite(token)
			.catch(() => {
				isAcceptingInviteRef.current = false
				setIsInviteAcceptFailed(true)
				return null
			})
			.then((inviteResponse) => {
				// a failed request shows its own notice, with the retry
				if (!inviteResponse) {
					return
				}
				// navigate to the accepted topic
				if (inviteResponse.status === "joined") {
					navigate({ to: "/topics/$topicId", params: { topicId: inviteResponse.topicId }, replace: true })
					return
				}
				// navigate to the accepted team
				if (inviteResponse.status === "joinedTeam" || inviteResponse.status === "requestedTeam") {
					navigate({ to: "/teams/$teamId", params: { teamId: inviteResponse.teamId }, replace: true })
					return
				}
				setInviteRejection(inviteResponse.status)
			})
	}, [token, navigate])

	// accept as soon as the session loads
	useEffect(() => {
		if (!isPending && session) {
			acceptInvite()
		}
	}, [isPending, session, acceptInvite])

	// the session decides whether this visitor can accept at all, so nothing renders until it resolves
	if (isPending) {
		return <CoffeeLoading />
	}

	// a signed-out visitor logs in and returns to this same url which includes the invitation
	if (!session) {
		return <Navigate to="/login" search={{ next: toInvitePath(token) }} replace />
	}

	return (
		<div className={cn(SESSION_PAGE_CLASS, "items-center gap-6")}>
			<CoffeeMug className="size-12" />
			{/* the request failure with its retry, the rejection with its way forward, or the loading line */}
			<InviteNotice
				isInviteAcceptFailed={isInviteAcceptFailed}
				inviteRejection={inviteRejection}
				onRetry={acceptInvite}
			/>
		</div>
	)
}

/**
 * The join page's notice: a failed request with its retry, an invite rejection with its way forward, or the loading
 * line while the acceptance runs.
 */
export function InviteNotice({
	isInviteAcceptFailed,
	inviteRejection,
	onRetry,
}: {
	isInviteAcceptFailed: boolean
	inviteRejection: InviteRejection | "teamFull" | null
	onRetry: () => void
}) {
	// a failed request is retried from here, and never reads as a rejected invitation
	if (isInviteAcceptFailed) {
		return (
			<div className="text-center">
				<p className="text-lg font-semibold">{"Carl couldn't check your invitation."}</p>
				<p className="text-muted-foreground mt-2 text-sm">
					{"Check your connection, then "}
					<button type="button" onClick={onRetry} className="text-link hover:underline">
						try again
					</button>
				</p>
			</div>
		)
	}
	if (!inviteRejection) {
		return <p className="text-muted-foreground text-center text-sm">Carl is checking your invitation…</p>
	}
	return (
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
	)
}
