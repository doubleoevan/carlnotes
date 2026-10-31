import {
	type SpokenAnswerButtonOptions,
	toSpokenAnswerButtonLabel,
	useSpokenAnswerButton,
} from "@carlnotes/core/hooks/useSpokenAnswerButton"
import { LoaderCircle, Play, Square } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"

/**
 * The play button in a reply's footer, which speaks the reply from its start in the voice of the host who gave it and
 * becomes stop while it plays.
 */
export function SpokenAnswerButton(spokenAnswerButtonOptions: SpokenAnswerButtonOptions) {
	const { spokenAnswerState, toggleSpokenAnswer } = useSpokenAnswerButton(spokenAnswerButtonOptions)
	return (
		<IconButton
			tooltip={toSpokenAnswerButtonLabel(spokenAnswerState)}
			onClick={toggleSpokenAnswer}
			className="hover:text-foreground grid size-6 place-items-center rounded-md"
		>
			{spokenAnswerState === "idle" ? (
				<Play className="size-3.5" />
			) : spokenAnswerState === "loading" ? (
				<LoaderCircle className="size-3.5 animate-spin" />
			) : (
				<Square className="size-3 fill-current" />
			)}
		</IconButton>
	)
}
