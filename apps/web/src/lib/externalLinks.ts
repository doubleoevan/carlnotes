// opening a url outside the app

/**
 * Opens a url in a new tab, with no handle back to this page.
 */
export function openInNewTab(url: string): void {
	window.open(url, "_blank", "noopener")
}
