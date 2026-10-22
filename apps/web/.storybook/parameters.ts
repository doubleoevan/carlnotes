// the Storybook parameters that stories share

/** Returns the docs parameter that renders each story in its own frame of the given height on the docs page. */
export function toOwnFrameDocs(heightPixels: number): { story: { inline: false; iframeHeight: string } } {
	return { story: { inline: false, iframeHeight: `${heightPixels}px` } }
}
