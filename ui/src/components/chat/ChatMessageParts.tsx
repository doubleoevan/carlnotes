// the chat message pieces the private chat and the chat room share: the time ago label, the video clip, the copy
// button, and carl's thinking bubble
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { ChatAuthor } from "@/components/chat/ChatAuthor"
import { randomThinkingLine } from "@/components/chat/thinkingLines"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { copyToClipboard } from "@/lib/utils"

/**
 * Formats the label for how long ago a chat turn finished, from "just now" through minutes, hours, and days.
 */
export function toTimeAgoLabel(at: number, now: number): string {
	// under a minute reads as just now, then minutes take over
	const elapsedMs = Math.max(0, now - at)
	const minutes = Math.floor(elapsedMs / 60_000)
	if (minutes < 1) {
		return "just now"
	}
	if (minutes < 60) {
		return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`
	}

	// hours label the rest of the day, then days
	const hours = Math.floor(minutes / 60)
	if (hours < 24) {
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`
	}
	const days = Math.floor(hours / 24)
	return days === 1 ? "1 day ago" : `${days} days ago`
}

/**
 * A chat video clip sent with a question, played in place with the browser's own controls.
 */
export function ChatVideo({ src, name }: { src: string; name: string }) {
	return (
		// biome-ignore lint/a11y/useMediaCaption: a sent clip includes no caption track to offer
		<video
			src={src}
			controls
			preload="metadata"
			aria-label={name}
			className="mt-1 max-h-64 max-w-[92%] rounded-xl @lg:max-w-[75%]"
		/>
	)
}

/** The copy button shows a check once the text writes to the clipboard. */
export function CopyButton({ text }: { text: string }) {
	const [isCopied, setIsCopied] = useState(false)
	// controlled so the copied confirmation survives the click. a tooltip closes when its trigger is clicked
	const [isTooltipOpen, setIsTooltipOpen] = useState(false)

	// copy to the clipboard, then show the check briefly
	async function handleCopy(): Promise<void> {
		if (await copyToClipboard(text)) {
			setIsCopied(true)
			setTimeout(() => setIsCopied(false), 1500)
		}
	}

	return (
		<Tooltip open={isCopied || isTooltipOpen} onOpenChange={setIsTooltipOpen}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={isCopied ? "Copied" : "Copy message"}
					onClick={handleCopy}
					className="hover:text-foreground grid size-6 place-items-center rounded-md"
				>
					{isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
				</button>
			</TooltipTrigger>
			<TooltipContent>{isCopied ? "Copied" : "Copy message"}</TooltipContent>
		</Tooltip>
	)
}

/** One "Carl is ___" shimmer line shown while waiting for the response. */
export function ThinkingLine() {
	const [thinkingLine] = useState(randomThinkingLine)
	return <span className="shimmer-text">{`Carl is ${thinkingLine}…`}</span>
}

/** Carl's bubble while he thinks: the avatar, the mug, and the shimmer. */
export function ModelThinkingBubble() {
	return (
		<ChatAuthor authorUserId={null} authorUsername="Carl">
			<div className="flex flex-col items-start">
				<div className="bg-bubble text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm @lg:max-w-[75%]">
					{/* coffee-loading keeps the mug steaming where the logo's steam is held still on a narrow device,
						to show a reply in progress */}
					<span className="coffee-loading text-muted-foreground flex items-center gap-2">
						<CoffeeMug className="size-4" />
						<ThinkingLine />
					</span>
				</div>
			</div>
		</ChatAuthor>
	)
}
