import { Maximize2, MessageSquareX, Minimize2, Minus } from "lucide-react"
import type * as React from "react"
import { lazy, Suspense, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { ChatBudgetNotice } from "@/components/chat/ChatBudgetNotice"
import { ChatComposer } from "@/components/chat/ChatComposer"
import { useTopicChat } from "@/components/chat/useTopicChat"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"

// the three states the panel lives in. "collapsed" is a pill button, "open" is docked bottom-right, "enlarged" fills the screen
type PanelState = "collapsed" | "open" | "enlarged"

// the message list is lazy-loaded on the first open instead of with the page.
// it includes the Streaming Markdown library, the largest thing the app ships
const ChatMessages = lazy(() =>
	import("@/components/chat/ChatMessages").then((messages) => ({ default: messages.ChatMessages })),
)

// what the message area shows while the chat history is loading
function ChatMessagesLoading() {
	return (
		<div className="text-muted-foreground flex min-h-24 flex-1 items-center justify-center gap-2 text-sm">
			<CoffeeMug className="size-4" />
			Pouring…
		</div>
	)
}

// the panel's elevated drop shadow
const ELEVATION_CLASS =
	"shadow-[0_12px_28px_rgba(0,0,0,0.35),0_32px_80px_-12px_rgba(0,0,0,0.6),0_0_48px_rgba(0,0,0,0.55)] ring-1 ring-black/10 dark:ring-white/20"

/**
 * The chat panel for one topic, docked bottom-right and labeled Coffee Talk
 */
export function ChatPanel({ topicId, topicName }: { topicId: string; topicName: string }) {
	// the panel's own view state, the router a visitor's send to signup needs, and the conversation state the hook owns
	const [panelState, setPanelState] = useState<PanelState>("collapsed")
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
	const navigate = useNavigate()
	const chat = useTopicChat(topicId)

	// pick the opening state once the conversation load settles.
	// an empty chat on a wide screen displays open. an existing conversation or any narrow screen displays collapsed.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only the load settling picks the state, never later chat turns
	useEffect(() => {
		if (chat.isLoaded) {
			const isWideScreen = window.matchMedia("(min-width: 640px)").matches
			setPanelState(chat.chatTurns.length === 0 && isWideScreen ? "open" : "collapsed")
		}
	}, [chat.isLoaded])

	// a visitor navigates to the signup on send
	const handleSendChat = chat.isSignupRequired ? () => navigate("/signup") : chat.send

	// a user with no way forward gets no panel, but a logged-out visitor or a user with an exhausted budget shows the panel with a call to action
	if (!chat.isLoaded || (!chat.canChat && !chat.isSignupRequired && !chat.isBudgetExhausted)) {
		return null
	}

	// "collapsed" state only shows the pill button
	if (panelState === "collapsed") {
		return toBodyPortal(<ChatPill onOpen={() => setPanelState("open")} />)
	}

	// "open" and "enlarged" state render the same panel, sized by the flag
	const isPanelEnlarged = panelState === "enlarged"
	return toBodyPortal(
		<>
			{/* only show an overlay on the page if the panel is enlarged */}
			{isPanelEnlarged && <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" />}

			{/* Escape also minimizes the panel */}
			<section
				aria-label="Coffee Talk"
				onKeyDown={(event) => event.key === "Escape" && setPanelState("collapsed")}
				className={cn(
					"bg-popover fixed z-50 flex flex-col rounded-xl",
					ELEVATION_CLASS,
					isPanelEnlarged
						? "bottom-safe top-3 right-3 left-3 sm:inset-6"
						: "bottom-safe right-3 left-3 max-h-[70dvh] sm:left-auto sm:w-[26rem] md:w-[30rem]",
				)}
			>
				<ChatPanelHeader
					isEnlarged={isPanelEnlarged}
					isClearable={(chat.canChat || chat.isBudgetExhausted) && chat.chatTurns.length > 0}
					onToggleSize={() => setPanelState(isPanelEnlarged ? "open" : "enlarged")}
					onCollapse={() => setPanelState("collapsed")}
					onClear={() => setIsClearConfirmOpen(true)}
				/>
				{/* Suspense shows the loading fallback until chat messages are loaded */}
				<Suspense fallback={<ChatMessagesLoading />}>
					<ChatMessages
						chatTurns={chat.chatTurns}
						isStreaming={chat.isStreaming}
						topicName={topicName}
						isBudgetExhausted={chat.isBudgetExhausted}
					/>
				</Suspense>
				{/* if the user is out of budget, they see an upgrade link instead of the composer input */}
				{chat.isBudgetExhausted ? (
					<div className="border-t px-3 py-3">
						<ChatBudgetNotice />
					</div>
				) : (
					<ChatComposer
						question={chat.question}
						attachments={chat.attachments}
						keptAttachments={chat.keptAttachments}
						isStreaming={chat.isStreaming}
						isSignupRequired={chat.isSignupRequired}
						onChange={chat.setQuestion}
						onAddFiles={chat.addFiles}
						onAddPastedText={chat.addPastedText}
						onRemoveAttachment={chat.removeAttachment}
						onRemoveKeptAttachment={chat.removeKeptAttachment}
						onSend={handleSendChat}
						onStop={chat.stop}
					/>
				)}

				{/* the clear confirmation is only mounted while open, so its state resets each time */}
				{isClearConfirmOpen && (
					<ConfirmDialog
						title="Clear this chat?"
						confirmLabel="Clear it"
						cancelLabel="Keep it"
						onConfirm={async () => {
							await chat.clear()
							setIsClearConfirmOpen(false)
						}}
						onClose={() => setIsClearConfirmOpen(false)}
					>
						{"Carl forgets this whole conversation, and the files you attached go too."}
					</ConfirmDialog>
				)}
			</section>
		</>,
	)
}

// the "collapsed" state is a labeled pill button
function ChatPill({ onOpen }: { onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				"bg-primary text-primary-foreground font-display bottom-safe fixed right-3 z-50 flex items-center gap-2 rounded-full py-2.5 pr-4 pl-3 text-sm transition-transform hover:scale-105",
				ELEVATION_CLASS,
			)}
		>
			<CoffeeCup className="size-5.5" />
			Coffee Talk
		</button>
	)
}

// the title bar with the clear, enlarge, and minimize controls
function ChatPanelHeader({
	isEnlarged,
	isClearable,
	onToggleSize,
	onCollapse,
	onClear,
}: {
	isEnlarged: boolean
	isClearable: boolean
	onToggleSize: () => void
	onCollapse: () => void
	onClear: () => void
}) {
	return (
		<header className="flex items-center gap-2 border-b px-3 py-2.5">
			<CoffeeMug className="size-5 shrink-0" />
			<h2 className="font-display flex-1 text-lg leading-none">Coffee Talk</h2>
			{/* the window controls are grouped to the right */}
			<div className="flex items-center gap-0.5">
				{/* clearing only offers itself when there is a conversation to clear */}
				{isClearable && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label="Clear this chat"
								onClick={onClear}
								className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md"
							>
								<MessageSquareX className="size-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>Clear this chat</TooltipContent>
					</Tooltip>
				)}
				{/* the size toggle reads as an "expand" and "collapse" pair */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={isEnlarged ? "Collapse" : "Expand"}
							onClick={onToggleSize}
							className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md"
						>
							{isEnlarged ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
						</button>
					</TooltipTrigger>
					<TooltipContent>{isEnlarged ? "Collapse" : "Expand"}</TooltipContent>
				</Tooltip>
				{/* the "minimize" dash closes the panel to its pill */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Minimize"
							onClick={onCollapse}
							className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md"
						>
							<Minus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Minimize</TooltipContent>
				</Tooltip>
			</div>
		</header>
	)
}

// createPortal renders the panel or the pill button into the body instead of the layout's box,
// so it's z-index can stack above the search bar
function toBodyPortal(children: React.ReactNode): React.ReactPortal {
	return createPortal(children, document.body)
}
