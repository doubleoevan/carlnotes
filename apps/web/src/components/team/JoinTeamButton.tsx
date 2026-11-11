import { sendDeleteJoinRequest, sendJoinRequest } from "@carlnotes/client/teamClient"
import { useNavigate } from "@tanstack/react-router"
import { Minus, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import {
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
} from "@/lib/styleClasses"

/**
 * The Join Team button a non-member sees: a plus asks, a minus takes the request back, and a logged-out visitor goes to sign-up instead.
 */
export function JoinTeamButton({
	teamId,
	teamName,
	hasJoinRequest,
	onChangeRequest,
	isSignedIn,
	isHighlighted = true,
}: {
	teamId: string
	teamName: string
	hasJoinRequest: boolean
	onChangeRequest: () => void
	isSignedIn: boolean
	// whether this button is the page's one call to action
	isHighlighted?: boolean
}) {
	const navigate = useNavigate()
	// update the join button state on change
	const [isJoinRequested, setIsJoinRequested] = useState(hasJoinRequest)

	// a logged-out visitor is sent to sign up. a signed-in user toggles their join request
	const handleChangeRequest = async (): Promise<void> => {
		if (!isSignedIn) {
			void navigate(toSignupNavigation("team-join"))
			return
		}
		if (isJoinRequested) {
			try {
				await sendDeleteJoinRequest(teamId)
			} catch {
				toast.error("Your join request couldn't be withdrawn. Try again.")
				return
			}
			setIsJoinRequested(false)
			toast("Join request deleted.")
			onChangeRequest()
			return
		}
		// a rejected join request shows a toast
		if (!(await sendJoinRequest(teamId))) {
			toast.error("That request didn't go through. Try again.")
			return
		}
		setIsJoinRequested(true)
		toast(`You've asked to join ${teamName}.\nA team leader can add you.`)
		onChangeRequest()
	}
	const JoinIcon = isJoinRequested ? Minus : Plus
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => void handleChangeRequest()}
					className={isHighlighted ? HIGHLIGHTED_PAGE_BUTTON_CLASS : PLAIN_PAGE_BUTTON_CLASS}
				>
					{/* the plain button's icon alone takes the highlight color */}
					<JoinIcon className={isHighlighted ? "size-4" : PLAIN_PAGE_BUTTON_ICON_CLASS} />
					Join Team
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{!isSignedIn ? "Sign up to join " : isJoinRequested ? "Delete request to join " : "Ask to join "}
				<span className="font-semibold">{teamName}</span>
			</TooltipContent>
		</Tooltip>
	)
}
