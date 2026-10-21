/**
 * The Facebook lane's parser and prompt. Fixtures are made up in the shapes
 * Facebook's GraphQL returns — the repo is public, so no real posts or numbers.
 */
import { describe, expect, it } from 'vitest';
import { postsIn } from '../../scripts/crm/facebook-rentals';
import { buildFacebookPrompt, buildTikTokPrompt } from '../../scripts/crm/tiktok-read-prompt';

const story = {
  data: {
    node: {
      group_feed: {
        edges: [
          {
            node: {
              __typename: 'Story',
              post_id: '1111222233334444',
              comet_sections: {
                content: { story: { message: { text: '2 bedroom house for rent in Kicukiro 350k call 0788000111' } } },
                context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: 1792400000, url: 'https://www.facebook.com/groups/999/posts/1111222233334444/' } }] } } },
                actor_photo: { story: { actors: [{ name: 'Jean Broker', id: '100000000000001' }] } },
              },
              attachments: [{ styles: { attachment: { all_subattachments: { nodes: [{ media: { image: { uri: 'https://scontent.xx.fbcdn.net/v/t39/big1.jpg' } } }] } } } }],
            },
          },
        ],
      },
    },
  },
};

const listing = {
  data: {
    marketplace_search: {
      feed_units: {
        edges: [
          {
            node: {
              listing: {
                id: '5555666677778888',
                marketplace_listing_title: '3 bedroom apartment for rent',
                listing_price: { formatted_amount: 'RWF 600,000', amount: '600000' },
                location: { reverse_geocode: { city_page: { display_name: 'Kigali' } } },
                primary_listing_photo: { image: { uri: 'https://scontent.xx.fbcdn.net/v/t45/listing.jpg' } },
                marketplace_listing_seller: { name: 'Aline', id: '100000000000002' },
              },
            },
          },
        ],
      },
    },
  },
};

describe('postsIn', () => {
  it('reads a group Story: text, time, author, permalink, photos', () => {
    const [p] = postsIn(story);
    expect(p).toMatchObject({
      postId: '1111222233334444',
      kind: 'group',
      author: 'Jean Broker',
      createdAt: 1792400000,
      url: 'https://www.facebook.com/groups/999/posts/1111222233334444/',
    });
    expect(p!.text).toContain('350k');
    expect(p!.photoUrls).toEqual(['https://scontent.xx.fbcdn.net/v/t39/big1.jpg']);
  });

  it('reads a Marketplace listing: title, price and city become the text', () => {
    const [p] = postsIn(listing);
    expect(p).toMatchObject({ postId: 'mp:5555666677778888', kind: 'marketplace', author: 'Aline', url: 'https://www.facebook.com/marketplace/item/5555666677778888/' });
    expect(p!.text).toBe('3 bedroom apartment for rent · RWF 600,000 · Kigali');
  });

  it('skips a Story with no message, and ignores small avatar images', () => {
    expect(postsIn({ __typename: 'Story', post_id: '1', x: { uri: 'https://scontent.xx/p40x40/a.jpg' } })).toEqual([]);
  });
});

describe('buildFacebookPrompt', () => {
  const v = { handle: 'Jean Broker', channel: null, caption: '2 bedroom house for rent 350k', uploadedAt: '2026-10-20', frames: ['photo 1'] };
  it('reads a post, not a video, and drops the transcript', () => {
    const p = buildFacebookPrompt(v);
    expect(p).toContain('one Facebook post');
    expect(p).toContain('photos from the post, attached');
    expect(p).not.toContain('TRANSCRIPT');
    expect(p).not.toContain('Whisper');
    expect(p).toContain('POST TEXT:');
  });
  it('leaves the TikTok prompt untouched', () => {
    const t = buildTikTokPrompt({ ...v, transcript: 'hi', framesMode: 'attached' });
    expect(t).toContain('one TikTok video posted in Rwanda');
    expect(t).toContain('TRANSCRIPT:\nhi');
  });
});
