// the Terms acceptance call: records the signed-in user's acceptance of the published version
import { type TermsAcceptanceResponse, termsAcceptanceResponse } from "@carlnotes/contracts/terms"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Records the signed-in user's acceptance of the current Terms and returns the version now on the account. Throws an
 * error on a rejection.
 */
export async function sendTermsAcceptance(): Promise<TermsAcceptanceResponse> {
	const response = await apiClient().api.users.me["terms-acceptance"].$post()
	if (!response.ok) {
		throw new Error(`terms acceptance failed: ${response.status}`)
	}
	return readApiResponse(termsAcceptanceResponse, response)
}
