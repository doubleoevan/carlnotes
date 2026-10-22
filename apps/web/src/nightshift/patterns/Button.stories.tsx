// the hand-built button classes: each button class string from styleClasses.ts on the button the app builds with it
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ArrowUp, ArrowUpDown, Coffee, Mic, Paperclip, Play, RotateCcw, Users } from "lucide-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { SKIP_BACK_SECONDS } from "@/lib/podcastEpisodePlayback"
import {
	CARD_CLASS,
	COMPOSER_FRAME_CLASS,
	ICON_BUTTON_CLASS,
	ICON_TILE_BUTTON_CLASS,
	MENU_BUTTON_CLASS,
	MENU_BUTTON_HIGHLIGHT_CLASS,
	PLAY_BUTTON_CLASS,
	PLAY_BUTTON_MUTED_CLASS,
	PLAYBACK_CONTROL_BUTTON_CLASS,
	PODCAST_EPISODE_QUESTION_BUTTON_CLASS,
	SEARCH_BAR_ICON_CLASS,
	SEND_BUTTON_CLASS,
} from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the fill under a button class in the app: the page under the toolbar's menu buttons, a card under the player, table,
// and search bar buttons, and the composer's frame under its buttons
type ButtonClassFill = "page" | "card" | "composer"

// each button class's constant, its accessible name, its classes as a real call site writes them, its fill, and its
// content, in the order the gallery shows them
const BUTTON_CLASS_SAMPLES = {
	menuButton: {
		constantName: "MENU_BUTTON_CLASS",
		label: "Team Up",
		className: MENU_BUTTON_CLASS,
		fill: "page",
		content: (
			<>
				<Users className="size-4" />
				Team Up
			</>
		),
	},
	menuButtonHighlight: {
		constantName: "MENU_BUTTON_HIGHLIGHT_CLASS",
		label: "Brew",
		className: cn(MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS, "disabled:pointer-events-none disabled:opacity-50"),
		fill: "page",
		content: (
			<>
				<Coffee className="size-4 fill-none" />
				Brew
			</>
		),
	},
	playButton: {
		constantName: "PLAY_BUTTON_CLASS",
		label: "Play episode 3",
		className: cn(PLAY_BUTTON_CLASS, "size-11"),
		fill: "card",
		content: <Play className="size-4.5 fill-current" />,
	},
	playButtonMuted: {
		constantName: "PLAY_BUTTON_MUTED_CLASS",
		label: "Play chapter 2",
		className: cn(PLAY_BUTTON_CLASS, "size-11 sm:size-9", PLAY_BUTTON_MUTED_CLASS),
		fill: "card",
		content: <Play className="size-4 fill-current" />,
	},
	sendButton: {
		constantName: "SEND_BUTTON_CLASS",
		label: "Send",
		className: SEND_BUTTON_CLASS,
		fill: "composer",
		content: <ArrowUp className="size-4" />,
	},
	playbackControlButton: {
		constantName: "PLAYBACK_CONTROL_BUTTON_CLASS",
		label: `Skip back ${SKIP_BACK_SECONDS} seconds`,
		className: PLAYBACK_CONTROL_BUTTON_CLASS,
		fill: "card",
		content: <RotateCcw className="size-4.5" />,
	},
	podcastEpisodeQuestionButton: {
		constantName: "PODCAST_EPISODE_QUESTION_BUTTON_CLASS",
		label: "Ask Carl and Vienna",
		className: PODCAST_EPISODE_QUESTION_BUTTON_CLASS,
		fill: "card",
		content: <Mic className="size-4.5" />,
	},
	iconButton: {
		constantName: "ICON_BUTTON_CLASS",
		label: "Add files or photos",
		className: ICON_BUTTON_CLASS,
		fill: "composer",
		content: <Paperclip className="size-4" />,
	},
	iconTileButton: {
		constantName: "ICON_TILE_BUTTON_CLASS",
		label: "Play episode 2",
		className: cn("shrink-0 hover:opacity-75", ICON_TILE_BUTTON_CLASS),
		fill: "card",
		content: (
			<span className={cn(PLAY_BUTTON_CLASS, "size-6")}>
				<Play className="size-3 fill-current" />
			</span>
		),
	},
	searchBarIcon: {
		constantName: "SEARCH_BAR_ICON_CLASS",
		label: "Sort",
		className: SEARCH_BAR_ICON_CLASS,
		fill: "card",
		content: <ArrowUpDown className="size-4" />,
	},
} satisfies Record<
	string,
	{ constantName: string; label: string; className: string; fill: ButtonClassFill; content: React.ReactNode }
>

type ButtonClassName = keyof typeof BUTTON_CLASS_SAMPLES

// the button classes, in the order the gallery shows them
const BUTTON_CLASS_NAMES = Object.keys(BUTTON_CLASS_SAMPLES) as ButtonClassName[]

// the button classes the app ever disables: Brew while the scan count loads, send with nothing to send, and the podcast
// episode question mic while it waits. the gallery shows only these disabled
const DISABLED_BUTTON_CLASS_NAMES: ButtonClassName[] = [
	"menuButtonHighlight",
	"sendButton",
	"podcastEpisodeQuestionButton",
]

/**
 * Renders one button class on its button, with its icon and its accessible name, on the fill the app draws under it.
 */
function ButtonClassSample({
	buttonClass,
	isDisabled,
	onClick,
}: {
	buttonClass: ButtonClassName
	isDisabled: boolean
	onClick: () => void
}) {
	const buttonClassSample = BUTTON_CLASS_SAMPLES[buttonClass]
	return (
		<ButtonClassFillBox fill={buttonClassSample.fill}>
			<button
				type="button"
				aria-label={buttonClassSample.label}
				disabled={isDisabled}
				onClick={onClick}
				className={buttonClassSample.className}
			>
				{buttonClassSample.content}
			</button>
		</ButtonClassFillBox>
	)
}

// the page alone, a small card, or the composer's frame around a button class
function ButtonClassFillBox({ fill, children }: { fill: ButtonClassFill; children: React.ReactNode }) {
	if (fill === "page") {
		return children
	}
	return (
		<div className={fill === "card" ? cn(CARD_CLASS, "p-2") : COMPOSER_FRAME_CLASS} style={{ flexShrink: 0 }}>
			{children}
		</div>
	)
}

// every button class beside the name of its constant. disabled, the gallery shows only the button classes the app
// disables
function ButtonClassGallery({ isDisabled, onClick }: { isDisabled: boolean; onClick: () => void }) {
	const buttonClassNames = isDisabled ? DISABLED_BUTTON_CLASS_NAMES : BUTTON_CLASS_NAMES
	return (
		<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
			{buttonClassNames.map((buttonClass) => (
				<div key={buttonClass} style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<ButtonClassSample buttonClass={buttonClass} isDisabled={isDisabled} onClick={onClick} />
					<code className="text-foreground text-xs" style={{ overflowWrap: "anywhere" }}>
						{BUTTON_CLASS_SAMPLES[buttonClass].constantName}
					</code>
				</div>
			))}
		</div>
	)
}

const meta = {
	title: "Patterns/Button",
	component: ButtonClassSample,
	args: { buttonClass: "menuButton", isDisabled: false, onClick: fn() },
	argTypes: {
		buttonClass: { control: "select", options: BUTTON_CLASS_NAMES },
		isDisabled: { control: "boolean" },
		onClick: { control: false },
	},
} satisfies Meta<typeof ButtonClassSample>

export default meta
type Story = StoryObj<typeof meta>

// one button class at a time, picked with the button class control
export const Default: Story = {}

// every button class side by side, each named by its constant
export const AllButtonClasses: Story = {
	argTypes: { buttonClass: { table: { disable: true } } },
	render: ({ isDisabled, onClick }) => <ButtonClassGallery isDisabled={isDisabled} onClick={onClick} />,
}

// the button classes the app disables, each faded: Brew, send, and the podcast episode question mic. the app never
// disables the rest
export const AllButtonClassesDisabled: Story = { ...AllButtonClasses, args: { isDisabled: true } }
