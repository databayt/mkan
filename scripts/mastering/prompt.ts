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

export const PROMPT_VERSION = "v2";

/** Executor tag for the human Gemini-app lane (Nano Banana in the web UI). */
export const MODEL_HUMAN_WEB = "nano-banana-web";

/**
 * v1 — kept for the record only. Superseded 2026-08-24 after an adversarial
 * read found four ways it invited the model to break the honesty rule while
 * appearing to follow it. Runs queued under v1 carry their own frozen copy in
 * the database, so nothing here rewrites their history.
 */
const PROMPT_V1 = `Transform this low-quality listing photo as if a world-class professional real-estate photographer had taken it with a modern high-end camera.

Treat the supplied image as the source of truth for the property. Keep the exact scene intact: preserve the real architecture, room layout and dimensions, furniture, fixtures, windows, doors, surfaces, colors, views, and every object genuinely present. Do not invent, add, remove, relocate, or materially alter anything. Do not conceal meaningful defects. Do not make the property look larger, newer, or more luxurious than it really is.

Elevate only the photography: perfect natural lighting, precise composition, professional camera angle and perspective, correct white balance and exposure, high dynamic range, sharp detail, faithful texture and color. Correct amateur problems — tilt, bad framing, blur, noise, poor crop. Recompose as a professional 4:3 landscape listing photograph rather than preserving a poor original crop.

The result must look like a genuine photograph taken professionally, not an AI-generated image: no plastic smoothing, no unrealistic lighting, no artificial textures, no added text or watermarks. Same property, same reality, dramatically better photography.`;
void PROMPT_V1;

/**
 * v2 — the same intent, with v1's loopholes closed. Each change answers a
 * specific way v1 could produce a dishonest photo while technically obeying:
 *
 *   - "preserve every object" vs "recompose as 4:3" was a real contradiction —
 *     a portrait source cannot become landscape without either cutting content
 *     or inventing edges. Preservation now wins explicitly, and the frame is
 *     allowed to stay non-ideal rather than fabricate what was never shot.
 *   - "perfect natural lighting" invited fabricated sun, windows and lamps.
 *     Lighting must now be plausible for the light already in the scene.
 *   - "professional camera angle and perspective" permitted enough geometry
 *     change to make a room read as larger — the exact thing the honesty rule
 *     forbids. Narrowed to correcting distortion and tilt.
 *   - "dramatically better" pushed over-processing: fake HDR, plastic
 *     surfaces, blown interiors. Replaced with a sufficiency test.
 *   - "do not conceal meaningful defects" was vague about what counts. No
 *     repair, removal, cleanup or concealment at all is unambiguous.
 *   - v1 said "room" throughout, but listings also carry façades, gardens,
 *     balconies, pools and views. v2 speaks of the property.
 *   - a non-property image had no defined behaviour. It now has one exact line,
 *     so the batch lane can detect a refusal instead of ingesting a surprise.
 */
const PROMPT_V2 = `Treat this image as evidence of a real property in a homes-rental listing. Your job is photographic finishing only: return the photograph a skilled real-estate photographer would have captured of this same scene with excellent equipment and technique.

First decide whether this is a genuine photograph of a residential property or part of one, indoors or outdoors. If it is not, reply with exactly this line and transform nothing: Not a real property photo.

Preserve the property exactly as shown. Do not add, remove, relocate, conceal, replace, repair, clean up, or materially alter any architecture, layout, dimensions, furniture, fixtures, windows, doors, surfaces, finishes, colours, views, possessions, or defects. Do not make the space appear larger, newer, tidier, brighter, or more luxurious than the evidence supports. Never use generative fill or invented scene content.

Improve only the quality of the photograph:
- Correct tilt, lens distortion, perspective, exposure, white balance, noise, blur, and unhelpful framing.
- Produce a balanced, natural tonal range with faithful colours, real textures, and believable shadows.
- Use only lighting plausible for the light already in the scene. Do not add a sun direction, window, lamp, reflection, or any other light source.
- Make only the changes needed for a convincing professional result. Do not over-sharpen, smooth surfaces, stylise, or create artificial HDR.

Deliver a professionally composed 4:3 landscape photograph. Reframe conservatively: keep every meaningful feature and pictured object, and never invent unshown edges to force the aspect ratio — if the source cannot become 4:3 without cutting something meaningful or inventing what was not photographed, favour preserving the property over hitting the ratio.

The result must read as a genuine, truthful real-estate photograph: no AI-rendered appearance, plastic surfaces, altered geometry, fabricated detail, text, logos, or watermarks. Return only the transformed photograph — no commentary, alternatives, explanations, or follow-up questions.`;

/**
 * Compile the prompt for one photo. `roomHint` (e.g. "bedroom", "kitchen")
 * grounds the model when the queue step knows the room — it comes from the
 * human filename, so it is a label, never a licence: the hint may steer
 * composition and lighting for that kind of space, and must never introduce
 * décor or features the photo does not already contain.
 */
export function compilePrompt(opts: { roomHint?: string | null } = {}): string {
  const hint = opts.roomHint?.trim();
  return hint
    ? `${PROMPT_V2}\n\nContext: this photo shows the property's ${hint}. Use that only to guide composition and lighting for such a space — never to add anything characteristic of it.`
    : PROMPT_V2;
}
