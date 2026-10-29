// the invitation screen, the web's invite page on the native stack: a visitor signs in and comes back, a user's token
// is accepted once, and the joined Topic or Team replaces the screen
import { authClient } from "@carlnotes/client/authClient"
import { sendAcceptInvite } from "@carlnotes/client/topicClient"
import { type InviteNoticeRejection, isInviteToken } from "@carlnotes/contracts/invites"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { toInviteDestination } from "@carlnotes/core/lib/inviteRejections"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { InviteNotice } from "@/components/invite/InviteNotice"
import { SessionScreen } from "@/components/session/SessionScreen"
import { openSessionScreen } from "@/sessionReturnPath"

export default function InviteScreen() {
	const { token } = useLocalSearchParams<{ token: string }>()
	const { data: session, isPending: isSessionPending } = authClient().useSession()
	// how the token was rejected, and whether the request itself failed and waits for a retry
	const [inviteRejection, setInviteRejection] = useState<InviteNoticeRejection | null>(null)
	const [isInviteAcceptFailed, setIsInviteAcceptFailed] = useState(false)
	// the token is accepted once per screen, however many times the session re-renders it
	const acceptedToken = useRef<string | null>(null)

	// accept the token, and open what it joined in place of this screen. a token outside the token alphabet is
	// rejected without a request
	const acceptInvite = useCallback(async (): Promise<void> => {
		setIsInviteAcceptFailed(false)
		if (!isInviteToken(token)) {
			setInviteRejection("unknown")
			return
		}
		try {
			const inviteDestination = toInviteDestination(await sendAcceptInvite(token))
			if (inviteDestination.kind === "topic") {
				router.replace(`/topics/${inviteDestination.topicId}`)
			} else if (inviteDestination.kind === "team") {
				router.replace(`/teams/${inviteDestination.teamId}`)
			} else {
				setInviteRejection(inviteDestination.rejection)
			}
		} catch (error) {
			console.error("invite accept failed", error)
			setIsInviteAcceptFailed(true)
		}
	}, [token])

	// a visitor signs in first and returns here. a user's token is accepted as soon as the session resolves
	useEffect(() => {
		if (isSessionPending || acceptedToken.current === token) {
			return
		}
		acceptedToken.current = token
		if (!session) {
			openSessionScreen({ screen: "/sign-in", returnPath: toInvitePath(token) })
			return
		}
		void acceptInvite()
	}, [isSessionPending, session, token, acceptInvite])

	// the loading cup until the session resolves, then the notice for the check, its failure, or the rejection
	if (isSessionPending) {
		return <CoffeeLoading />
	}
	return (
		<SessionScreen>
			<View className="py-6">
				<InviteNotice
					isInviteAcceptFailed={isInviteAcceptFailed}
					inviteRejection={inviteRejection}
					onRetry={() => void acceptInvite()}
				/>
			</View>
		</SessionScreen>
	)
}
