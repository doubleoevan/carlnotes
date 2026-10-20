-- give every chat turn row that predates the kind column its kind. a row that names a chat room message is carl's
-- chat room turn, and every other row keeps the private default, the voice spend rows included. no column on a voice
-- spend row says whether it was a transcription or a spoken part
UPDATE "chat_turns" SET "kind" = 'chat_room' WHERE "room_message_id" IS NOT NULL;
