import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { Avatar } from "@/components/branding/Avatar"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { AnchorLink } from "./AnchorLink"

/**
 * Opens a user's native profile with the same avatar and username as the web byline.
 */
export function UserProfileLink({
	user,
	displayName = user.username,
}: {
	user: ProfileIdentity
	displayName?: string
}) {
	return (
		<AnchorLink
			href={`/profiles/${user.userId}`}
			accessibilityLabel={displayName}
			className="min-h-6 self-start flex-row items-center gap-2"
			hitSlop={toTouchTargetHitSlop(24)}
		>
			<Avatar
				ownerId={user.userId}
				name={user.username}
				imageUrl={user.avatarVersion ? toAvatarImagePath(user.userId, user.avatarVersion) : null}
			/>
			<Text className="shrink text-sm text-link">{displayName}</Text>
		</AnchorLink>
	)
}
