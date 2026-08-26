// the documentation site. it builds to static files that the api serves under /docs, so it runs no process of its own.
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
	// the production origin, so the emitted sitemap and canonical urls are absolute
	site: "https://carlnotes.com",
	// every generated link and asset url includes this prefix. the build output is not nested under it,
	// so api/index.ts strips the prefix again to resolve a file
	base: "/docs",
	outDir: "./dist",
	// each page builds as <slug>/index.html and every internal link ends in a slash
	trailingSlash: "always",
	// the pages the first docs surface published, which the rewrite replaced.
	// they keep answering so an inbound link reaches the docs instead of a 404
	redirects: {
		"/how-carlnotes-works": "/docs/",
		"/carlnotes-glossary": "/docs/",
		"/who-is-carl": "/docs/",
	},
	integrations: [
		starlight({
			title: "CarlNotes Docs",
			description: "How Carl takes his coffee.",
			// sends the header wordmark back to the app, since the docs are one surface of the product
			routeMiddleware: "./src/routeData.ts",
			// the four sections in reading order. Start here names its two pages, which sit at the content
			// root so their urls stay one segment. the other sections fill from their own folders,
			// where a new page joins by being added to the folder and orders itself with sidebar.order
			sidebar: [
				{
					label: "Start here",
					items: [{ label: "What CarlNotes is", link: "/" }, { slug: "quickstart" }],
				},
				{ label: "Topics", items: [{ autogenerate: { directory: "topics" } }] },
				{ label: "Your topic feed", items: [{ autogenerate: { directory: "feed" } }] },
				{ label: "Teams", items: [{ autogenerate: { directory: "teams" } }] },
				{ label: "Account", items: [{ autogenerate: { directory: "account" } }] },
			],
		}),
	],
})
