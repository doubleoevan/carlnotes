import type { TopicDetails } from "@carlnotes/contracts/topics"
import { Download, ExternalLink } from "lucide-react-native"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { useDownloadedFilePreview } from "@/components/common/useDownloadedFilePreview"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Opens attachment sources and previews owner downloads with the app's signed-in session.
 */
export function TopicAttachmentLink({
	attachment,
	isTopicOwner,
}: {
	attachment: TopicDetails["attachments"][number]
	isTopicOwner: boolean
}) {
	// open the owner's downloads in the system preview, and delete the copies with the parent view
	const previewDownloadedFile = useDownloadedFilePreview()
	const mutation = usePageMutation()

	// label a file by its source or name, with its processing state
	const suffix = attachment.status === "failed" ? " · failed" : attachment.status === "pending" ? " · processing" : ""
	const label = `${attachment.sourceUrl || attachment.filename}${suffix}`
	if (attachment.status !== "ready" || (!attachment.sourceUrl && !isTopicOwner)) {
		return <Text className="text-xs text-muted-foreground">{label}</Text>
	}
	if (attachment.sourceUrl) {
		return (
			<AnchorLink
				href={attachment.sourceUrl}
				accessibilityLabel={`Open ${label}`}
				className="min-h-11 flex-row items-center gap-1"
			>
				<Text className="shrink text-xs text-link">{label}</Text>
				<Icon as={ExternalLink} className="size-3 text-link" />
			</AnchorLink>
		)
	}

	// download through the signed-in session before opening Quick Look
	function handleOpen(): Promise<void> {
		return previewDownloadedFile({
			path: `/api/attachments/${encodeURIComponent(attachment.id)}/download`,
			filename: attachment.filename,
		})
	}
	return (
		<View className="shrink gap-1">
			<Button
				variant="link"
				className="justify-start px-0"
				accessibilityLabel={`Download ${label}`}
				disabled={mutation.isPending}
				onPress={() => void mutation.run(handleOpen)}
			>
				<Text className="shrink text-xs text-link">{mutation.isPending ? "Opening…" : label}</Text>
				<Icon as={Download} className="size-3 text-link" />
			</Button>
			{mutation.error && (
				<Text accessibilityRole="alert" className="text-xs text-destructive">
					{mutation.error}
				</Text>
			)}
		</View>
	)
}
