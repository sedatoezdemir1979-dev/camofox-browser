import { describe, expect, jest, test } from '@jest/globals';
import { hasGoogleOrganicResults, pageHasGoogleOrganicResult } from '../../lib/google-serp.js';

function stubSerpDom({ host = 'www.google.com', baseUri, headings = [], container = '#rso' }) {
  const resultContainer = {
    querySelectorAll: (selector) => (selector === 'h3' ? headings : []),
  };

  globalThis.document = {
    baseURI: baseUri ?? `https://${host}/search?q=test`,
    querySelector: (selector) => (selector === container ? resultContainer : null),
  };
  globalThis.location = { hostname: host };
}

describe('pageHasGoogleOrganicResult', () => {
  afterEach(() => {
    delete globalThis.document;
    delete globalThis.location;
  });

  test('accepts a direct external link', () => {
    stubSerpDom({ headings: [{ closest: () => ({ href: 'https://example.com/page' }) }] });
    expect(pageHasGoogleOrganicResult()).toBe(true);
  });

  test('accepts a /goto wrapper on the SERP host', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'https://www.google.com/goto?url=CAES123' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(true);
  });

  test('accepts a /url wrapper on the SERP host', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'https://www.google.com/url?q=example.com' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(true);
  });

  test('accepts a /goto wrapper on a regional SERP host', () => {
    stubSerpDom({
      host: 'www.google.ca',
      headings: [{ closest: () => ({ href: 'https://www.google.ca/goto?url=CAES123' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(true);
  });

  test('rejects an ad link', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'https://www.google.com/aclk?sa=l&ai=DChcSEw' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });

  test('rejects a non-wrapper path on the SERP host', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'https://www.google.com/search?q=other' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });

  test('rejects a wrapper-shaped link on a different Google host', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'https://accounts.google.com/url?q=example.com' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });

  test('rejects a non-http link', () => {
    stubSerpDom({
      headings: [{ closest: () => ({ href: 'javascript:void(0)' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });

  test('rejects a heading with no link', () => {
    stubSerpDom({ headings: [{ closest: () => null }] });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });

  test('returns false when there is no result container', () => {
    stubSerpDom({
      container: '#none',
      headings: [{ closest: () => ({ href: 'https://example.com' }) }],
    });
    expect(pageHasGoogleOrganicResult()).toBe(false);
  });
});

describe('hasGoogleOrganicResults', () => {
  test('returns immediately when an organic card is present', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn().mockResolvedValue(true),
      waitForFunction: jest.fn(),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(true);
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });

  test('waits for cards before classifying a Google shell as empty', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false),
      waitForFunction: jest.fn().mockRejectedValue(new Error('timeout')),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(false);
    expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });

  test('accepts organic cards that render during the wait', async () => {
    const page = {
      isClosed: jest.fn(() => false),
      evaluate: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
    };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(true);
  });

  test('returns false for a closed page', async () => {
    const page = { isClosed: jest.fn(() => true) };

    await expect(hasGoogleOrganicResults(page)).resolves.toBe(false);
  });
});
