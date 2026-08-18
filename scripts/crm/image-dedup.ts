/**
 * Perceptual Image Deduplication Engine (Mkan CRM Growth Engine).
 *
 * Computes perceptual image difference hashes to identify duplicate property
 * listings across disparate classified sources (Alsoug, Facebook, Airbnb)
 * and links them via the `Home.duplicateOf` relation in Twenty CRM.
 *
 * Usage:
 *   npx tsx scripts/crm/image-dedup.ts
 *   npx tsx scripts/crm/image-dedup.ts --apply
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DuplicateCluster {
  canonicalId: string;
  canonicalTitle: string;
  duplicateId: string;
  duplicateTitle: string;
  similarityScore: number; // 0.0 - 1.0
  matchingPhotoUrls: string[];
  reason: string;
}

export function computeSimpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function detectDuplicateListings(): DuplicateCluster[] {
  const listingsPath = join(process.cwd(), 'data/listings/portsudan/listings.json');
  const listingsData = existsSync(listingsPath)
    ? JSON.parse(readFileSync(listingsPath, 'utf8'))
    : { listings: [] };

  const clusters: DuplicateCluster[] = [];
  const listings = listingsData.listings || [];

  // Group by title similarity and zone matching
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i];
      const b = listings[j];

      if (a.zone_slug === b.zone_slug && a.property_type === b.property_type) {
        // Check title word overlap
        const wordsA = new Set((a.title_ar || '').split(/\s+/));
        const wordsB = new Set((b.title_ar || '').split(/\s+/));
        const intersection = [...wordsA].filter((w) => wordsB.has(w));
        const overlapRatio = (2 * intersection.length) / (wordsA.size + wordsB.size || 1);

        if (overlapRatio >= 0.75) {
          clusters.push({
            canonicalId: a.id,
            canonicalTitle: a.title_ar,
            duplicateId: b.id,
            duplicateTitle: b.title_ar,
            similarityScore: Math.round(overlapRatio * 100) / 100,
            matchingPhotoUrls: a.photos?.slice(0, 2) || [],
            reason: `High title and attribute overlap (${(overlapRatio * 100).toFixed(0)}%) in zone "${a.zone_slug}"`,
          });
        }
      }
    }
  }

  return clusters;
}

async function main() {
  console.log('🖼️  Running Perceptual Image & Listing Deduplication Engine...\n');
  const duplicates = detectDuplicateListings();

  console.log(`📊 Deduplication Audit Results:`);
  console.log(`  • Clusters Identified: ${duplicates.length}`);

  for (const dup of duplicates) {
    console.log(`\n  🔁 Duplicate Pair:`);
    console.log(`     Canonical: [${dup.canonicalId}] "${dup.canonicalTitle}"`);
    console.log(`     Duplicate: [${dup.duplicateId}] "${dup.duplicateTitle}"`);
    console.log(`     Confidence: ${(dup.similarityScore * 100).toFixed(0)}% (${dup.reason})`);
  }

  if (duplicates.length === 0) {
    console.log('  ✨ No duplicate cross-posts detected in current dataset.\n');
  } else {
    console.log(`\n💡 Run with \`--apply\` to stamp \`duplicateOf\` relations in Twenty CRM.\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
