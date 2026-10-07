## Why

A Coffee Break episode starts on Carl's first word and stops on the last goodbye, with nothing around the talk that says
this is a show. A friend's song gives every episode a theme: it opens under the cold open and closes under the goodbye,
the way a radio show does, and the song's artist gets a credit wherever the podcast is listed.

## What Changes

- Two clips cut once from the song's master WAV, the first 60 seconds and the last 60 seconds, are committed under
  `worker/assets/podcast/` as 44.1 kHz mono 16-bit WAV files, so render time never decodes or resamples the song. The
  master stays off the repo. The runtime image already copies `worker/`, so the worker reads the clips from its own disk.
- The intro clip fades in, plays at full volume until the cold open starts 40 seconds in, ducks to about -18 dB under
  the talk, and fades out to end at its 60 second mark. The outro clip starts at about -18 dB under the last 20 seconds
  of the goodbye, rises to full volume over 2 seconds after the last word, and plays its last 40 seconds to its natural
  end. Each timing and level is a named constant, to edit by ear.
- The music mixes at 44.1 kHz in the same ffmpeg pass that joins the chapters, before the existing loudness filter, so an
  episode is still encoded once and normalized as a whole.
- With the music, every chapter time shifts by the 40 second lead, and the episode's duration includes the outro's tail,
  so the scrubber, the chapter chips, the chapters file, and the feed's durations stay right.
- If a clip is missing, an episode renders without that clip. With neither clip, an episode encodes exactly as it does
  today. Only an episode rendered after the deploy gets music, and an existing episode keeps its audio.
- The song's credits live in one config entry: its title, its artist, its YouTube url, its songwriter with the copyright
  year and the songwriter's site, its producer, and its drummer. A note icon beside the podcast's section heading and
  beside each episode title opens a popup headed Coffee Break Theme Song with the credits, on the episode page and in
  the player card on both pages. Each podcast feed's channel description and the Coffee Break docs page carry the same
  credits.
- The popup shows the song's lyrics under the credits from `themeSongLyrics.ts`, each section's heading over its lines.
  The lyrics are pasted into that file by hand, and the popup shows none while it is empty.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-rendering`: theme music opens and closes every new Podcast Episode, mixed in the join's one ffmpeg
  pass, with chapter times and the duration that include it
- `podcast-episode-pages`: a note beside the podcast's name and each episode title credits the theme song
- `podcast-feeds`: a podcast feed's channel description credits the theme song

## Impact

- `worker/assets/podcast/theme-intro.wav` and `theme-outro.wav`: the two committed clips, about 5.3 MB each.
- `worker/podcast/podcastEpisodeTheme.ts`: the clips, the timing and level constants, the mix's filter graph, and the
  shifted times. `worker/podcast/podcastEpisodeAudio.ts`: the join mixes the clips that exist and returns the shifted
  times.
- `shared/podcastEpisodes.ts`: the theme song's config entry and its credit lines.
- `ui/src/components/podcast/ThemeSongNote.tsx` and `themeSongLyrics.ts`: the note, its popup, and the lyrics file,
  with the note placed by `PodcastEpisodePage.tsx`,
  `PodcastEpisodeDetails.tsx`, and `PodcastEpisodePlayer.tsx` through a `titleNote` slot on `CollapsibleSection`.
- `api/share/podcastFeed.ts` and `docs/src/content/docs/feed/coffee-break.md`: the credits.
- No schema change. The Dockerfile is unchanged.
