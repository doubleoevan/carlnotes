// the host favicon in a round chip, or the globe when the host has none

import { Globe } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * A host's favicon in a round chip at the metadata line's size, faint on the light theme and white on the dark one,
 * so a dark glyph reads on both. The muted globe shows until the icon is drawn, and stays when the host has none or
 * the browser cannot draw it.
 */
export function HostFavicon({ faviconPath }: { faviconPath: string | null }) {
	return (
		<span className="border-hero bg-card dark:border-white dark:bg-white relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border">
			{faviconPath ? <HostFaviconImage key={faviconPath} faviconPath={faviconPath} /> : <HostGlobe />}
		</span>
	)
}

// the globe at the icon's size, dark enough to read on the white chip
function HostGlobe() {
	return <Globe className="text-muted-foreground dark:text-neutral-600 size-3" />
}

// the image and its load state, one per path
function HostFaviconImage({ faviconPath }: { faviconPath: string }) {
	const [faviconLoadStatus, setFaviconLoadStatus] = useState<"loading" | "loaded" | "broken">("loading")
	if (faviconLoadStatus === "broken") {
		return <HostGlobe />
	}
	return (
		<>
			{faviconLoadStatus === "loading" && <HostGlobe />}
			<img
				src={faviconPath}
				alt=""
				loading="lazy"
				className={cn("size-3", faviconLoadStatus === "loading" && "invisible absolute")}
				onLoad={() => setFaviconLoadStatus("loaded")}
				onError={() => setFaviconLoadStatus("broken")}
			/>
		</>
	)
}
