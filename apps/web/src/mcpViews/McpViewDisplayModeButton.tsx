import type { McpUiDisplayMode } from "@modelcontextprotocol/ext-apps"
import { Maximize, Minimize, PictureInPicture2 } from "lucide-react"
import { IconButton } from "@/components/common/IconButton"
import { requestMcpViewDisplayMode, useMcpViewDisplayModes } from "./mcpViewHost"

// what the button says for each mode it asks for, and for leaving that mode
const DISPLAY_MODE_LABELS = {
	fullscreen: { enter: "Full screen", exit: "Exit full screen" },
	pip: { enter: "Picture in picture", exit: "Exit picture in picture" },
}

/**
 * The button that asks the host for a display mode, or for inline while in that mode. A host that does not list the mode
 * gets no button.
 */
export function McpViewDisplayModeButton({ displayMode }: { displayMode: Exclude<McpUiDisplayMode, "inline"> }) {
	const { displayMode: shownDisplayMode, availableDisplayModes } = useMcpViewDisplayModes()
	const isDisplayModeShown = shownDisplayMode === displayMode
	if (!isDisplayModeShown && !availableDisplayModes.includes(displayMode)) {
		return null
	}

	// the button's words and icon for this mode and its state
	const displayModeLabels = DISPLAY_MODE_LABELS[displayMode]
	const icon = displayMode === "pip" ? <PictureInPicture2 className="size-4" /> : <Maximize className="size-4" />
	return (
		<IconButton
			tooltip={isDisplayModeShown ? displayModeLabels.exit : displayModeLabels.enter}
			onClick={() => void requestMcpViewDisplayMode(isDisplayModeShown ? "inline" : displayMode)}
		>
			{isDisplayModeShown && displayMode === "fullscreen" ? <Minimize className="size-4" /> : icon}
		</IconButton>
	)
}
