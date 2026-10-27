import { AVATAR_JPEG_QUALITY, MAX_AVATAR_PIXELS, TRANSPARENT_IMAGE_TYPES } from "@carlnotes/core/lib/avatarUpload"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { launchImageLibraryAsync } from "expo-image-picker"

/**
 * Lets a user choose a photo and re-encodes it at the web's avatar size without source metadata.
 */
export async function chooseAvatarBody(): Promise<FormData | null> {
	// the system picker grants access only to the chosen image
	const selection = await launchImageLibraryAsync({
		mediaTypes: ["images"],
		allowsMultipleSelection: false,
		quality: 1,
	})
	const asset = selection.assets?.[0]
	if (selection.canceled || !asset) {
		return null
	}

	// preserve transparency and keep the same longest edge as the web uploader
	const hasTransparency = TRANSPARENT_IMAGE_TYPES.has(asset.mimeType ?? "")
	const scale = Math.min(1, MAX_AVATAR_PIXELS / Math.max(asset.width, asset.height))
	const context = ImageManipulator.manipulate(asset.uri)
	context.resize({
		width: Math.max(1, Math.round(asset.width * scale)),
		height: Math.max(1, Math.round(asset.height * scale)),
	})
	const image = await context.renderAsync()
	const savedImage = await image.saveAsync({
		format: hasTransparency ? SaveFormat.PNG : SaveFormat.JPEG,
		compress: AVATAR_JPEG_QUALITY,
	})
	const body = new FormData()
	// React Native's multipart transport accepts a local file descriptor instead of a browser File
	body.append("avatar", {
		uri: savedImage.uri,
		name: hasTransparency ? "avatar.png" : "avatar.jpg",
		type: hasTransparency ? "image/png" : "image/jpeg",
	} as unknown as Blob)
	return body
}
