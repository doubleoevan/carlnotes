# Animated Finding chapters

## Context

The shipped montage already uses source and generated pictures, full-frame camera movement, the recorded narration and source attribution. In dev review, placing the pictures in smaller frames made their detail harder to see. The accepted full-frame example uses steam drifting above both mugs, falling envelopes and rippling harbor reflections. The final camera acts on all the layers together.

## Decisions

**Animate an approved picture.** Each source is identified by its bytes. An authored silent loop can move the subject while the surrounding artwork stays intact. A soft highlight travels up each plume on its own cycle and drifts sideways. The same host illustration uses the steam clip in chapter shots, hot takes, the opening and the sign-off. The hosts, cups and microphone stay fixed relative to the desk. A trusted QA catalog can hold other reviewed clips.

**Select a region from the actual pixels.** For up to ten eligible public pictures per chapter, the planner sees the whole picture alongside numbered close-ups. The model can confirm a crop or skip the picture. Each number identifies a predefined effect and a region inside the foreground. Photos allow water, steam, rain and reflected light. Illustrations also allow foliage and paper. A failed selection keeps the original shot. A reservation in the episode-owned plan covers concurrent attempts. Retries reuse the saved choices.

**Keep the original montage encoder.** FFmpeg takes a still or the appropriate successive frames of its reviewed animation as input. Both then use the same shot planner, zoompan expression, picture proportions, lower third and dissolve. A crossfade reads the outgoing clip from the frame at which its previous shot ended. Each chapter’s exact frame count is checked before assembly.

**Persist and publish once.** Private episode-owned plans contain approved input and animation file hashes, camera moves, and exclusive frame endpoints. The database film lock serializes writes. Unique upload keys and the existing guarded publication of the replacement film preserve playable files during a retry. The recorded episode’s completion and spend policy stay in force.

**Keep rendering bounded.** A worker runs one film attempt at a time and isolates films from scans and audio. FFmpeg runs outside the JavaScript event loop, receives a cancellation signal and has a per-shot deadline. Three.js and offline Chromium remain available for authoring and reviewing reusable animations. Public film playback needs only the finished media.

## Verification and rollout

The original, framed and revised paths are identified separately in verification.md. Check the generated-only, fetched-image and long chapters, plus a complete episode. A matched comparison uses the same assets, audio, frame rate and render allocation. Segregate idle capacity, active compute and provider charges. Verify captions, chapter seeks, image moderation and ready-file preservation before rollout.

The recording worker selects its render version when it dispatches the film. Enable the new version on dev first. Removing the admission setting and restarting the recording worker restores original montages for new recordings while already admitted work drains. Existing films keep playing and receive an optional selected upgrade. The production backfill stays on its existing version. Row 67.6 owns autoscaling, general checkpoints, queue priority and platform spend accounting.

**Fund generated animation by account.** New version 4 films can animate one eligible generated illustration for five seconds with Gemini Omni through LiteLLM. Reserve each exact picture once per owner and UTC calendar month, across Topics. Free receives one platform-paid shot, Plus three owner-paid shots, and Premium seven owner-paid shots. Each film can also show eight distinct local effects. Stop calling the chapter planner once those eight are selected. The hosts’ reusable steam runs on every plan. Strip generated audio and keep the published narration.
