import { fetchTopicAttachment } from "@carlnotes/client/topicClient"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { File, Paths } from "expo-file-system"
import { Download, ExternalLink } from "lucide-react-native"
import { useEffect, useRef } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
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
	// keep files available while the system preview is open, then remove them with the parent view
	const isMounted = useRef(true)
	const downloadedFiles = useRef<File[]>([])
	const mutation = usePageMutation()
	useEffect(() => {
		isMounted.current = true
		return () => {
			isMounted.current = false
			for (const file of downloadedFiles.current.splice(0)) {
				if (file.exists) {
					file.delete()
				}
			}
		}
	}, [])

	// leave pending files and non-owner downloads as status text
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

	// download before opening Quick Look. private files never depend on the browser's separate session
	async function handleOpen(): Promise<void> {
		const bytes = await fetchTopicAttachment(attachment.id)
		if (!isMounted.current) {
			return
		}

		// write the downloaded attachment to a tracked preview file
		const filename = attachment.filename.replace(/[/\\]/g, "_")
		const file = new File(Paths.cache, `carlnotes-${attachment.id}-${Date.now()}-${filename}`)
		downloadedFiles.current.push(file)
		file.writeSync(bytes)
		await file.preview({ title: attachment.filename })
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
