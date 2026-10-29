import type { SignupPromptCta } from "@carlnotes/core/lib/signupPrompts"
import { router } from "expo-router"

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

/**
 * Sends a visitor to a session screen for an action that needs an account, remembering the screen they left so sign-in
 * or sign-up returns there, with the web's prompt for the action on the sign-up screen.
 */
export function openSessionScreen({
	screen,
	returnPath,
	cta,
}: {
	screen: "/sign-in" | "/sign-up"
	returnPath: string
	cta?: SignupPromptCta
}): void {
	rememberSessionReturnPath(returnPath)
	router.push(screen === "/sign-up" && cta ? { pathname: "/sign-up", params: { cta } } : screen)
}
