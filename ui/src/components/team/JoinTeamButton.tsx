import { Minus, Plus } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { sendDeleteJoinRequest, sendJoinRequest } from "@/clients/teamClient"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"

/**
 * The Join Team button a non-member sees: a plus asks, a minus takes the request back, and a logged-out visitor goes to sign-up instead.
 */
export function JoinTeamButton({
	teamId,
	teamName,
	hasJoinRequest,
	onChangeRequest,
	isSignedIn,
	className,
}: {
	teamId: string
	teamName: string
	hasJoinRequest: boolean
	onChangeRequest: () => void
	isSignedIn: boolean
	className?: string
}) {
	const navigate = useNavigate()
	// update the join button state on change
	const [isJoinRequested, setIsJoinRequested] = useState(hasJoinRequest)

	// a logged-out visitor is sent to sign up. a signed-in user toggles their join request
	const handleChangeRequest = async (): Promise<void> => {
		if (!isSignedIn) {
			navigate("/signup?cta=team-join")
			return
		}
		if (isJoinRequested) {
			await sendDeleteJoinRequest(teamId)
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
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button onClick={() => void handleChangeRequest()} className={cn("shrink-0", className)}>
					{isJoinRequested ? <Minus className="size-4" /> : <Plus className="size-4" />}
					Join Team
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{!isSignedIn ? "Sign up to join " : isJoinRequested ? "Delete request to join " : "Ask to join "}
				<span className="font-semibold">{teamName}</span>
			</TooltipContent>
		</Tooltip>
	)
}
