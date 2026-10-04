// the podcast episode script eval's cases. a case is a Topic and the Findings that the writer makes a podcast episode from.
// the sources, the people, and the figures are made up, so a fact in a script that its case lacks is invented
import type { PodcastEpisodeFinding } from "../../worker/podcast/podcastEpisodeScript"

// one case. what it tests, its Topic, its Findings, and what it checks beyond the checks that every case gets
export type PodcastEpisodeScriptCase = {
	description: string
	topicName: string
	topicPrompt: string
	podcastEpisodeFindings: PodcastEpisodeFinding[]
	// what the Findings do not say, so the script must not say it either
	unsupportedClaims?: string
	// whether the Findings are few and short, so the script has to be short too
	isThinInput?: boolean
}

// two Findings with a few sentences of stored content each
const THIN_INPUT_CASE: PodcastEpisodeScriptCase = {
	description: "a two-finding input with little content yields a two-chapter script under seven minutes",
	topicName: "Home espresso",
	topicPrompt: "Gear and technique for espresso at home. I grind before the house is awake.",
	isThinInput: true,
	podcastEpisodeFindings: [
		{
			findingId: "3f6c1a52-8d0e-4b7a-9c21-5e7d4a90b101",
			title: "A quieter burr set for home grinders",
			sourceHost: "burrnotes.example",
			snippet:
				"A grinder maker announced a burr set that runs at 62 decibels, about a third quieter than its last one.",
			relevanceExplanation:
				"The reader grinds before the house is awake, so a quieter grinder is the upgrade they asked about.",
			content: [
				"Tamber announced a 64 millimeter burr set this week that it says runs at 62 decibels at one meter, about a third quieter than the set it replaces.",
				"The burrs fit the company's existing Model S grinder with no other changes.",
				"Tamber says the grind time for an 18 gram dose is unchanged at about 11 seconds.",
				"The set ships in March.",
			].join(" "),
		},
		{
			findingId: "b27e9d04-1c35-4f68-a7d2-0e4b6c81f202",
			title: "Soft water and sour espresso",
			sourceHost: "waterforcoffee.example",
			snippet:
				"A water lab pulled the same espresso at three hardness levels and found that very soft water makes a shot taste sour.",
			relevanceExplanation: "The reader's shots turned sour after a move, and the new city's water is much softer.",
			content: [
				"A small water lab pulled the same espresso recipe with water at three hardness levels: 30, 90, and 250 parts per million.",
				"Tasters scored the shots at 30 parts per million as the most sour and the shots at 250 as flat.",
				"The shots at 90 parts per million scored highest overall.",
				"The lab suggests that anyone whose shots turned sour after a move check the hardness of the new tap water before changing beans or grind.",
			].join(" "),
		},
	],
}

// two Findings whose stored content has a name, a number, and a quote that the script may use,
// about software that the model knows more about than the content says
const SUPPORTED_CLAIMS_CASE: PodcastEpisodeScriptCase = {
	description: "the script says only what the findings and their stored content support",
	topicName: "Postgres at a small startup",
	topicPrompt:
		"We run one Postgres database for a small product team. I want practical performance wins, and news about a release if it changes what we should do.",
	unsupportedClaims:
		"which Postgres version Tallgrass runs, how long the Tallgrass change took to ship, when Postgres 18 was released, or any Postgres 18 feature other than asynchronous I/O, such as uuidv7, skip scans, virtual generated columns, or OAuth sign-in",
	podcastEpisodeFindings: [
		{
			findingId: "7a1d43c8-52be-4e09-b6f3-9c0a2d5e8303",
			title: "How we made our slowest endpoint fast by dropping OFFSET",
			sourceHost: "engineering.tallgrass.example",
			snippet:
				"Tallgrass replaced offset pagination with keyset pagination on its activity feed and cut the endpoint's 95th percentile latency from 840 milliseconds to 35.",
			relevanceExplanation:
				"The reader's product pages through large tables the same way, so the fix applies to them directly.",
			content: [
				"Our activity feed endpoint was the slowest in the product.",
				"Priya Raman, the engineer who led the fix, traced it to OFFSET pagination: to return page 2,000, Postgres read and threw away every row before it.",
				"The activity table holds 60 million rows, and the endpoint's 95th percentile latency was 840 milliseconds.",
				"The team switched to keyset pagination, where each request asks for the rows after the last one it saw, using the index on account, creation time, and id that the table already had.",
				"The 95th percentile dropped to 35 milliseconds, and it no longer grows with the page number.",
				'"The index was already there, and we just stopped ignoring it," Raman said.',
				"The tradeoff is that the feed lost its jump-to-page control. A reader can only move to the next page or the previous one.",
			].join(" "),
		},
		{
			findingId: "c94f0b6e-3a17-4d82-8e5c-1b7f6a2d9404",
			title: "Postgres 18's asynchronous I/O, measured on a cloud disk",
			sourceHost: "pagecacheweekly.example",
			snippet:
				"A benchmark of Postgres 18's asynchronous I/O found that a scan of a table larger than memory ran about 2.4 times faster with io_method set to io_uring than with it set to sync.",
			relevanceExplanation:
				"The reader runs one database on a cloud disk and asked whether a release changes what they should do.",
			content: [
				"Postgres 18 can read from disk asynchronously, controlled by a new setting named io_method.",
				"Dmitri Volkov benchmarked it on a cloud virtual machine with 16 gigabytes of memory and a network disk, scanning a 100 gigabyte table so that most reads missed the cache.",
				"With io_method set to sync, which matches the old behavior, a full sequential scan took 412 seconds.",
				"With worker, the default in Postgres 18, it took 228 seconds.",
				"With io_uring it took 171 seconds, about 2.4 times faster than sync.",
				"Volkov saw no change for index lookups that read a few pages at a time, and he notes that writes are not asynchronous in this release.",
				'"If your working set fits in memory, you will not notice any of this," he writes.',
			].join(" "),
		},
	],
}

// two Findings, the first an interview whose stored content has three quotable sentences
const QUOTABLE_SOURCE_CASE: PodcastEpisodeScriptCase = {
	description:
		"a chapter paraphrases a quotable source and quotes three short sentences at most, with the source named",
	topicName: "Solo game development",
	topicPrompt:
		"I'm building my first game alone, on nights and weekends. I want what worked for other solo developers: scope, demos, and launch.",
	podcastEpisodeFindings: [
		{
			findingId: "e05b7f31-94c6-4a2d-b18e-6d3c9f0a7505",
			title: "Tomas Hale on shipping Lantern Tide alone",
			sourceHost: "longrest.example",
			snippet:
				"Solo developer Tomas Hale says he cut the crafting system from Lantern Tide a week before launch, and that an early demo did more for the game than its trailers.",
			relevanceExplanation:
				"The reader is scoping a first solo game and asked what other solo developers cut and when they showed a demo.",
			content: [
				"Tomas Hale spent four years building Lantern Tide, a sailing game about delivering mail between islands, on nights and weekends. He shipped it in May.",
				"Looking back, he says the hardest decision was a late one.",
				'"I cut the crafting system the week before launch, and nobody has ever asked for it back," he said.',
				"Crafting had taken him about five months to build.",
				"Hale put out a playable demo fourteen months before launch, when the game had one island and twenty minutes of play.",
				'"A demo is a promise you can actually keep," he said.',
				"The demo brought in about 9,000 wishlists, more than his two trailers combined. He is careful about what that number means.",
				'"Wishlists don\'t pay rent, but they tell you who is listening," he said.',
				"About one in ten of those wishlists became a sale in the first month.",
				"His advice for a first game is to pick the one thing players do most and finish only that.",
			].join(" "),
		},
		{
			findingId: "18d2a6c9-7b40-4e53-9f0a-c5e1b3d7f606",
			title: "What a two-week launch discount did to our first month",
			sourceHost: "smallbatchgames.example",
			snippet:
				"A two-person studio found that 62 percent of its first-month sales came in the first three days of a 15 percent launch discount.",
			relevanceExplanation: "The reader is planning a launch and asked how other small developers priced theirs.",
			content: [
				"Small Batch Games launched its puzzle game Gridlock Garden at 14 dollars, with a 15 percent discount for the first two weeks.",
				"Of the 4,100 copies it sold in the first month, 62 percent sold in the first three days.",
				"Sales fell to about 40 copies a day once the discount ended.",
				"The studio's Nora Whitfield writes that the discount mattered less than the deadline it created: players who had wishlisted the game got an email with an end date.",
				"She would run the same discount again, but for one week instead of two, because the second week added only 300 sales.",
			].join(" "),
		},
	],
}

// four Findings on two themes, gear and streets, so the title and the description have several chapters to name
const TWO_THEME_CASE: PodcastEpisodeScriptCase = {
	description: "the title and the description are specific to the chapters, and every length stays within its limit",
	topicName: "Commuting by bike in a rainy city",
	topicPrompt:
		"I ride to work all year in Riverton, where it rains most days. I want gear that holds up, and news about the streets I ride on.",
	podcastEpisodeFindings: [
		{
			findingId: "5c8e2f17-0a93-4b6d-8d41-f2a7e6b09707",
			title: "A year of daily rain on one waxed chain",
			sourceHost: "wetweathercyclist.example",
			snippet:
				"A commuter rode 5,200 kilometers through a wet year on one hot-waxed chain and measured a third of the wear an oiled chain showed in less distance.",
			relevanceExplanation: "The reader rides in rain most days and asked for gear that holds up.",
			content: [
				"I commute 22 kilometers a day, all year, in a city with about 180 rain days.",
				"Last year I ran one hot-waxed chain for 5,200 kilometers and waxed it again every 300 kilometers, or after any ride that left it soaked.",
				"At the end, a chain checker showed 0.25 percent wear.",
				"The oiled chain I ran the year before reached 0.75 percent, the point where a chain should be replaced, at 3,100 kilometers.",
				"The cost is time: each waxing took me about twenty minutes, counting the slow cooker warming up.",
				"I keep two chains and swap them, so the bike never waits on the wax.",
			].join(" "),
		},
		{
			findingId: "a3b90d5e-6f24-4c18-b7e9-08d1c4f2a808",
			title: "Full fenders against clip-on guards, tested in a downpour",
			sourceHost: "thedryline.example",
			snippet:
				"A spray test found that full-length fenders with a mud flap kept a rider's feet nearly dry, while clip-on guards only stopped the stripe up the back.",
			relevanceExplanation: "The reader asked what gear holds up when it rains most days.",
			content: [
				"We rode one bike through a spray rig at 25 kilometers an hour with three setups, and weighed how much water a cotton sock picked up in ten minutes.",
				"With no guards, the sock gained 140 grams.",
				"With clip-on guards it gained 120 grams, though the stripe up the rider's back was gone.",
				"With full-length fenders and a front mud flap that ended 10 centimeters above the ground, the sock gained 15 grams.",
				"The flap mattered most: the same full fenders without it left the sock at 70 grams.",
			].join(" "),
		},
		{
			findingId: "d7146a8b-2e59-4f03-a6c2-9b5f0e3d1909",
			title: "The council votes to protect the Harbor Street bike lane",
			sourceHost: "rivertongazette.example",
			snippet:
				"Riverton's council approved concrete curbs for the Harbor Street bike lane, with construction starting in September.",
			relevanceExplanation: "The reader rides to work in Riverton and asked for news about the streets they ride on.",
			content: [
				"The Riverton city council voted 6 to 3 on Tuesday to replace the painted bike lane on Harbor Street with a lane protected by concrete curbs.",
				"The project covers 2.4 kilometers between Mill Road and the ferry terminal and is budgeted at 3.1 million dollars.",
				"Construction starts in September and is planned to take ten weeks, one block at a time, with a signed detour on Alder Street.",
				"Council member Rosa Delgado, who sponsored the plan, said parked delivery vans had blocked the painted lane on most weekday mornings.",
				'"Paint is a suggestion, and a curb is a decision," Delgado said.',
				"The lane keeps its current width of 1.8 meters.",
			].join(" "),
		},
		{
			findingId: "42f9c1d0-b8a6-4e7c-9a35-7e0d2b6c5a10",
			title: "Riverton clears three bike routes before the morning commute",
			sourceHost: "streetsofriverton.example",
			snippet:
				"In a pilot, Riverton cleared leaves and standing water from three bike routes before the morning commute and counted 18 percent more riders on them in November than a year before.",
			relevanceExplanation: "The reader rides all year and asked for news about the streets they ride on.",
			content: [
				"Riverton's public works department ran a pilot from October through December on three bike routes, including the river path.",
				"Crews swept leaves and cleared blocked drains on those routes by 6:30 each weekday morning, before they worked on car lanes.",
				"Counters on the three routes logged 18 percent more riders in November than in the November before, while a counter on a route outside the pilot logged 2 percent fewer.",
				"The department says the pilot cost 84,000 dollars, and that most of the work was clearing drains, since standing water was what riders reported most.",
				"The council decides in February whether to extend the pilot to every route on the bike network.",
			].join(" "),
		},
	],
}

// every case that the eval runs, in the order that the report lists the cases
export const PODCAST_EPISODE_SCRIPT_CASES: PodcastEpisodeScriptCase[] = [
	THIN_INPUT_CASE,
	SUPPORTED_CLAIMS_CASE,
	QUOTABLE_SOURCE_CASE,
	TWO_THEME_CASE,
]
