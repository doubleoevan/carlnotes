import {
	UncheckedAvatarLine as SharedUncheckedAvatarLine,
	type UncheckedAvatarLineElements,
} from "@carlnotes/core/components/UncheckedAvatarLine"

// the web's element: small muted text in a box at least 5rem wide. the text takes its box's width and adds none of its
// own, so it wraps under the avatar and the avatar's box keeps its size
const UNCHECKED_AVATAR_LINE_ELEMENTS: UncheckedAvatarLineElements = {
	Line: ({ children }) => (
		<div className="mt-1 min-w-20">
			<p className="text-muted-foreground w-0 min-w-full text-xs">{children}</p>
		</div>
	),
}

/**
 * The line under an avatar that only its uploader sees until Carl finishes checking it, on the web.
 */
export function UncheckedAvatarLine() {
	return <SharedUncheckedAvatarLine elements={UNCHECKED_AVATAR_LINE_ELEMENTS} />
}
