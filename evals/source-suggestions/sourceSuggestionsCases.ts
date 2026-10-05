// the source suggestions eval's cases. a case is a Topic and the Sources that the Topic already follows.
// the topics are written for the eval. the sources that the eval suggests are real, and each one is searched for and read
import type { SuggestedSource } from "../../worker/suggest"

// one case. what it tests, its Topic, the Sources that the Topic already follows, and what its suggestions have to do
export type SourceSuggestionsCase = {
	description: string
	name: string
	prompt: string
	excludeSources: SuggestedSource[]
	// what this case's suggestions have to do beyond the checks that every case gets, graded by a model
	rubric?: string
}

// how many Sources each case's Topic can still add, and the fewest readable suggestions that a useful set has.
// a person or a narrow field may not have SUGGESTION_LIMIT sources worth following
export const SUGGESTION_LIMIT = 5
export const MIN_READABLE_SUGGESTIONS = 3

// the cases, each on a different kind of topic: a hobby, a technical subject, a company, a person, a research field,
// and a sport whose obvious sources the topic already follows
export const SOURCE_SUGGESTIONS_CASES: SourceSuggestionsCase[] = [
	{
		description: "a hobby topic gets sources that keep producing",
		name: "Home espresso",
		prompt: "Gear and technique for espresso at home. I grind before the house is awake, so noise matters.",
		excludeSources: [],
	},
	{
		description: "a technical topic gets sources specific to it",
		name: "Rust async runtimes",
		prompt: "How Tokio and the other async runtimes work inside: schedulers, wakers, io drivers, and their releases.",
		excludeSources: [],
		rubric: "Fail the output if a source covers programming in general instead of Rust or its async runtimes.",
	},
	{
		description: "a company gets sources about that company",
		name: "Rivian",
		prompt: "News about Rivian: its trucks and vans, its factories, its deliveries, and its software.",
		excludeSources: [],
		rubric: "Fail the output if a source covers electric cars in general and rarely mentions Rivian.",
	},
	{
		description: "a person gets sources by them and about them",
		name: "Andrej Karpathy",
		prompt: "What Andrej Karpathy writes, says, and builds: his blog posts, videos, talks, and projects.",
		excludeSources: [],
		rubric: "Fail the output if a source neither is by Andrej Karpathy nor regularly covers his work.",
	},
	{
		description: "a research field gets sources that follow its research",
		name: "Protein structure prediction",
		prompt: "New research and tools in protein structure prediction and design, from AlphaFold onward.",
		excludeSources: [],
		rubric: "Fail the output if a source covers biology or machine learning in general instead of this field.",
	},
	{
		description: "a topic that already follows the obvious sources still gets others",
		name: "Women's road cycling",
		prompt: "Race results, team news, and transfers in women's pro road cycling.",
		excludeSources: [
			{ sourceOption: "reddit", value: "peloton" },
			{ sourceOption: "googleNews", value: "cyclingnews.com" },
		],
	},
]
