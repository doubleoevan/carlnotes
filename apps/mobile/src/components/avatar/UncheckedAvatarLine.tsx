import {
	UncheckedAvatarLine as SharedUncheckedAvatarLine,
	type UncheckedAvatarLineElements,
} from "@carlnotes/core/components/UncheckedAvatarLine"
import { View } from "react-native"
import { PAGE_AVATAR_SIZE } from "@/components/branding/Avatar"
import { Text } from "@/components/primitives/text"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// the app's element: small muted text
export const UNCHECKED_AVATAR_LINE_ELEMENTS: UncheckedAvatarLineElements = {
	Line: ({ children }) => <Text className="text-xs text-muted-foreground">{children}</Text>,
}

/**
 * The line under an avatar that only its uploader sees until Carl finishes checking it, in the app. It wraps at the
 * avatar's width, and no narrower than a page header's avatar, so the avatar's box keeps its size.
 */
export function UncheckedAvatarLine({
	avatarSize,
}: {
	// the width and height of the avatar above the line, in points at the default text size
	avatarSize: number
}) {
	// the line's width, grown with the system text size as the avatar is
	const lineWidth = useFontScaledSize(Math.max(avatarSize, PAGE_AVATAR_SIZE))
	return (
		<View className="mt-1" style={{ width: lineWidth }}>
			<SharedUncheckedAvatarLine elements={UNCHECKED_AVATAR_LINE_ELEMENTS} />
		</View>
	)
}
