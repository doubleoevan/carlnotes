import { showClientError } from "@carlnotes/client/apiClient"
import { Share2 } from "lucide-react-native"
import { useRef, useState } from "react"
import { Share } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"

/**
 * Opens the native share sheet with the same Markdown as Copy, preserving its parent sheet on every outcome.
 */
export function ShareMarkdownButton({ markdown }: { markdown: string }) {
	// a native share is modal, but it never changes the Finding's lifetime or feedback state
	const pendingRef = useRef(false)
	const [isPending, setIsPending] = useState(false)
	async function handleShare(): Promise<void> {
		if (pendingRef.current) {
			return
		}
		pendingRef.current = true
		setIsPending(true)
		try {
			await Share.share({ message: markdown, title: "Carl's notes" })
		} catch {
			showClientError("That didn't share. Try again.")
		} finally {
			pendingRef.current = false
			setIsPending(false)
		}
	}
	return (
		<Button
			variant="outline"
			size="icon"
			className="bg-card/90"
			accessibilityLabel="Share Markdown"
			disabled={isPending}
			onPress={() => void handleShare()}
		>
			<Icon as={Share2} className="size-4 text-muted-foreground" />
		</Button>
	)
}
