// the line under a user's or a team's avatar that is shown to its uploader alone until its image moderation can run,
// shared by both apps. the platform supplies the line of text
import type { ComponentType } from "react"
import { UNCHECKED_AVATAR_TEXT } from "../lib/uncheckedImageCopy"

// each app's element: the line of small muted text under the avatar
export type UncheckedAvatarLineElements = { Line: ComponentType<{ children: string }> }

/**
 * Tells the uploader of an unchecked avatar that only they can see the photo until Carl finishes checking it.
 */
export function UncheckedAvatarLine({ elements: { Line } }: { elements: UncheckedAvatarLineElements }) {
	return <Line>{UNCHECKED_AVATAR_TEXT}</Line>
}
