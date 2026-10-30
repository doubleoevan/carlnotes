// the one picker menu every file action opens: Files, and the photo library and the camera where images are taken

import { toPickerMimeTypes } from "@carlnotes/contracts/attachmentTypes"
import { toCurrentChatAccountGuard } from "@carlnotes/core/stores/chatConversationStore"
import { getDocumentAsync } from "expo-document-picker"
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from "expo-image-picker"
import { Camera, FolderOpen, ImageIcon, type LucideIcon } from "lucide-react-native"
import { type ComponentRef, type ReactNode, type RefObject, useRef, useState } from "react"
import { Alert, Linking, type View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { type PickedFile, toAcceptedMedia, toPickedDocument, toPickedImage } from "@/pickedFiles"
import { deletePickedFile, toMeasuredPickedFile } from "./pickedFileCache"
import { Sheet } from "./Sheet"

// where a picked file comes from
type PickedFileOrigin = "files" | "library" | "camera"

// what a file action takes, and what it does with the files picked
type FilePickerOptions = {
	accept: string[]
	isMultiple?: boolean
	// the most photos the library lets the user select at once, unlimited if unset
	maxPhotos?: number
	onPicked: (pickedFiles: PickedFile[]) => void | Promise<void>
}

// the menu's choices, in the order the phone browser's file input lists them
const PICKER_CHOICES: { origin: PickedFileOrigin; label: string; icon: LucideIcon }[] = [
	{ origin: "library", label: "Photo library", icon: ImageIcon },
	{ origin: "camera", label: "Take photo", icon: Camera },
	{ origin: "files", label: "Files", icon: FolderOpen },
]

/**
 * Opens the picker for a file action: a menu of Files, Photo library, and Take photo when the action takes images,
 * and Files alone when it does not. A pick that returns after the account changed is dropped and its copies deleted.
 */
export function useFilePicker({ accept, isMultiple = false, maxPhotos, onPicked }: FilePickerOptions): {
	openFilePicker: () => void
	filePickerMenu: ReactNode
	isPicking: boolean
	triggerRef: RefObject<ComponentRef<typeof View> | null>
} {
	// the menu's open state, the control that opened it for focus to return to, and whether a pick is on its way
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isPicking, setIsPicking] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const { isImageAccepted, isVideoAccepted } = toAcceptedMedia(accept)

	// run one origin's picker, passing on the files only while the same account is signed in
	async function pickFrom(origin: PickedFileOrigin): Promise<void> {
		setIsMenuOpen(false)
		const isSameAccount = toCurrentChatAccountGuard()
		setIsPicking(true)
		try {
			const pickedFiles = (await toPickedFiles({ origin, accept, isMultiple, maxPhotos, isVideoAccepted })).map(
				toMeasuredPickedFile,
			)
			if (!isSameAccount()) {
				for (const pickedFile of pickedFiles) {
					deletePickedFile(pickedFile)
				}
				return
			}
			if (pickedFiles.length > 0) {
				await onPicked(pickedFiles)
			}
		} finally {
			setIsPicking(false)
		}
	}

	// an action that takes no images goes straight to Files
	const openFilePicker = (): void => {
		if (isImageAccepted) {
			setIsMenuOpen(true)
			return
		}
		void pickFrom("files")
	}
	const filePickerMenu = isMenuOpen ? (
		<FilePickerMenu triggerRef={triggerRef} onChoose={pickFrom} onClose={() => setIsMenuOpen(false)} />
	) : null
	return { openFilePicker, filePickerMenu, isPicking, triggerRef }
}

/**
 * The sheet that lists where a file can come from.
 */
export function FilePickerMenu({
	triggerRef,
	onChoose,
	onClose,
}: {
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
	onChoose: (origin: PickedFileOrigin) => void
	onClose: () => void
}) {
	return (
		<Sheet title="Add a file" triggerRef={triggerRef} onClose={onClose}>
			{PICKER_CHOICES.map((choice) => (
				<Button
					key={choice.origin}
					variant="ghost"
					className="min-h-12 justify-start gap-3 px-2 py-3"
					accessibilityLabel={choice.label}
					onPress={() => onChoose(choice.origin)}
				>
					<Icon as={choice.icon} className="size-5 text-foreground" />
					<Text className="text-base text-foreground">{choice.label}</Text>
				</Button>
			))}
		</Sheet>
	)
}

// the files one origin returns, empty if the user cancels or denies the camera
async function toPickedFiles({
	origin,
	accept,
	isMultiple,
	maxPhotos,
	isVideoAccepted,
}: {
	origin: PickedFileOrigin
	accept: string[]
	isMultiple: boolean
	maxPhotos?: number
	isVideoAccepted: boolean
}): Promise<PickedFile[]> {
	// Files needs no permission, and copies each file into the cache the upload reads from
	if (origin === "files") {
		const selection = await getDocumentAsync({
			type: toPickerMimeTypes(accept),
			multiple: isMultiple,
			copyToCacheDirectory: true,
		})
		return selection.canceled ? [] : selection.assets.map(toPickedDocument)
	}

	// the system photo picker grants access to the picked photos alone, so the library asks for nothing
	if (origin === "library") {
		const selection = await launchImageLibraryAsync({
			mediaTypes: isVideoAccepted ? ["images", "videos"] : ["images"],
			allowsMultipleSelection: isMultiple,
			selectionLimit: maxPhotos,
			quality: 1,
			exif: false,
		})
		return selection.canceled ? [] : selection.assets.map(toPickedImage)
	}

	// the camera asks for access only now, and takes a photo alone
	const permission = await requestCameraPermissionsAsync()
	if (!permission.granted) {
		showCameraOffNotice()
		return []
	}
	const capture = await launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false })
	return capture.canceled ? [] : capture.assets.map(toPickedImage)
}

/**
 * Shows the notice a denied camera opens, with the way back to the setting.
 */
export function showCameraOffNotice(): void {
	Alert.alert("Camera is off", "CarlNotes can't use the camera. Turn it on in Settings to take a photo.", [
		{ text: "Cancel", style: "cancel" },
		{ text: "Open Settings", onPress: () => void Linking.openSettings() },
	])
}
