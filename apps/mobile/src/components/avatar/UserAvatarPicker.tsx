import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { useAvatar } from "@carlnotes/core/hooks/useAvatar"
import { AVATAR_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "@carlnotes/core/lib/imageUpload"
import { Camera } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useAvatarPicker } from "./avatarUpload"
import { UncheckedAvatarLine } from "./UncheckedAvatarLine"

/**
 * Uses the picker menu for the same immediate avatar upload as the web profile. An upload that is shown to the user
 * alone shows with its line under it, unless the caller places the line. `isCameraInitiallyShown`, `initialError`,
 * and `isUncheckedLineShown` start it with the camera overlay, an upload error, or an unchecked photo's line showing.
 */
export function UserAvatarPicker({
	userId,
	username,
	size = 56,
	isCameraInitiallyShown = false,
	initialError = null,
	isUncheckedLineShown = false,
	hasUncheckedLine = true,
}: {
	userId: string
	username: string
	// the avatar's width and height in points
	size?: number
	isCameraInitiallyShown?: boolean
	initialError?: string | null
	isUncheckedLineShown?: boolean
	// whether the picker shows an unchecked upload's line under the avatar. false if the caller places the line
	hasUncheckedLine?: boolean
}) {
	// retain a failed upload's feedback and refresh every avatar after success
	const { avatarVersion, isAvatarUnchecked, uploadAvatarBody } = useAvatar()
	const [isCameraShown, setIsCameraShown] = useState(isCameraInitiallyShown)
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(initialError)
	const avatarPicker = useAvatarPicker({
		// upload the picked photo at once, keeping a rejection's words under the photo
		onPicked: async (body) => {
			setIsUploading(true)
			try {
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
		},
	})

	// replace the web's hover with a tap, then let a second tap open the picker menu
	function handlePress(): void {
		if (!isCameraShown) {
			setIsCameraShown(true)
			return
		}
		setError(null)
		avatarPicker.openFilePicker()
	}
	return (
		<View>
			{/* keep the camera on the photo without adding a separate control beside the name */}
			<Button
				ref={avatarPicker.triggerRef}
				variant="ghost"
				className="relative h-auto self-start rounded-full p-0"
				accessibilityLabel={isCameraShown ? "Choose a new avatar photo" : "Change your avatar"}
				accessibilityHint={
					isCameraShown ? "Opens the photo library, the camera, or Files" : "Shows the photo upload control"
				}
				accessibilityState={{ busy: isUploading || avatarPicker.isPicking }}
				disabled={isUploading || avatarPicker.isPicking}
				onPress={handlePress}
				onBlur={() => setIsCameraShown(false)}
			>
				<Avatar
					ownerId={userId}
					name={username}
					imageUrl={avatarVersion ? toAvatarImagePath(userId, avatarVersion) : null}
					size={size}
				/>
				{isCameraShown && (
					<View pointerEvents="none" className="absolute inset-0 items-center justify-center rounded-full bg-black/55">
						<Icon as={Camera} className="size-5 text-white" />
					</View>
				)}
			</Button>
			{avatarPicker.filePickerMenu}
			{/* the upload only the user sees until its check passes */}
			{hasUncheckedLine && (isAvatarUnchecked || isUncheckedLineShown) ? (
				<UncheckedAvatarLine avatarSize={size} />
			) : null}
			{error && (
				<Text accessibilityRole="alert" className="mt-1 text-xs text-destructive">
					{error}
				</Text>
			)}
		</View>
	)
}
