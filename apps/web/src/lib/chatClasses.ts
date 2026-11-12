// the tailwind class strings of a chat panel: the composer, its send button, and the question and reply bubbles

/**
 * The round primary button at the end of a chat composer, a phone's touch size and tighter on a pointer. The send
 * arrow, the stop square, and the mic share it.
 */
export const SEND_BUTTON_CLASS =
	"bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 sm:size-8"

/**
 * The chat composer's question box. Its text is 16px on a phone, which keeps iOS from zooming in on focus.
 */
export const COMPOSER_BOX_CLASS =
	"placeholder:text-muted-foreground w-full resize-none bg-transparent py-1 text-base leading-relaxed outline-none sm:text-sm"

/**
 * The bordered band at the bottom of a chat panel that holds the chat composer.
 */
export const COMPOSER_BAR_CLASS = "shrink-0 border-t px-3 py-2.5"

/**
 * The rounded frame around the chat composer's question box and its button row.
 */
export const COMPOSER_FRAME_CLASS = "bg-background rounded-2xl border px-3 py-2"

/**
 * A chat reply's bubble, Carl's or Vienna's, and the thinking bubble before it.
 */
export const ANSWER_BUBBLE_CLASS =
	"bg-bubble text-foreground max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm @lg:max-w-[75%]"

/**
 * How wide a user's question bubble and the tag under it grow.
 */
export const QUESTION_BUBBLE_WIDTH_CLASS = "max-w-[85%] @lg:max-w-[75%]"

/**
 * A user's question bubble in a chat turn.
 */
export const QUESTION_BUBBLE_CLASS = `bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap ${QUESTION_BUBBLE_WIDTH_CLASS}`
