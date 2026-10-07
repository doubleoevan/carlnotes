## 1. Cut the clips

- [x] 1.1 Cut `worker/assets/podcast/theme-intro.wav` from the master's first 60 seconds and `theme-outro.wav` from its
  last 60 seconds, each 44.1 kHz mono 16-bit with a plain WAV header, and commit them without the master

## 2. Mix the theme into the join

- [x] 2.1 Add `worker/podcast/podcastEpisodeTheme.ts` with the clips' paths, the timing and level constants, the clips
  that exist and their lengths, the mix's filter graph, and `toThemedEpisodeTimes`
- [x] 2.2 Mix the clips that exist in `joinChapterFiles` before `loudnorm`, keeping today's arguments with neither clip
- [x] 2.3 Return the shifted chapter times and the duration with the outro's tail from `encodePodcastEpisode`

## 3. Credit the song

- [x] 3.1 Add `PODCAST_THEME_SONG` and `PODCAST_THEME_SONG_CREDIT` to `shared/podcastEpisodes.ts`
- [x] 3.2 Show the credits in a note popup beside the podcast's name and each episode title, in the feed's channel
  description, and on the Coffee Break docs page
- [x] 3.3 Head the popup with a centered Coffee Break Theme Song, add the drumming credit, and show the lyrics from
  `themeSongLyrics.ts` by section in the shared `ScrollBox`, with a test for the sections, and end the popup with a
  bold Enjoy 😊 link to the video

## 4. Tests and docs

- [x] 4.1 Extend `podcastEpisodeAudio.test.ts`: with both clips the chapter times shift and the duration includes the
  tail, without clips the join's arguments match today's, and a join with both clips writes one mono MP3 of the mixed
  length
- [x] 4.2 Test that the committed clips are 44.1 kHz mono 16-bit, and that the feed's channel description ends with the
  credit
- [x] 4.3 Update `worker/AGENTS.md` for the assets folder and the theme module, and `ui/AGENTS.md` for the note
