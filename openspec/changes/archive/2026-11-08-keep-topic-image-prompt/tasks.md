## 1. Keep the image prompt

- [x] 1.1 Add `topic_images.image_prompt` and write it in `replaceTopicImage`, from the render activity for a prompted
  regeneration and null for the house style and an upload
- [x] 1.2 Return `imagePrompt` on the topic response to a user who may edit, null for anyone else

## 2. Show it

- [x] 2.1 Open the editor's Image prompt field with the saved prompt, keep it after a regeneration, and clear it after
  an upload
- [x] 2.2 Add the prompt to the fixtures and both apps' editor stories
