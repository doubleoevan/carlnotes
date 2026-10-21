// the theme song's lyrics, which the theme song's note shows under its credits. an empty string shows no lyrics.
// a blank line starts a section, and a section's first line is its heading, such as Verse 1 or Chorus
export const THEME_SONG_LYRICS =
	"Verse 1\n" +
	"You shine the brightest light around you\n" +
	"Love that about you, honey\n" +
	"I’ve loved you since the night I found you\n" +
	"Love that about you, honey\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Verse 2\n" +
	"I like to be within your cuddle\n" +
	"Love that about you, honey\n" +
	"You melt my heart just like a puddle\n" +
	"Love that about you, honey \n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Bridge\n" +
	"I see something special when I look into your eyes \n" +
	"Kisses sweet as honey always take me by surprise\n" +
	"\n" +
	"Verse 3\n" +
	"You’ve got the kindest smile to look on\n" +
	"love that about you, honey\n" +
	"this love’s the kind to write a book on\n" +
	"love that about you, honey\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Verse 2 Reprise\n" +
	"I like to be within your cuddle\n" +
	"Love that about you, honey\n" +
	"You melt my heart just like a puddle\n" +
	"Love that about you, honey\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Bridge Reprise\n" +
	"I see something special when I look into your eyes\n" +
	"Kisses sweet as honey always take me by surprise\n" +
	"\n" +
	"Verse 3 Reprise\n" +
	"You’ve got the kindest smile to look on\n" +
	"love that about you, honey\n" +
	"this love’s the kind to write a book on\n" +
	"love that about you, honey\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n" +
	"\n" +
	"Chorus\n" +
	"You’ve got the time it takes\n" +
	"and I’ve got a heart that aches\n" +
	"So let’s take a coffee break\n" +
	"and hold each other tight.\n"

// one section of the lyrics: its heading and its lines
export type LyricsSection = { heading: string; lines: string[] }

/**
 * Splits lyrics into sections at blank lines, each section headed by its first line.
 */
export function toLyricsSections(lyrics: string): LyricsSection[] {
	// each block of lines between blank lines, without the blocks that hold no text
	const sectionBlocks = lyrics
		.split(/\n\s*\n/)
		.map((sectionBlock) => sectionBlock.trim())
		.filter(Boolean)

	// the block's first line is its heading, and the rest are its lines
	return sectionBlocks.map((sectionBlock) => {
		const [heading = "", ...lines] = sectionBlock.split("\n").map((line) => line.trim())
		return { heading, lines }
	})
}
