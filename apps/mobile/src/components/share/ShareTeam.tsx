import { sendCreateTeamInvite } from "@carlnotes/client/teamClient"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { useCopyFeedback } from "@carlnotes/core/hooks/useCopyFeedback"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { setStringAsync } from "expo-clipboard"
import { Link, Share as ShareIcon } from "lucide-react-native"
import { Share, View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { captureVisitEvent } from "@/visitAnalytics"
import { ShareTargets } from "./ShareTargets"

/**
 * Shares public team pages or membership invitation links with the web's visibility gates.
 */
export function ShareTeam({
	teamId,
	teamName,
	isPublic,
	canInvite,
	onClose,
}: {
	teamId: string
	teamName: string
	isPublic: boolean
	canInvite: boolean
	onClose: () => void
}) {
	const url = `${SITE_URL}/teams/${teamId}`
	const handleShare = (channel: string): void => captureVisitEvent("visit_share_clicked", { kind: "team", channel })
	const mutation = usePageMutation()
	const { copiedLabel, markCopied } = useCopyFeedback()
	return (
		<Sheet title="Share team" onClose={onClose}>
			<ShareTargets topic={{ name: teamName }} topicUrl={url} kind="post" isEnabled={isPublic} onShare={handleShare} />
			{!isPublic && <Text className="text-sm text-muted-foreground">This team must be public to post it.</Text>}
			<View className="my-2 border-t border-separator" />
			{canInvite && (
				<Button
					variant="ghost"
					className="justify-start"
					accessibilityLabel="Share invite link"
					disabled={mutation.isPending}
					onPress={() =>
						void mutation.run(async () => {
							handleShare("invite")
							const invite = await sendCreateTeamInvite(teamId, "share-sheet")
							if (invite === "limited") {
								throw new Error("Daily invite limit reached. It resets tomorrow.")
							}
							await Share.share({ message: `${SITE_URL}${toInvitePath(invite.token)}` })
						})
					}
				>
					<Icon as={ShareIcon} />
					<Text>Share invite link</Text>
				</Button>
			)}
			<Button
				variant="ghost"
				className="justify-start"
				accessibilityLabel="Share team"
				disabled={!isPublic}
				onPress={() => {
					handleShare("share-sheet")
					void mutation.run(() => Share.share({ message: url }))
				}}
			>
				<Icon as={ShareIcon} />
				<Text>Share…</Text>
			</Button>
			<ShareTargets topic={{ name: teamName }} topicUrl={url} kind="send" isEnabled={isPublic} onShare={handleShare} />
			<View className="my-2 border-t border-separator" />
			<Button
				variant="ghost"
				className="justify-start"
				accessibilityLabel="Copy page link"
				onPress={() =>
					void mutation.run(async () => {
						handleShare("copy-link")
						await setStringAsync(url)
						markCopied("link")
					})
				}
			>
				<Icon as={Link} />
				<Text>{copiedLabel ? "Copied" : "Copy page link"}</Text>
			</Button>
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</Sheet>
	)
}
