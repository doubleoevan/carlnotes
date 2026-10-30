// the documentation site. it builds to static files that the api serves under /docs, so it runs no process of its own.
import { satteri } from "@astrojs/markdown-satteri"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import { topicTutorialVideoPlugin } from "./src/topicTutorialVideoPlugin"

// the path the api serves the docs after
const DOCS_BASE = "/docs"

export default defineConfig({
	// the production origin, so the emitted sitemap and canonical urls are absolute
	site: "https://carlnotes.com",
	// every generated link and asset url includes this prefix. the build output is not nested under it,
	// so api/index.ts strips the prefix again to resolve a file
	base: DOCS_BASE,
	outDir: "./dist",
	// each page builds as <slug>/index.html and every internal link ends in a slash
	trailingSlash: "always",
	// Astro's own markdown processor, where a page's video marker becomes the video on making a topic
	markdown: { processor: satteri({ hastPlugins: [topicTutorialVideoPlugin({ base: DOCS_BASE })] }) },
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
			// the footer override adds the copyright line under starlight's own rows
			components: { Footer: "./src/components/Footer.astro" },
			// point the header logo at the app instead of the docs home
			routeMiddleware: "./src/routeData.ts",
			// the five sections in reading order. Start here names its three pages, which sit at the content
			// root so their urls stay one segment. the other sections fill from their own folders,
			// where a new page joins by being added to the folder and orders itself with sidebar.order
			sidebar: [
				{
					label: "Start here",
					items: [{ label: "What CarlNotes Is", link: "/" }, { slug: "quickstart" }, { slug: "get-the-app" }],
				},
				{ label: "Topics", items: [{ autogenerate: { directory: "topics" } }] },
				{ label: "Your topic feed", items: [{ autogenerate: { directory: "feed" } }] },
				{ label: "Teams", items: [{ autogenerate: { directory: "teams" } }] },
				{ label: "Account", items: [{ autogenerate: { directory: "account" } }] },
			],
		}),
	],
})
