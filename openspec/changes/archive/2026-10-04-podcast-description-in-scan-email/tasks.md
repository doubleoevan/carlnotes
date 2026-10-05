## 1. The summary in the scan emails

- [x] 1.1 Read the Podcast Episode's description in `toScanEmailPodcastEpisode` in `worker/notify.ts`, and pass it to
  the template as `description`
- [x] 1.2 Add `description` to `TopicScanEmailPodcastEpisode`, show it in `PodcastEpisodeSection` under the cover beneath
  an "Episode summary" heading, and add it to the preview props
- [x] 1.3 Test that the digest and the manual report show the summary, and that an episode with no description shows none
