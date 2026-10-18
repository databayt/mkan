/**
 * A neighbourhood as people spell it → one comparable token
 * ("Kabeza / Samuduha" → "kabeza", "Kimironko, Kwa Mushimire" → "kimironko").
 * Shared by the TikTok lane's duplicate key and the /find agent's grouping.
 */
export function placeToken(neighbourhood: string | null | undefined): string {
  return (neighbourhood ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[/,(|-]|\bkwa\b|\bnear\b/)[0]!
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
