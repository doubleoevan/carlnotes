import { toChatAttachmentUrl } from "@carlnotes/client/chatClient"
import { CHAT_ATTACHMENT_ACCEPT } from "@carlnotes/contracts/attachmentTypes"
import { CHAT_MAX_ATTACHMENTS, type KeptChatAttachment } from "@carlnotes/contracts/chat"
import { toAgeLabel } from "@carlnotes/core/lib/labels"
import { FileText, FileX2, Film, ImageIcon, Paperclip, X } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { useFilePicker } from "@/components/common/FilePickerMenu"
import { Sheet } from "@/components/common/Sheet"
import { useDownloadedFilePreview } from "@/components/common/useDownloadedFilePreview"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import type { PickedFile } from "@/pickedFiles"

/**
 * The paperclip that opens the picker for chat files and photos.
 */
export function ChatAttachButton({
	isDisabled = false,
	attachmentCount = 0,
	onPicked,
}: {
	isDisabled?: boolean
	// the files already waiting, so the library selects no more than a question takes
	attachmentCount?: number
	onPicked: (pickedFiles: PickedFile[]) => Promise<unknown>
}) {
	const { openFilePicker, filePickerMenu, isPicking, triggerRef } = useFilePicker({
		accept: CHAT_ATTACHMENT_ACCEPT,
		isMultiple: true,
		maxPhotos: Math.max(1, CHAT_MAX_ATTACHMENTS - attachmentCount),
		onPicked: async (pickedFiles) => {
			await onPicked(pickedFiles)
		},
	})
	return (
		<>
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon"
				accessibilityLabel="Add files or photos"
				disabled={isDisabled || isPicking}
				onPress={openFilePicker}
			>
				<Icon as={Paperclip} className="size-4 text-muted-foreground" />
			</Button>
			{filePickerMenu}
		</>
	)
}

/**
 * The file-x that lists the files this topic chat keeps, each one opening in the system preview or deleted to free a
 * slot under the keep limit.
 */
export function KeptAttachmentsButton({
	keptAttachments,
	onRemoveKeptAttachment,
}: {
	keptAttachments: KeptChatAttachment[]
	onRemoveKeptAttachment: (keptAttachmentId: string) => Promise<void>
}) {
	// the sheet's open state and the control focus returns to
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<>
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon"
				accessibilityLabel="Clear files or photos"
				onPress={() => setIsOpen(true)}
			>
				<Icon as={FileX2} className="size-4 text-muted-foreground" />
			</Button>
			{isOpen && (
				<Sheet title="Chat files" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<KeptAttachmentList keptAttachments={keptAttachments} onRemoveKeptAttachment={onRemoveKeptAttachment} />
				</Sheet>
			)}
		</>
	)
}

/**
 * The kept files as rows: the kind, the name that opens the file, its age, and the delete.
 */
export function KeptAttachmentList({
	keptAttachments,
	onRemoveKeptAttachment,
}: {
	keptAttachments: KeptChatAttachment[]
	onRemoveKeptAttachment: (keptAttachmentId: string) => Promise<void>
}) {
	// a download opens in the system preview, and its copy is deleted with the list
	const previewDownloadedFile = useDownloadedFilePreview()
	const mutation = usePageMutation()
	return (
		<View className="gap-1">
			{keptAttachments.map((keptAttachment) => (
				<View key={keptAttachment.id} className="min-h-11 flex-row items-center gap-2">
					<Icon
						as={keptAttachment.kind === "image" ? ImageIcon : keptAttachment.kind === "video" ? Film : FileText}
						className="size-3.5 text-muted-foreground"
					/>
					{/* the file download */}
					<Button
						variant="link"
						className="min-w-0 flex-1 justify-start px-0"
						accessibilityLabel={`Download ${keptAttachment.name}`}
						disabled={mutation.isPending}
						onPress={() =>
							void mutation.run(() =>
								previewDownloadedFile({
									path: toChatAttachmentUrl(keptAttachment.id),
									filename: keptAttachment.name,
								}),
							)
						}
					>
						<Text className="text-sm text-link" numberOfLines={1}>
							{keptAttachment.name}
						</Text>
					</Button>
					{/* the name truncates before its age does */}
					<Text className="text-xs text-muted-foreground">{toAgeLabel(keptAttachment.at)}</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Delete ${keptAttachment.name}`}
						hitSlop={toTouchTargetHitSlop(36)}
						className="size-9 items-center justify-center"
						onPress={() => void onRemoveKeptAttachment(keptAttachment.id)}
					>
						<Icon as={X} className="size-3.5 text-muted-foreground" />
					</Pressable>
				</View>
			))}
			{/* a download that failed */}
			{mutation.error && (
				<Text accessibilityRole="alert" className="text-xs text-destructive">
					{mutation.error}
				</Text>
			)}
		</View>
	)
}
