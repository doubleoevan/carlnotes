import { cn } from "@carlnotes/nightshift/classNames"
import { Outlet, useLocation } from "@tanstack/react-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BackButton } from "@/components/common/BackButton"
import { BrandLink } from "@/components/common/BrandLink"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { useIsPodcastPlayerShown } from "@/stores/podcastEpisodePlayerStore"
import { McpViewDisplayModeButton } from "./McpViewDisplayModeButton"
import { McpViewPodcastPlayer } from "./McpViewPodcastPlayer"
import { McpViewToolText } from "./McpViewToolText"
import {
	FINDINGS_ROUTE_PREFIX,
	mcpViewHistory,
	NEWS_ROUTE_PATH,
	TOPIC_POST_ROUTE_PREFIX,
	TOPIC_POSTS_ROUTE_PREFIX,
	toMcpViewToolCall,
} from "./mcpViewHistory"
import { useMcpViewData, useMcpViewDisplayModes, useMcpViewLinkError } from "./mcpViewHost"
import { toMcpViewRouteHeading } from "./mcpViewRouteHeading"

/**
 * The root of every MCP view: a slim brand bar, with back once the MCP view has moved, above the route. It keeps the one
 * podcast player, so audio survives a move. A host frames an MCP view edge to edge, so the shell keeps its own margin.
 * Fullscreen adds the route's title and its page to the brand bar. Picture in picture shows only the brand bar and
 * the player.
 */
export function McpViewShell() {
	// the route's history entry, which a new tool call replaces, and what it shows
	const location = useLocation()
	const toolResult = toMcpViewToolCall(location.state)?.toolResult
	const isToolTextShown = toolResult && !toolResult.structuredContent && (toolResult.isError || !toolResult._meta)
	const linkError = useMcpViewLinkError()

	// the display mode, what the brand bar adds in fullscreen, and which routes offer a mode
	const { displayMode } = useMcpViewDisplayModes()
	const mcpViewData = useMcpViewData()
	const { pathname } = location
	const isFullscreen = displayMode === "fullscreen"
	const routeHeading = isFullscreen ? toMcpViewRouteHeading({ pathname, toolResult, mcpViewData }) : null
	const isTableRoute = pathname === "/search" || pathname === "/updates" || pathname.startsWith(FINDINGS_ROUTE_PREFIX)
	const isTopicPostRoute = [TOPIC_POSTS_ROUTE_PREFIX, TOPIC_POST_ROUTE_PREFIX].some((routePrefix) =>
		pathname.startsWith(routePrefix),
	)
	const isFullscreenOffered = isTableRoute || isTopicPostRoute || pathname === NEWS_ROUTE_PATH || isFullscreen
	const isPictureInPicture = displayMode === "pip"
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	return (
		<div className="@container min-w-0 p-3 wrap-anywhere">
			{/* the brand bar */}
			<div className="mb-2 flex min-h-9 items-center gap-2">
				{mcpViewHistory.canGoBack() && <BackButton onClick={() => mcpViewHistory.back()} />}
				<BrandLink
					href="/"
					aria-label="Open CarlNotes in a new tab"
					mugClassName="text-primary size-5 shrink-0"
					nameClassName="text-muted-foreground font-display text-sm hover:underline"
				/>
				{routeHeading && (
					<>
						<span className="font-display min-w-0 truncate">{routeHeading.title}</span>
						<AnchorLink href={routeHeading.href} className={cn(STANDALONE_LINK_CLASS, "shrink-0 text-sm")}>
							Open on CarlNotes
						</AnchorLink>
					</>
				)}
				<div className="ml-auto flex items-center gap-1">
					{(isPodcastPlayerShown || isPictureInPicture) && <McpViewDisplayModeButton displayMode="pip" />}
					{isFullscreenOffered && <McpViewDisplayModeButton displayMode="fullscreen" />}
				</div>
			</div>
			{/* the tool's own words for a call that returned only text, or the route, which stays mounted behind the player */}
			<div className={cn(isPictureInPicture && "hidden")}>
				{isToolTextShown ? <McpViewToolText toolResult={toolResult} /> : <Outlet key={location.state.__TSR_key} />}
			</div>
			{linkError && (
				<p role="alert" className="text-muted-foreground mt-3 text-sm">
					{linkError}
				</p>
			)}
			<McpViewPodcastPlayer />
		</div>
	)
}
