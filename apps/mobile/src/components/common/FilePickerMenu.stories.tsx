import { showClientError } from "@carlnotes/client/apiClient"
import { CHAT_ATTACHMENT_ACCEPT, TOPIC_ATTACHMENT_ACCEPT } from "@carlnotes/contracts/attachmentTypes"
import { UNREADABLE_IMAGE_TEXT } from "@carlnotes/core/lib/imageUpload"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import type { PickedFile } from "@/pickedFiles"
import { showCameraOffNotice, useFilePicker } from "./FilePickerMenu"
import { deletePickedFile } from "./pickedFileCache"

// the menu for chat files, topic files, and an action that takes documents alone, which skips the menu, and the
// notices a denied camera and an unreadable image show
const meta = {
	title: "Common/FilePickerMenu",
	component: FilePickerExample,
	parameters: { webReference: "the browser's file input on a phone: Photo Library, Take Photo, Choose File" },
} satisfies Meta<typeof FilePickerExample>
export default meta
type Story = StoryObj<typeof meta>
export const ChatFiles: Story = { args: { accept: CHAT_ATTACHMENT_ACCEPT } }
export const TopicFiles: Story = { args: { accept: TOPIC_ATTACHMENT_ACCEPT } }
export const DocumentsOnly: Story = { args: { accept: ["application/pdf", ".pdf"] } }
export const CameraOff: Story = { args: { accept: CHAT_ATTACHMENT_ACCEPT, notice: "cameraOff" } }
export const UnreadableImage: Story = { args: { accept: CHAT_ATTACHMENT_ACCEPT, notice: "unreadableImage" } }

// open the picker from a trigger and list what came back, deleting the copies a story has no use for
function FilePickerExample({ accept, notice }: { accept: string[]; notice?: "cameraOff" | "unreadableImage" }) {
	const [pickedNames, setPickedNames] = useState<string[]>([])
	const { openFilePicker, filePickerMenu, isPicking, triggerRef } = useFilePicker({
		accept,
		isMultiple: true,
		onPicked: (pickedFiles: PickedFile[]) => {
			setPickedNames(pickedFiles.map((pickedFile) => `${pickedFile.name} · ${pickedFile.mimeType}`))
			pickedFiles.forEach(deletePickedFile)
		},
	})
	return (
		<View className="gap-3">
			<Button ref={triggerRef} accessibilityLabel="Add files or photos" disabled={isPicking} onPress={openFilePicker}>
				<Text>Add files or photos</Text>
			</Button>
			{notice ? (
				<Button variant="outline" accessibilityLabel="Show the notice" onPress={() => showNotice(notice)}>
					<Text>Show the notice</Text>
				</Button>
			) : null}
			{pickedNames.map((pickedName) => (
				<Text key={pickedName} className="text-sm text-muted-foreground">
					{pickedName}
				</Text>
			))}
			{filePickerMenu}
		</View>
	)
}

// the notices a denied camera and an image that can't be read show
function showNotice(notice: "cameraOff" | "unreadableImage"): void {
	if (notice === "cameraOff") {
		showCameraOffNotice()
		return
	}
	showClientError(UNREADABLE_IMAGE_TEXT)
}
