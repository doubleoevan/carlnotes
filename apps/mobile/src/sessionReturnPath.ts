let returnPath: string | null = null

/**
 * Retains an internal destination while a visitor signs in through a platform sheet or browser.
 */
export function rememberSessionReturnPath(path: string): void {
	returnPath = path.startsWith("/") && !path.startsWith("//") ? path : null
}

/**
 * Consumes the pending destination once the signed-in navigation tree is available.
 */
export function takeSessionReturnPath(): string | null {
	// consume the saved destination once
	const path = returnPath
	returnPath = null
	return path
}
