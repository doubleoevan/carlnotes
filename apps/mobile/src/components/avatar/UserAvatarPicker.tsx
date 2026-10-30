import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { useAvatar } from "@carlnotes/core/hooks/useAvatar"
import { AVATAR_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "@carlnotes/core/lib/avatarUpload"
import { Camera } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { chooseAvatarBody } from "./avatarUpload"

/**
 * Uses the system photo picker for the same immediate avatar upload as the web profile.
 */
export function UserAvatarPicker({ userId, username }: { userId: string; username: string }) {
	// retain a failed upload's feedback and refresh every avatar after success
	const { avatarVersion, uploadAvatarBody } = useAvatar()
	const [isCameraShown, setIsCameraShown] = useState(false)
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	async function handleChoose(): Promise<void> {
		if (isUploading) {
			return
		}
		setIsUploading(true)
		setError(null)
		try {
			const body = await chooseAvatarBody()
			if (!body) {
				return
			}
			const rejection = await uploadAvatarBody(body)
			if (rejection) {
				setError(toAvatarRejectionText(rejection, AVATAR_UPLOAD_FAILED_TEXT))
			}
		} catch {
			setError(AVATAR_UPLOAD_FAILED_TEXT)
		} finally {
			setIsUploading(false)
			setIsCameraShown(false)
		}
	}

	// replace the web's hover with a tap, then let a second tap open the system picker
	function handlePress(): void {
		if (isCameraShown) {
			void handleChoose()
		} else {
			setIsCameraShown(true)
		}
	}
	return (
		<View>
			{/* keep the camera on the photo without adding a separate control beside the name */}
			<Button
				variant="ghost"
				className="relative h-auto self-start rounded-full p-0"
				accessibilityLabel={isCameraShown ? "Choose a new avatar photo" : "Change your avatar"}
				accessibilityHint={isCameraShown ? "Opens your photo library" : "Shows the photo upload control"}
				accessibilityState={{ busy: isUploading }}
				disabled={isUploading}
				onPress={handlePress}
				onBlur={() => setIsCameraShown(false)}
			>
				<Avatar
					ownerId={userId}
					name={username}
					imageUrl={avatarVersion ? toAvatarImagePath(userId, avatarVersion) : null}
					size={56}
				/>
				{isCameraShown && (
					<View pointerEvents="none" className="absolute inset-0 items-center justify-center rounded-full bg-black/55">
						<Icon as={Camera} className="size-5 text-white" />
					</View>
				)}
			</Button>
			{error && (
				<Text accessibilityRole="alert" className="mt-1 text-xs text-destructive">
					{error}
				</Text>
			)}
		</View>
	)
}
