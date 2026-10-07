## Context

`encodePodcastEpisode` downloads the rendered chapters, 24 kHz mono 16-bit WAV files, and `joinChapterFiles` runs one
ffmpeg pass: the concat demuxer joins the chapters, `loudnorm` normalizes them to -16 LUFS, and libmp3lame encodes a
64 kbps mono MP3 at 44.1 kHz. The chapter times come from the chapter files' byte sizes, and `publishPodcastEpisode`
saves those times and the duration that the player, the chapters file, and the feed read. The song's master is a
48 kHz stereo 24-bit WAV of 199.5 seconds.

## Goals / Non-Goals

**Goals:**

- Every Podcast Episode rendered after the deploy opens and closes with the theme, under the talk at both ends.
- One encode and one loudness pass per episode, as today.
- Chapter times and the duration match the mixed audio.
- The theme song's artist is credited on the episode page, in the feed, and in the docs.

**Non-Goals:**

- Re-rendering an existing episode with the music.
- A theme per topic or per user.
- Music between chapters.

## Decisions

**The clips are cut once and committed.** The intro is the master's first 60 seconds and the outro its last 60, each
converted to 44.1 kHz mono 16-bit with `-bitexact` and no metadata, so each file has a plain 44-byte WAV header:

```
ffmpeg -i CoffeeBreak.wav -t 60 -ac 1 -ar 44100 -c:a pcm_s16le -map_metadata -1 -bitexact theme-intro.wav
ffmpeg -sseof -60 -i CoffeeBreak.wav -ac 1 -ar 44100 -c:a pcm_s16le -map_metadata -1 -bitexact theme-outro.wav
```

A clip's length is its audio bytes divided by 88,200 bytes a second, the way a chapter's length comes from its bytes.
The worker finds a clip beside its own module, under `worker/assets/podcast/`, and skips a clip that is not there.

**The mix goes in the existing ffmpeg pass.** With a clip present, `joinChapterFiles` adds each clip as an input and
replaces `-af loudnorm` with a filter graph: the speech resamples to 44.1 kHz and is delayed by the lead, the intro gets
its fade in, its duck, and its fade out, the outro gets its duck and its rise and is delayed to start 20 seconds before
the last word, `amix` adds the three at their own levels with `normalize=0`, and `loudnorm` runs on the sum. The encode
arguments after the graph are unchanged. With neither clip, the arguments are exactly today's.

**Each timing is a named constant.** The fade in is 2 seconds, the lead 40, the duck -18 dB, the fade out 8, the outro's
overlap 20, and the rise 2. The duck also has a 1 second ramp, ending as the cold open starts, so the music does not
drop in one frame. Each constant sits in `worker/podcast/podcastEpisodeTheme.ts` for editing by ear.

**The times shift where the audio does.** `toThemedEpisodeTimes` takes the speech's chapter times and the clips that
exist. With the intro, every chapter starts and ends 40 seconds later. With the outro, the duration adds the outro's
length past the overlap, 40 seconds for a 60 second clip. The duration is never shorter than the intro clip, in case a
short episode's talk ends before the intro does. The player already counts the lead as the first chapter.

**The credits are one config entry.** `PODCAST_THEME_SONG` in `shared/podcastEpisodes.ts` holds the title, the artist,
the YouTube url, the songwriter with the copyright year and the songwriter's site, and the producer, and three constants
write the credit lines for the feed. The YouTube url is stored without the share link's tracking parameter.

**The credits sit in a note's popup.** `ThemeSongNote` is the note icon that the topic note uses, with a popup of the
credits, beside the podcast's name and each episode title. `PodcastEpisodeDetails` shows it beside the card's title but
not in the hover tooltip that also reads the details. The topic page's podcast section heading is an accordion trigger,
so `CollapsibleSection` takes a `titleNote` that sits after the trigger instead of inside it.

## Risks / Trade-offs

- [Two binary files in the repo] → about 10.6 MB together, committed once. Re-cutting with the commands above replaces
  them.
- [The music counts toward the episode's loudness] → `loudnorm` measures the whole mix, so full-volume music at both
  ends can lower the talk a little. The duck level and the fades are constants to edit by ear.
- [The outro is placed by the measured speech length] → the speech's length comes from its byte sizes, as the chapter
  times do, so the outro lands under the goodbye as long as those byte sizes are right.

## Migration Plan

No schema change. The first episode that renders after the deploy gets the music, and existing episodes keep their
audio and their times.
