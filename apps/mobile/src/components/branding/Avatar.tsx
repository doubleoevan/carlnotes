import { toApiUrl } from "@carlnotes/client/apiClient"
import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@carlnotes/contracts/avatars"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { useRecyclingState } from "@shopify/flash-list"
import { Image } from "expo-image"
import { Text, View } from "react-native"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// shared identity artwork for bylines and Settings
type AvatarProps = { imageUrl: string | null; ownerId: string; name: string; size?: number }

/**
 * Shows an identity's stored image or the web's initials and tint.
 */
export function Avatar({ imageUrl, ownerId, name, size = 24 }: AvatarProps) {
	// reset a failed image when a recycled row receives another identity
	const [hasImageError, setHasImageError] = useRecyclingState(false, [ownerId, imageUrl])
	const avatarSize = useFontScaledSize(size)
	return (
		<View
			accessible={false}
			className="overflow-hidden rounded-full border border-border shadow-raised"
			style={{ width: avatarSize, height: avatarSize, backgroundColor: toAvatarTint(ownerId) }}
		>
			{imageUrl && !hasImageError ? (
				<Image
					source={{ uri: toApiUrl(imageUrl) }}
					recyclingKey={`${ownerId}:${imageUrl}`}
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
}
