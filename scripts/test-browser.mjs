import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('.output/chrome-mv3');
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.permissions?.length ?? 0, 0);
assert.equal(manifest.content_scripts.length, 1);
const [content] = manifest.content_scripts;
assert.equal(content.run_at, 'document_start');
assert.deepEqual(new Set(content.matches), new Set([
  '*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*',
]));
const script = await readFile(join(output, content.js[0]), 'utf8');
const css = await readFile(join(output, content.css[0]), 'utf8');

async function runCases() {
  const results = [];
  const feed = document.querySelector('main');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const post = (media) => `<div data-testid="cellInnerDiv"><article data-testid="tweet"><p data-testid="tweetText">A post</p>${media}</article></div>`;
  const hidden = () => getComputedStyle(feed.querySelector('article')).display === 'none';
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const test = async (name, run) => {
    try {
      feed.innerHTML = '';
      await settle();
      await run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
    }
  };
  const check = async (media, shouldHide) => {
    feed.innerHTML = post(media);
    await settle();
    expect(hidden() === shouldHide, `Expected hidden=${shouldHide}`);
    if (shouldHide) {
      expect(feed.firstElementChild.getBoundingClientRect().height === 0, 'Row should collapse');
    }
  };

  // This post was parsed after the production script ran in <head>.
  await settle();
  expect(hidden(), 'Initial GIF should be hidden');
  results.push({ name: 'Initial page content', passed: true });
  await test('GIF video URL', () => check('<video src="https://video.twimg.com/tweet_video/demo.mp4"></video>', true));
  await test('GIF thumbnail before playback', () => check('<video poster="https://pbs.twimg.com/tweet_video_thumb/demo.jpg"></video>', true));
  await test('GIF badge on blob video', () => check('<div data-testid="videoPlayer"><video src="blob:https://x.com/demo"></video><span>GIF</span></div>', true));
  await test('GIF badge before player loads', () => check('<div data-testid="videoComponent"><span>GIF</span></div>', true));
  await test('Attached GIF image', () => check('<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/demo?format=gif"></div>', true));
  await test('GIF image extension', () => check('<div data-testid="tweetPhoto"><img src="https://example.com/demo.gif?size=large"></div>', true));
  await test('Ordinary looping video', () => check('<div data-testid="videoPlayer"><video loop autoplay muted poster="https://pbs.twimg.com/ext_tw_video_thumb/demo.jpg" src="https://video.twimg.com/ext_tw_video/demo.mp4"></video><span>0:12</span></div>', false));
  await test('Ordinary photo', () => check('<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/demo?format=jpg"></div>', false));
  await test('Text mentioning GIF', () => check('<p>GIF</p><p>https://example.com/example.gif</p>', false));
  await test('GIF avatar does not hide post', () => check('<div data-testid="Tweet-User-Avatar"><img src="https://example.com/avatar.gif"></div>', false));
  await test('Quoted GIF hides containing post', () => check('<div role="link"><div data-testid="videoComponent"><span>GIF</span></div></div>', true));
  await test('Infinite scroll and replies', async () => {
    feed.innerHTML = post('<p>Normal post</p>');
    await settle();
    const section = document.createElement('section');
    section.innerHTML = post('<p>Replying to @someone</p><video poster="https://pbs.twimg.com/tweet_video_thumb/reply.jpg"></video>');
    feed.append(section);
    await settle();
    expect(!hidden(), 'Original post must remain visible');
    expect(getComputedStyle(section.querySelector('article')).display === 'none', 'New reply must hide');
  });
  await test('Late source attachment', async () => {
    await check('<video></video>', false);
    const source = document.createElement('source');
    source.src = 'https://video.twimg.com/tweet_video/late.mp4';
    feed.querySelector('video').append(source);
    await settle();
    expect(hidden(), 'Late source must hide post');
  });
  await test('Poster replacement and recycled row', async () => {
    await check('<video poster="https://pbs.twimg.com/ext_tw_video_thumb/demo.jpg"></video>', false);
    const video = feed.querySelector('video');
    video.setAttribute('poster', 'https://pbs.twimg.com/tweet_video_thumb/demo.jpg');
    await settle();
    expect(hidden(), 'GIF poster must hide row');
    video.setAttribute('poster', 'https://pbs.twimg.com/ext_tw_video_thumb/new-post.jpg');
    await settle();
    expect(!hidden(), 'Recycled ordinary video must become visible');
    expect(feed.firstElementChild.getBoundingClientRect().height > 0, 'Recycled cell must regain height');
  });
  await test('Removing GIF media restores row', async () => {
    await check('<video src="https://video.twimg.com/tweet_video/demo.mp4"></video>', true);
    feed.querySelector('video').remove();
    await settle();
    expect(!hidden(), 'Post without GIF must become visible');
  });
  await test('Badge text changes', async () => {
    await check('<div data-testid="videoPlayer"><span>0:12</span></div>', false);
    const text = feed.querySelector('span').firstChild;
    text.textContent = 'GIF';
    await settle();
    expect(hidden(), 'Changed badge text must hide');
    text.textContent = '0:12';
    await settle();
    expect(!hidden(), 'Changed badge text must restore');
  });
  await test('Shared cell keeps non-GIF replies visible', async () => {
    feed.innerHTML = `<div data-testid="cellInnerDiv"><article data-testid="tweet"><video src="https://video.twimg.com/tweet_video/demo.mp4"></video></article><article data-testid="tweet"><p>Ordinary reply</p></article></div>`;
    await settle();
    const articles = feed.querySelectorAll('article');
    expect(getComputedStyle(articles[0]).display === 'none', 'GIF must hide');
    expect(articles[1].getBoundingClientRect().height > 0, 'Ordinary reply must remain visible');
  });

  const result = document.createElement('meta');
  result.id = 'test-results';
  result.content = encodeURIComponent(JSON.stringify(results));
  document.head.append(result);
}

const temporary = await mkdtemp(join(tmpdir(), 'hide-gif-posts-'));
try {
  const html = `<!doctype html><html><head><style>${css}</style><script>${script}</script></head><body><main><div data-testid="cellInnerDiv"><article data-testid="tweet"><video src="https://video.twimg.com/tweet_video/initial.mp4"></video></article></div></main><script>(${runCases.toString()})().catch(error => { document.title = String(error); });</script></body></html>`;
  const fixture = join(temporary, 'fixture.html');
  await writeFile(fixture, html);
  const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND',
    `--user-data-dir=${join(temporary, 'profile')}`, '--dump-dom', '--virtual-time-budget=5000',
    pathToFileURL(fixture).href,
  ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (browser.error) throw browser.error;
  assert.equal(browser.status, 0, browser.stderr);
  const encoded = browser.stdout.match(/<meta id="test-results" content="([^"]+)"/u)?.[1];
  assert.ok(encoded, `Browser tests did not complete:\n${browser.stdout}\n${browser.stderr}`);
  const results = JSON.parse(decodeURIComponent(encoded));
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
  }
  assert.ok(results.every((result) => result.passed), 'Browser behavior checks failed');
  console.log(`${results.length} browser checks passed; production manifest validated.`);
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
