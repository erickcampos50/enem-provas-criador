import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assetCandidates,
  isRemoteUrl,
  mediaAssetKey,
  resolveAssetUrl,
  toAssetKey,
} from '../src/assets.js';

test('toAssetKey normalizes bare paths and preserves remote URLs', () => {
  assert.equal(toAssetKey('2009/questions/1/a.png'), 'asset:media/2009/questions/1/a.png');
  assert.equal(toAssetKey('asset:media/2024/questions/3/img-0.png'), 'asset:media/2024/questions/3/img-0.png');
  assert.equal(toAssetKey('https://enem.dev/2009/questions/1/a.png'), 'https://enem.dev/2009/questions/1/a.png');
});

test('isRemoteUrl detects absolute URLs only', () => {
  assert.equal(isRemoteUrl('https://example.com/x.png'), true);
  assert.equal(isRemoteUrl('asset:media/2009/questions/1/a.png'), false);
  assert.equal(isRemoteUrl('2009/questions/1/a.png'), false);
});

test('resolveAssetUrl keeps remote URLs and maps assets onto bases', () => {
  const remote = 'https://cdn.example.com/x.png';
  assert.equal(resolveAssetUrl(remote), remote);

  const resolved = resolveAssetUrl('asset:media/2009/questions/100/a.jpg', {
    extras: ['https://mirror.example.com/enem/'],
  });
  assert.equal(resolved, 'https://mirror.example.com/enem/media/2009/questions/100/a.jpg');

  const absolute = resolveAssetUrl('asset:media/2009/questions/100/a.jpg', {
    absolute: true,
    extras: ['/local-base/'],
  });
  assert.match(absolute, /^https?:\/\//);
  assert.match(absolute, /media\/2009\/questions\/100\/a\.jpg$/);
});

test('assetCandidates exposes fallback hosts', () => {
  const candidates = assetCandidates('asset:media/2023/questions/1/a.png', {
    extras: ['https://a.example/'],
  });
  assert.ok(candidates.length >= 2);
  assert.equal(candidates[0], 'https://a.example/media/2023/questions/1/a.png');
});

test('mediaAssetKey builds canonical keys', () => {
  assert.equal(
    mediaAssetKey(2024, '12-ingles', 'img-0.png'),
    'asset:media/2024/questions/12-ingles/img-0.png',
  );
});
