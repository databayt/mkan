/**
 * What the agent may say when a tenant asks about renting rather than for a
 * home — built from the same constants the cost cards use and the areas the
 * agent searches, so an answer can never drift from what the product does.
 * The writer answers only from these lines (writer.ts).
 */
import { NEIGHBOURHOODS } from "./areas";
import { KIGALI_LONG_TERMS, SERVICE_FEE_PCT, typicalMoveInMultiple } from "./cost";

const byDistrict = (code: string) =>
  NEIGHBOURHOODS.filter((n) => n.district === code)
    .map((n) => n.name)
    .join(", ");

const t = KIGALI_LONG_TERMS;

export const KNOWLEDGE: readonly string[] = [
  `Monthly rent in Kigali is usually arranged through a broker. Brokers typically ask ${t.monthsInAdvance} months of rent in advance, a deposit of half a month's rent, a commission of ${t.commissionPct[0] * 100}–${t.commissionPct[1] * 100}% of one month's rent, and a viewing fee of about RWF ${t.viewingFee.toLocaleString("en")}. Moving in therefore costs about ${typicalMoveInMultiple()} times the monthly rent. These are typical terms; the broker confirms the final ones.`,
  "When a broker's ad states its own terms — the deposit, the commission, a viewing fee — Mkan's card uses them and marks them \"from the ad\"; where the ad is silent the card shows what is typical in Kigali and marks it \"typical\". A home its owner posts has no broker commission. Pay a viewing fee only to see a home, and nothing more before you have seen it.",
  "Water in Kigali comes from WASAC, the public utility. Supply can stop for hours or days in some areas, so many homes have a water tank, and tenants ask about one. Some rents include water; in others the tenant pays the WASAC bill. Mkan's card says whether the ad includes water, says it is paid separately, or says the ad does not state it.",
  "Electricity in Kigali is prepaid: tenants buy units (Cash Power, from REG) by mobile money or at an agent and type the token into the meter. Usually the tenant pays their own electricity; a few rents include it. Ask whether the home has its own meter.",
  "Kigali homes come as apartments (a flat in a building), self-compound houses (a house with its own gate and yard), single rooms (often called self-contained: a room with its own bathroom) and studios. Long-term homes are mostly unfurnished; furnished homes cost more.",
  `Short stays (paid by the night) are booked on Mkan: the nights times the nightly price, plus cleaning if the host charges it, plus Mkan's ${SERVICE_FEE_PCT * 100}% service fee.`,
  "Mkan searches real homes in Kigali, groups repeated ads of the same home, and ranks what fits the search. For a broker's home, Mkan asks the broker whether it is still available; a home is marked confirmed only after the broker answers, and a viewing is booked only after the broker confirms the time. Never pay anything before seeing a home.",
  `Kigali has three districts. Gasabo: ${byDistrict("GASABO")}. Kicukiro: ${byDistrict("KICUKIRO")} (Kanombe is by the airport). Nyarugenge, the city centre and west: ${byDistrict("NYARUGENGE")}. Students look near the University of Rwanda campuses (Nyarugenge, Gikondo, Remera), ULK in Gisozi and Kigali Innovation City; offices and ministries are around Kimihurura and Kacyiru.`,
  "Mkan remembers a tenant's budget, areas and must-haves — on their device, or on their account when they sign in — so they do not have to repeat them. They can see, change or erase it under the ☰ menu, in Memory. Phone numbers and emails are never kept.",
];
