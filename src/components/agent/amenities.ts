/**
 * A TikTok video's features, as the reader wrote them ("parking", "water
 * tank", "fenced compound", "furnished"), turned into listing data the agent
 * can rank on: `Amenity` values, furnishing, parking and pets. Pure — the
 * mirror (scripts/crm/tiktok-mirror.ts) writes the result onto the lead.
 */

const RULES: [RegExp, string][] = [
  [/\bparking|garage|car ?park|parking lot/i, "Parking"],
  [/water ?tank|\btank\b|reservoir|ikigega/i, "WaterTank"],
  [/generator|back ?up power|inverter|solar/i, "BackupGenerator"],
  [/wi-?fi|internet|fib(?:re|er)/i, "WiFi"],
  [/cctv|camera/i, "SecurityCameras"],
  [/garden|back ?yard|\byard\b|lawn/i, "Backyard"],
  [/balcony|terrace|veranda|patio/i, "PatioOrBalcony"],
  [/kitchen/i, "Kitchen"],
  [/washing machine|washer|laundry/i, "WasherDryer"],
  [/air ?con|\ba\/?c\b/i, "AirConditioning"],
  [/pets? (?:allowed|friendly|welcome)/i, "PetsAllowed"],
  [/\blift\b|elevator/i, "Elevator"],
  [/work ?space|office (?:room|space)|study room/i, "DedicatedWorkspace"],
];

export interface FeatureFacts {
  amenities: string[];
  furnished: boolean | null;
  isParkingIncluded: boolean;
  isPetsAllowed: boolean;
}

export function factsFromFeatures(features: readonly string[]): FeatureFacts {
  const amenities = new Set<string>();
  let furnished: boolean | null = null;
  for (const raw of features) {
    const f = raw.trim();
    if (!f) continue;
    for (const [re, amenity] of RULES) if (re.test(f)) amenities.add(amenity);
    if (/un-?furnished|not furnished|no furniture|empty house/i.test(f)) furnished = false;
    else if (/furnished/i.test(f) && furnished !== false) furnished = true;
  }
  return { amenities: [...amenities], furnished, isParkingIncluded: amenities.has("Parking"), isPetsAllowed: amenities.has("PetsAllowed") };
}
