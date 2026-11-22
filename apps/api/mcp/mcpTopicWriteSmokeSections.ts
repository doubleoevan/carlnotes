// the mcp smoke's sections for the owner's topic writes on both routes: set_topic_image with a url that returns a page
// instead of an image and with no url, and add_topic_attachment with a private address the public fetch guard rejects

import { check, routePaths, toClient, topicId } from "./mcpSmokeFixtures"
import { toResultText } from "./toolTestFixtures"

/**
 * Checks that the owner's set_topic_image rejects a url that returns a page and a call with no url, on both routes,
 * and stores nothing.
 */
export async function checkTopicImageTool(accessToken: string): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath, accessToken)
		try {
			// a page is not an image, so the image is unchanged
			await client.connect(transport)
			const toolResult = await client.callTool({
				name: "set_topic_image",
				arguments: { topic_id: topicId, image_url: "https://example.com/" },
			})
			check(
				`${routePath}: set_topic_image rejects a url that returns a page`,
				Boolean(toolResult.isError) && toResultText(toolResult).includes("That url is not a supported image"),
				toResultText(toolResult),
			)

			// a call with no url renders nothing and names the topic page, where Carl regenerates the image
			const noUrlResult = await client.callTool({ name: "set_topic_image", arguments: { topic_id: topicId } })
			check(
				`${routePath}: set_topic_image with no url sends the owner to the topic page`,
				Boolean(noUrlResult.isError) && toResultText(noUrlResult).includes(`/topics/${topicId}`),
				toResultText(noUrlResult),
			)

			// the listed input schema no longer takes an image prompt
			const { tools } = await client.listTools()
			const setTopicImageTool = tools.find((tool) => tool.name === "set_topic_image")
			check(
				`${routePath}: set_topic_image takes no image_prompt`,
				setTopicImageTool !== undefined && !("image_prompt" in (setTopicImageTool.inputSchema.properties ?? {})),
			)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}

/** Checks that the owner's add_topic_attachment rejects a private address, on both routes, before any fetch. */
export async function checkTopicAttachmentTool(accessToken: string): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath, accessToken)
		try {
			// the owner passes the owner check, and the guard rejects the address before anything is stored
			await client.connect(transport)
			const toolResult = await client.callTool({
				name: "add_topic_attachment",
				arguments: { topic_id: topicId, url: "http://10.0.0.5/notes" },
			})
			check(
				`${routePath}: add_topic_attachment rejects a private address`,
				Boolean(toolResult.isError) && toResultText(toolResult).endsWith("Nothing was added."),
				toResultText(toolResult),
			)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}
