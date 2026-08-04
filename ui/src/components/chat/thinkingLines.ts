// the lines the chat shows while a reply is on its way. each one has to finish the sentence "Carl is ___"
import { shuffle } from "@/lib/utils"

export const THINKING_LINES = [
	"consulting the raccoon",
	"grinding beans",
	"reading the footnotes to the footnotes",
	"having epiphanies",
	"pontificating",
	"philosophizing",
	"chasing down a hunch",
	"crafting a masterpiece",
	"making coffee art",
	"sipping an macchiato",
	"asking if you can handle the truth",
	"taking a peek behind the curtain",
	"pulling loose threads",
	"connecting the dots",
	"following the money",
	"reading the note he left for future Carl",
	"cross-examining the raccoon",
	"reopening cold cases",
	"asking for his lawyer",
	"squinting at the fine print",
	"licking a finger and testing the wind",
	"building suspense",
	"reading between the lines",
	"seeing how deep the rabbit hole goes",
	"doing the math",
	"dusting for fingerprints",
	"consulting the coffee grounds",
	"on a journey",
	"ignoring the raccoon's legal advice",
	"in the eye of the hurricane",
	"making it weird",
	"bending the spacetime continuum",
	"circling the truth",
	"becoming one with the singularity",
	"locked in",
	"gettin busy",
	"in the zone",
	"in a situationship with the truth",
	"taking a victory lap",
	"feeling his oats",
	"raising an eyebrow",
	"leaving no stone unturned",
	"taking the scenic route",
	"percolating",
	"crunching numbers",
	"forming a hypothesis",
	"testing a theory",
	"following a lead",
	"cracking the code",
	"reinventing the wheel",
	"drawing conclusions",
	"designing an approach",
	"not to be outdone",
	"synergizing",
	"thinking outside of the box",
]

// what is left of the current shuffle, refilled once the last line is dealt
let undealtLines: string[] = []

/**
 * One thinking line, dealt from a shuffled array so that every line shows once before any repeat.
 */
export function randomThinkingLine(): string {
	if (undealtLines.length === 0) {
		undealtLines = shuffle(THINKING_LINES)
	}
	return undealtLines.pop() ?? "thinking"
}
