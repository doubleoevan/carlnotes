// the docs collection, loaded and validated by Starlight's own loader and frontmatter schema
import { defineCollection } from "astro:content"
import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
