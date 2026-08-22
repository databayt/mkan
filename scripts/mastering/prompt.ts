/**
 * The canonical mastering prompt — version-controlled, one per pipeline.
 *
 * The prompt is compiled here and FROZEN onto each MasteringRun at queue time:
 * this file will evolve (v2, v3…), but what a given image was actually asked
 * for must never change under it, or the record of why a photo looks the way
 * it does becomes fiction. Bump PROMPT_VERSION on ANY text change.
 *
 * The one rule that outranks quality: same property, same reality. The model
 * improves the photograph, never the property (docs/image-mastering.md §honesty).
 */

export const PROMPT_VERSION = 'v1';

/** Executor tag for the human Gemini-app lane (Nano Banana in the web UI). */
export const MODEL_HUMAN_WEB = 'nano-banana-web';

const PROMPT_V1 = `Transform this low-quality listing photo as if a world-class professional real-estate photographer had taken it with a modern high-end camera.

Treat the supplied image as the source of truth for the property. Keep the exact scene intact: preserve the real architecture, room layout and dimensions, furniture, fixtures, windows, doors, surfaces, colors, views, and every object genuinely present. Do not invent, add, remove, relocate, or materially alter anything. Do not conceal meaningful defects. Do not make the property look larger, newer, or more luxurious than it really is.

Elevate only the photography: perfect natural lighting, precise composition, professional camera angle and perspective, correct white balance and exposure, high dynamic range, sharp detail, faithful texture and color. Correct amateur problems — tilt, bad framing, blur, noise, poor crop. Recompose as a professional 4:3 landscape listing photograph rather than preserving a poor original crop.

The result must look like a genuine photograph taken professionally, not an AI-generated image: no plastic smoothing, no unrealistic lighting, no artificial textures, no added text or watermarks. Same property, same reality, dramatically better photography.`;

/**
 * Compile the prompt for one photo. `roomHint` (e.g. "bedroom", "kitchen")
 * grounds the model when the queue step knows the room — optional, and v1
 * queues without it.
 */
export function compilePrompt(opts: { roomHint?: string | null } = {}): string {
  const hint = opts.roomHint?.trim();
  return hint ? `${PROMPT_V1}\n\nContext: this photo shows the property's ${hint}.` : PROMPT_V1;
}
