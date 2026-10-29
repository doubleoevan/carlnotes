// how the web app configures the shared api client: where its requests go, and how a client error reaches the user
import { configureApiClient } from "@carlnotes/client/apiClient"
import { requestTermsAcceptance } from "@carlnotes/core/stores/termsAcceptanceStore"
import { toast } from "sonner"

/**
 * Configures the api client for the web app. A browser request goes to the page's own origin, and a server render's
 * request goes to the api on port 3000, in dev and in production. An error a client shows is a toast.
 */
export function configureWebApiClient(): void {
	configureApiClient({
		apiBaseUrl: typeof window === "undefined" ? "http://localhost:3000" : "",
		showError: (message) => toast.error(message),
		onTermsOutdated: requestTermsAcceptance,
	})
}
