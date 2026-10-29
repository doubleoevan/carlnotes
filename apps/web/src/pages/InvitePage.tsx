import { authClient } from "@carlnotes/client/authClient"
import { sendAcceptInvite } from "@carlnotes/client/topicClient"
import { type InviteNoticeRejection, isInviteToken } from "@carlnotes/contracts/invites"
import { toInvitePath } from "@carlnotes/contracts/seo"
import {
	INVITE_CHECK_FAILED_TEXT,
	INVITE_CHECK_RETRY_ACTION,
	INVITE_CHECK_RETRY_LEAD,
	INVITE_CHECKING_TEXT,
	INVITE_REJECTED_FOLLOW_UP_ACTION,
	INVITE_REJECTED_FOLLOW_UP_LEAD,
	INVITE_REJECTIONS,
	INVITE_TEAM_FULL_FOLLOW_UP,
	type InviteNoticeProps,
	toInviteDestination,
} from "@carlnotes/core/lib/inviteRejections"
import { cn } from "@carlnotes/nightshift/classNames"
import { getRouteApi, Navigate, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { usePageTitle } from "@/hooks/usePageTitle"
import { SESSION_PAGE_CLASS } from "@/lib/styleClasses"

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
	const { data: session, isPending } = authClient().useSession()
	const [inviteRejection, setInviteRejection] = useState<InviteNoticeRejection | null>(null)
	// whether the acceptance request failed to reach the api, which a retry may pass
	const [isInviteAcceptFailed, setIsInviteAcceptFailed] = useState(false)

	// accept the token once, then go to the topic or team it opens. a failed request opens the once-latch back up, and
	// a token outside the token alphabet is rejected without a request
	const isAcceptingInviteRef = useRef(false)
	const acceptInvite = useCallback((): void => {
		if (isAcceptingInviteRef.current) {
			return
		}
		isAcceptingInviteRef.current = true
		setIsInviteAcceptFailed(false)
		if (!isInviteToken(token)) {
			setInviteRejection("unknown")
			return
		}
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
				// navigate to the accepted topic or team, or show the rejection
				const inviteDestination = toInviteDestination(inviteResponse)
				if (inviteDestination.kind === "topic") {
					navigate({ to: "/topics/$topicId", params: { topicId: inviteDestination.topicId }, replace: true })
				} else if (inviteDestination.kind === "team") {
					navigate({ to: "/teams/$teamId", params: { teamId: inviteDestination.teamId }, replace: true })
				} else {
					setInviteRejection(inviteDestination.rejection)
				}
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
export function InviteNotice({ isInviteAcceptFailed, inviteRejection, onRetry }: InviteNoticeProps) {
	// a failed request is retried from here, and never reads as a rejected invitation
	if (isInviteAcceptFailed) {
		return (
			<div className="text-center">
				<p className="text-lg font-semibold">{INVITE_CHECK_FAILED_TEXT}</p>
				<p className="text-muted-foreground mt-2 text-sm">
					{INVITE_CHECK_RETRY_LEAD}
					<button type="button" onClick={onRetry} className="sentence-link">
						{INVITE_CHECK_RETRY_ACTION}
					</button>
				</p>
			</div>
		)
	}
	if (!inviteRejection) {
		return <p className="text-muted-foreground text-center text-sm">{INVITE_CHECKING_TEXT}</p>
	}
	return (
		<div className="text-center">
			<p className="text-lg font-semibold">{INVITE_REJECTIONS[inviteRejection]}</p>
			<p className="text-muted-foreground mt-2 text-sm">
				{inviteRejection === "teamFull" ? (
					INVITE_TEAM_FULL_FOLLOW_UP
				) : (
					<>
						{INVITE_REJECTED_FOLLOW_UP_LEAD}
						<AnchorLink href="/" className="sentence-link">
							{INVITE_REJECTED_FOLLOW_UP_ACTION}
						</AnchorLink>
					</>
				)}
			</p>
		</div>
	)
}
