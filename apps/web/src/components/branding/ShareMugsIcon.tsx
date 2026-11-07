import { Coffee } from "lucide-react"

/**
 * Lucide's mug twice, facing each other, for a comment that Carl and Vienna talked about.
 */
export function ShareMugsIcon() {
	return (
		<span className="flex" aria-hidden="true">
			<Coffee className="-scale-x-100 size-4 fill-none" />
			<Coffee className="size-4 fill-none" />
		</span>
	)
}
