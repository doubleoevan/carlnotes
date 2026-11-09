// the home page's client: the featured topics and podcast episodes and a user's topics as cards
import { type HomeResponse, homeResponse, type YourTopicsPage, yourTopicsPage } from "@carlnotes/contracts/home"
import { apiClient, readApiResponse } from "./apiClient"

/**
 * Fetches the home payload, rejecting a failed read.
 */
export async function fetchHome(): Promise<HomeResponse> {
	const response = await apiClient().api.home.$get()
	if (!response.ok) {
		throw new Error(`home load failed: ${response.status}`)
	}
	return readApiResponse(homeResponse, response)
}

/**
 * Fetches one zero-based page of the signed-in user's own and followed topics, rejecting a failed read.
 */
export async function fetchYourTopicsPage(page: number): Promise<YourTopicsPage> {
	const response = await apiClient().api.home["your-topics"].$get({ query: { page: String(page) } })
	if (!response.ok) {
		throw new Error(`your topics load failed: ${response.status}`)
	}
	return readApiResponse(yourTopicsPage, response)
}
