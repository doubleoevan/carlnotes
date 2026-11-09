import { appendNativeFilePart } from "@carlnotes/client/apiClient"
import {
	type PickedTopicImage,
	TopicImageEditor as SharedTopicImageEditor,
	type TopicImageEditorButtonKind,
	type TopicImageEditorElements,
	type TopicImageEditorProps,
} from "@carlnotes/core/components/TopicImageEditor"
import { toCurrentChatAccountGuard } from "@carlnotes/core/stores/chatConversationStore"
import { Camera, ImageUp, type LucideIcon, RefreshCw, X } from "lucide-react-native"
import { type RefObject, useEffect, useRef } from "react"
import { Pressable, View } from "react-native"
import { useFilePicker } from "@/components/common/FilePickerMenu"
import { deletePickedFile, toReadablePickedFile } from "@/components/common/pickedFileCache"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicImage } from "@/components/primitives/topic-image"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { type PickedFile, toPreparedPickedFiles } from "@/pickedFiles"

// what the picker menu offers: every image, which the resizer re-encodes to a jpeg or a png before the upload check
const TOPIC_IMAGE_ACCEPT = ["image/*"]

// each button's icon
const BUTTON_ICONS: Record<TopicImageEditorButtonKind, LucideIcon> = {
	regenerate: RefreshCw,
	upload: ImageUp,
	remove: X,
}

// the native elements: the image at full width, as the web draws it, above a column of controls
const ELEMENTS: TopicImageEditorElements = {
	Layout: ({ image, children }) => (
		<View className="gap-3">
			{image}
			<View className="min-w-0 gap-2">{children}</View>
		</View>
	),
	PromptRow: ({ children }) => <View className="gap-2">{children}</View>,
	Actions: ({ end, children }) => (
		<View className="flex-row flex-wrap items-center gap-2">
			{children}
			<View className="ml-auto">{end}</View>
		</View>
	),
	Line: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	// the image is the upload button. a phone has no hover, so the camera shows in the corner at all times, and a render
	// under way pulses the empty frame
	Image: ({ uploadLabel, isRendering, isDisabled, onUpload, ...topicImageProps }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={uploadLabel}
			disabled={isDisabled}
			onPress={onUpload}
			className="w-full"
		>
			{isRendering ? (
				<SkeletonPulse>
					<TopicImage {...topicImageProps} className="w-full" />
				</SkeletonPulse>
			) : (
				<TopicImage {...topicImageProps} className="w-full" />
			)}
			<View className="absolute right-2 bottom-2 size-9 items-center justify-center rounded-full bg-black/55">
				<Icon as={Camera} className="size-5 text-white" />
			</View>
		</Pressable>
	),
	PromptInput: ({ label, value, placeholder, maxLength, isDisabled, onChange }) => (
		<SessionTextInput
			label={label}
			isLabelVisible={false}
			accessibilityLabel={label}
			placeholder={placeholder}
			maxLength={maxLength}
			editable={!isDisabled}
			value={value}
			onChangeText={onChange}
		/>
	),
	Button: ({ label, kind, isDisabled, onPress }) => (
		<Button variant="outline" size="sm" accessibilityLabel={label} disabled={isDisabled} onPress={onPress}>
			<Icon as={BUTTON_ICONS[kind]} className="size-4" />
			<Text>{label}</Text>
		</Button>
	),
}

/**
 * The editor's image block on a phone. The image and Upload open the picker menu of Photo library, Take photo, and
 * Files. The picked image is re-encoded without its metadata, and its copy is deleted once the upload lands, when
 * another pick replaces it, or when the block closes.
 */
export function TopicImageEditor({ onImageChanged, ...props }: TopicImageEditorProps) {
	// the pick the shared editor awaits, and the re-encoded copy until its upload lands
	const resolvePickRef = useRef<((pickedImage: PickedTopicImage | null) => void) | null>(null)
	const pickedFileRef = useRef<PickedFile | null>(null)
	useEffect(() => () => deletePickedCopy(pickedFileRef), [])

	// the picker menu, which re-encodes the picked image for the account that picked it and resolves the pick with it
	const { openFilePicker, filePickerMenu, isPicking } = useFilePicker({
		accept: TOPIC_IMAGE_ACCEPT,
		onPicked: async (pickedFiles) => {
			const [imageFile] = await toPreparedPickedFiles({
				pickedFiles,
				prepare: (pickedFile) => toReadablePickedFile(pickedFile),
				isSameAccount: toCurrentChatAccountGuard(),
				deleteFile: deletePickedFile,
			})
			deletePickedCopy(pickedFileRef)
			pickedFileRef.current = imageFile ?? null
			resolvePickRef.current?.(imageFile ? toPickedTopicImage(imageFile) : null)
			resolvePickRef.current = null
		},
	})

	// a menu closed with nothing picked, or a pick that returned no file, resolves the pick as nothing
	const isMenuOpen = filePickerMenu !== null
	useEffect(() => {
		if (!isMenuOpen && !isPicking && resolvePickRef.current) {
			resolvePickRef.current(null)
			resolvePickRef.current = null
		}
	}, [isMenuOpen, isPicking])

	// open the menu, and resolve once the user picks an image or closes the menu
	const pickImage = (): Promise<PickedTopicImage | null> =>
		new Promise((resolve) => {
			resolvePickRef.current = resolve
			openFilePicker()
		})

	// the uploaded copy is no longer needed once the change lands
	const handleImageChanged = (): void => {
		deletePickedCopy(pickedFileRef)
		onImageChanged?.()
	}
	return (
		<>
			<SharedTopicImageEditor
				{...props}
				elements={ELEMENTS}
				pickImage={pickImage}
				onImageChanged={handleImageChanged}
			/>
			{filePickerMenu}
		</>
	)
}

// delete the copy the block holds, if it holds one
function deletePickedCopy(pickedFileRef: RefObject<PickedFile | null>): void {
	if (pickedFileRef.current) {
		deletePickedFile(pickedFileRef.current)
		pickedFileRef.current = null
	}
}

// a re-encoded image as the multipart body with the file as its image field, with its size and type for the check
// before the upload
function toPickedTopicImage(imageFile: PickedFile): PickedTopicImage {
	const body = new FormData()
	appendNativeFilePart(body, "image", { uri: imageFile.uri, name: imageFile.name, type: imageFile.mimeType })
	return { body, size: imageFile.byteSize, type: imageFile.mimeType }
}
