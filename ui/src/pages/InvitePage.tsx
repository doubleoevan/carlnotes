import type { InviteRefusal } from "@shared/contracts"
import { useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { sendAcceptInvite } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TurnstileWidget } from "@/components/session/TurnstileWidget"
import { usePageTitle } from "@/hooks/usePageTitle"
import { INVITE_REFUSALS } from "./inviteRefusals"

/**
 * The page an invite link opens. A signed-out visitor is sent to log in and comes back here,
 * and a signed-in user accepts the token and opens the topic or team that sent the invite.
 */
export function InvitePage() {
	usePageTitle("Invitation")
	const { token } = useParams()
	const navigate = useNavigate()
	const { data: session, isPending } = authClient.useSession()
	const [inviteRefusal, setInviteRefusal] = useState<InviteRefusal | null>(null)

	// accept the invite once the bot check passes, then go to the topic or team for the invitation
	const handleVerify = async (turnstileToken: string): Promise<void> => {
		const inviteResponse = await sendAcceptInvite(token ?? "", turnstileToken)
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
		setInviteRefusal(inviteResponse.status)
	}

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
			{/* the invite refusal, or the bot check that stands between the visitor and the topic */}
			{inviteRefusal ? (
				<div className="text-center">
					<p className="text-lg font-semibold">{INVITE_REFUSALS[inviteRefusal]}</p>
					<p className="text-muted-foreground mt-2 text-sm">
						{"Ask whoever invited you for a fresh link, or "}
						<AnchorLink href="/" className="text-link hover:underline">
							go find a topic
						</AnchorLink>
					</p>
				</div>
			) : (
				<>
					<p className="text-muted-foreground text-center text-sm">Carl is checking your invitation…</p>
					<TurnstileWidget onVerify={(turnstileToken) => void handleVerify(turnstileToken)} />
				</>
			)}
		</div>
	)
}
