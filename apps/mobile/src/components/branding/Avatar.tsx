import { authClient } from "@carlnotes/client/authClient"
import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@carlnotes/contracts/avatars"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { useRecyclingState } from "@shopify/flash-list"
import { Image } from "expo-image"
import { memo } from "react"
import { Text, View } from "react-native"
import { toShownAvatarImagePath } from "@/apiImages"
import { useApiImageProps } from "@/hooks/useApiImageProps"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// shared identity artwork for bylines and Settings. isUnchecked says the image is an upload shown to the signed-in user
// alone, such as a leader's unchecked team avatar, which loads with the session and is never stored
type AvatarProps = { imageUrl: string | null; ownerId: string; name: string; size?: number; isUnchecked?: boolean }

/**
 * Shows an identity's stored image or the web's initials and tint. The signed-in user's own avatar is the upload
 * shown to them alone while the session names one, wherever the avatar is drawn.
 */
export function Avatar({ imageUrl, ownerId, name, size = 24, isUnchecked = false }: AvatarProps) {
	// the path to load, which is an unchecked upload's marked path for the signed-in user's own unchecked avatar and
	// for an avatar the caller says is unchecked. only a marked path loads with the session. the session is read here
	// alone, so a session change that leaves the path as it was draws no picture again
	const { data: session } = authClient().useSession()
	const imagePath = toShownAvatarImagePath({ imagePath: imageUrl, ownerId, isUnchecked, sessionUser: session?.user })
	return <AvatarPicture imagePath={imagePath} ownerId={ownerId} name={name} size={size} />
}

// an avatar's picture to draw: the path to load, or null for the initials, its owner, their name, and its size
type AvatarPictureProps = { imagePath: string | null; ownerId: string; name: string; size: number }

// the avatar's picture, drawn again only if its path, its owner, their name, or its size changes
const AvatarPicture = memo(function AvatarPicture({ imagePath, ownerId, name, size }: AvatarPictureProps) {
	const imageProps = useApiImageProps(imagePath)

	// reset a failed image when a recycled row receives another identity or another image
	const [hasImageError, setHasImageError] = useRecyclingState(false, [ownerId, imagePath])
	const avatarSize = useFontScaledSize(size)
	return (
		<View
			accessible={false}
			className="overflow-hidden rounded-full border border-border shadow-raised"
			style={{ width: avatarSize, height: avatarSize, backgroundColor: toAvatarTint(ownerId) }}
		>
			{imageProps && !hasImageError ? (
				<Image
					{...imageProps}
					recyclingKey={`${ownerId}:${imagePath}`}
					style={{ width: "100%", height: "100%" }}
					contentFit="cover"
					onError={() => setHasImageError(true)}
					accessible={false}
				/>
			) : (
				<View className="flex-1 items-center justify-center">
					<Text style={{ ...toTypeRoleStyle("caption"), fontFamily: fontFamilies.display.name, color: AVATAR_COLOR }}>
						{toAvatarInitials(name)}
					</Text>
				</View>
			)}
		</View>
	)
})

// the avatar in a profile's or a team's header, at the height of a topic's image on the Topics tab, in points
export const PAGE_AVATAR_SIZE = 80
