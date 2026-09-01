// the link preview card, its loading note, and the check for a link worth previewing
import type { ChatLinkPreview } from "@shared/contracts"
import { Play } from "lucide-react"
import { useMemo, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
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
export function LinkPreviewCard({ linkPreview, className }: { linkPreview: ChatLinkPreview; className?: string }) {
	// the host shown above the page's words
	const linkPreviewHost = useMemo(() => toLinkPreviewHost(linkPreview.url), [linkPreview.url])
	const [isPlayingVideo, setIsPlayingVideo] = useState(false)

	// the page's title and description, with the host above them. the same block ends both card shapes
	const linkPreviewText = (
		<div className="px-3 py-2">
			<p className="text-muted-foreground text-xs">{linkPreviewHost}</p>
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
				{isPlayingVideo ? (
					<iframe
						src={`https://www.youtube-nocookie.com/embed/${linkPreview.youtubeVideoId}?autoplay=1`}
						title={linkPreview.title ?? "YouTube video"}
						allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
						referrerPolicy="strict-origin-when-cross-origin"
						className="aspect-video w-full border-0"
					/>
				) : (
					<button
						type="button"
						aria-label={`Play ${linkPreview.title ?? "the video"}`}
						onClick={() => setIsPlayingVideo(true)}
						className="group relative block aspect-video w-full"
					>
						{/* the stored thumbnail, with the play button over it */}
						{linkPreview.imagePath && (
							<img
								src={linkPreview.imagePath}
								alt=""
								loading="lazy"
								className="absolute inset-0 size-full object-cover"
							/>
						)}
						<span className="absolute inset-0 grid place-items-center bg-black/30 transition-colors group-hover:bg-black/20">
							<span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-full">
								<Play className="ml-0.5 size-5 fill-current" />
							</span>
						</span>
					</button>
				)}
				<AnchorLink href={linkPreview.url} className="hover:bg-bubble block">
					{linkPreviewText}
				</AnchorLink>
			</div>
		)
	}
	return (
		<AnchorLink
			href={linkPreview.url}
			className={cn(
				"border-border bg-bubble/60 hover:bg-bubble mt-1 block max-w-[92%] overflow-hidden rounded-xl border @lg:max-w-[75%]",
				className,
			)}
		>
			{/* the page's image, proxied through this origin */}
			{linkPreview.imagePath && (
				<img src={linkPreview.imagePath} alt="" loading="lazy" className="h-36 w-full object-cover" />
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
