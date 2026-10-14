// the link preview card, its loading note, and the check for a link worth previewing
import type { ChatLinkPreview } from "@shared/contracts/chat"
import { useMemo } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { HostFavicon } from "@/components/common/HostFavicon"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { cn } from "@/lib/utils"

/**
 * The loading note shown while a link's card is still fetching.
 */
export function LinkPreviewLoading() {
	return <CoffeeLoading className="min-h-0 py-1 text-xs" />
}

/**
 * Whether a text holds a link that could have a link preview card.
 */
export function hasPreviewableLink(text: string): boolean {
	return /https?:\/\//i.test(text)
}

/**
 * The link preview card for a link: the page's own title, description, and image, all served from this origin.
 * A YouTube link's card plays the video in place, and nothing reaches YouTube until the play button is pressed.
 */
export function LinkPreviewCard({
	linkPreview,
	className,
	isUserContent,
}: {
	linkPreview: ChatLinkPreview
	className?: string
	// a user content link, such as a finding's source, gets rel ugc and keeps its referrer
	isUserContent?: boolean
}) {
	// the host shown above the page's words
	const linkPreviewHost = useMemo(() => toLinkPreviewHost(linkPreview.url), [linkPreview.url])

	// the page's title and description, with the host above them. the same block ends both card shapes
	const linkPreviewText = (
		<div className="px-3 py-2">
			<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
				<HostFavicon faviconPath={linkPreview.faviconPath} />
				{linkPreviewHost}
			</p>
			{linkPreview.title && (
				<p className="text-foreground mt-0.5 line-clamp-2 text-sm font-semibold">{linkPreview.title}</p>
			)}
			{linkPreview.description && (
				<p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{linkPreview.description}</p>
			)}
		</div>
	)

	// a video card holds the player, so only its text becomes an external link
	if (linkPreview.youtubeVideoId) {
		return (
			<div
				className={cn(
					"border-border bg-bubble/60 mt-1 max-w-[92%] overflow-hidden rounded-xl border @lg:max-w-[75%]",
					className,
				)}
			>
				<YoutubePlayer
					youtubeVideoId={linkPreview.youtubeVideoId}
					title={linkPreview.title}
					thumbnailPath={linkPreview.imagePath}
					isUserContent={isUserContent}
				/>
				<AnchorLink href={linkPreview.url} isUserContent={isUserContent} className="hover:bg-bubble block">
					{linkPreviewText}
				</AnchorLink>
			</div>
		)
	}
	return (
		<AnchorLink
			href={linkPreview.url}
			isUserContent={isUserContent}
			className={cn(
				"border-border bg-bubble/60 hover:bg-bubble mt-1 block max-w-[92%] overflow-hidden rounded-xl border @lg:max-w-[75%]",
				className,
			)}
		>
			{/* the page's image, proxied through this origin. it scales whole at its own ratio,
				and only a very tall image is held to the height limit, cropped from the bottom so the top stays */}
			{linkPreview.imagePath && (
				<img src={linkPreview.imagePath} alt="" loading="lazy" className="max-h-72 w-full object-cover object-top" />
			)}
			{linkPreviewText}
		</AnchorLink>
	)
}

// the host a link preview's url points at, or the whole url when it cannot be parsed
function toLinkPreviewHost(url: string): string {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}
