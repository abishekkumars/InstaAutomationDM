import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaApiError, MetaInstagramClient } from '../meta-instagram-client';

// Fixtures are trimmed copies of the real 2026-08-19 response from the verification account -
// including the two rows that mattered most: a reel with `is_shared_to_feed: false` that is NOT
// a trial marker, and a CAROUSEL_ALBUM feed post.
const REEL = {
  id: '18491809921100556',
  caption: 'Comment "OFFER"',
  media_type: 'VIDEO',
  media_product_type: 'REELS',
  permalink: 'https://www.instagram.com/reel/DcL1NOOvVa4/',
  shortcode: 'DcL1NOOvVa4',
  thumbnail_url: 'https://cdn.example/thumb.jpg',
  timestamp: '2026-08-18T14:31:13+0000',
  comments_count: 24,
  like_count: 15,
};

const CAROUSEL = {
  id: '17957894318981060',
  media_type: 'CAROUSEL_ALBUM',
  media_product_type: 'FEED',
  permalink: 'https://www.instagram.com/p/Da5xB8UGU-B/',
  shortcode: 'Da5xB8UGU-B',
  media_url: 'https://cdn.example/album.jpg',
  timestamp: '2026-07-17T17:36:05+0000',
};

const TOKEN = 'IGAA-super-secret-token';

function mockFetchSequence(...pages: Array<{ status?: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const page of pages) {
    fetchMock.mockResolvedValueOnce({
      ok: (page.status ?? 200) < 400,
      status: page.status ?? 200,
      json: async () => page.body,
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listMedia', () => {
  it('maps Meta fields onto the domain shape, identifying reels by media_product_type', async () => {
    mockFetchSequence({ body: { data: [REEL, CAROUSEL] } });

    const { posts, truncated } = await new MetaInstagramClient(TOKEN).listMedia();

    expect(truncated).toBe(false);
    expect(posts).toHaveLength(2);

    // media_type is VIDEO for a reel - media_product_type is the only thing that says "reel".
    expect(posts[0]).toMatchObject({
      platformPostId: '18491809921100556',
      mediaType: 'video',
      mediaProductType: 'REELS',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      commentsCount: 24,
    });

    // A carousel has no thumbnail_url, so media_url is the correct still to fall back to.
    expect(posts[1]).toMatchObject({
      mediaType: 'image',
      mediaProductType: 'FEED',
      thumbnailUrl: 'https://cdn.example/album.jpg',
      caption: '',
    });
  });

  it('stops when Meta returns an empty page, the real end-of-list signal', async () => {
    // Meta hands back an `after` cursor even on the final page - confirmed live. A caller that
    // trusts the cursor alone loops forever, so the empty page must terminate the walk.
    const full = Array.from({ length: 100 }, (_, i) => ({ ...REEL, id: `id-${i}` }));
    const fetchMock = mockFetchSequence(
      { body: { data: full, paging: { cursors: { after: 'CURSOR' } } } },
      { body: { data: [], paging: { cursors: { after: 'CURSOR2' } } } },
    );

    const { posts, truncated } = await new MetaInstagramClient(TOKEN).listMedia();

    expect(posts).toHaveLength(100);
    expect(truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops on a short page without spending another request', async () => {
    const fetchMock = mockFetchSequence({
      body: { data: [REEL], paging: { cursors: { after: 'CURSOR' } } },
    });

    await new MetaInstagramClient(TOKEN).listMedia();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports truncated rather than silently cutting the list at the page cap', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ ...REEL, id: `id-${i}` }));
    const page = { body: { data: full, paging: { cursors: { after: 'CURSOR' } } } };
    const fetchMock = mockFetchSequence(page, page, page, page, page);

    const { posts, truncated } = await new MetaInstagramClient(TOKEN).listMedia();

    // Bounded at 5 pages - CLAUDE.md forbids unbounded loops on a request path.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(posts).toHaveLength(500);
    expect(truncated).toBe(true);
  });

  it('drops a media object with no id rather than surfacing an unusable row', async () => {
    mockFetchSequence({ body: { data: [{ media_type: 'VIDEO' }, REEL] } });

    const { posts } = await new MetaInstagramClient(TOKEN).listMedia();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.platformPostId).toBe('18491809921100556');
  });
});

describe('getMedia', () => {
  it('returns null for an unknown media id (Meta answers 400 code 100, not 404)', async () => {
    mockFetchSequence({
      status: 400,
      body: { error: { message: 'Unsupported get request.', code: 100 } },
    });

    await expect(new MetaInstagramClient(TOKEN).getMedia('nope')).resolves.toBeNull();
  });

  it('rethrows a genuine failure instead of pretending the post is missing', async () => {
    mockFetchSequence({ status: 500, body: { error: { message: 'boom' } } });

    await expect(new MetaInstagramClient(TOKEN).getMedia('x')).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe('MetaApiError', () => {
  it('flags an expired token so the caller can require a reconnect instead of retrying', async () => {
    mockFetchSequence({
      status: 400,
      body: { error: { message: 'Session has expired', code: 190, type: 'OAuthException' } },
    });

    const error = await new MetaInstagramClient(TOKEN).listMedia().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).isAuthError).toBe(true);
  });

  it('does not distinguish a wrong request as an auth failure', async () => {
    mockFetchSequence({ status: 400, body: { error: { message: 'bad field', code: 100 } } });

    const error = await new MetaInstagramClient(TOKEN).listMedia().catch((e: unknown) => e);

    expect((error as MetaApiError).isAuthError).toBe(false);
  });

  it('never leaks the access token into the error message', async () => {
    // The real request URL carries `access_token` as a query param. If the error carried the URL
    // instead of the path, every log line printing it would leak a live credential.
    mockFetchSequence({ status: 500, body: { error: { message: 'boom' } } });

    const error = await new MetaInstagramClient(TOKEN).listMedia().catch((e: unknown) => e);

    expect(String(error)).not.toContain(TOKEN);
    expect(String(error)).toContain('/me/media');
  });

  it('fails as an auth error when no token is configured, without calling Meta', async () => {
    const fetchMock = mockFetchSequence({ body: { data: [] } });

    const error = await new MetaInstagramClient('').listMedia().catch((e: unknown) => e);

    expect((error as MetaApiError).isAuthError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
