# Hide GIF posts

A Chrome extension built with WXT and TypeScript that hides posts and replies containing GIFs on X and Twitter. It runs automatically without a popup or settings. It does not collect data or make network requests.

It handles newly loaded posts and replies, GIFs in quoted posts, and feed rows reused by X. Ordinary photos, ordinary videos, GIF avatars, and text mentioning GIFs remain visible. Looping a video does not identify it as a GIF.

## Install in Chrome

Build the extension, then load it in Chrome:

1. Run `bun install --frozen-lockfile`.
2. Run `bun run build` to create `.output/chrome-mv3`.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select this project's `.output/chrome-mv3` folder.
5. Refresh any open X or Twitter tabs.

The extension only hides content locally; it does not delete posts from X. Disable it in Chrome's extension manager and refresh X to restore everything.

## Development

```sh
bun install --frozen-lockfile
bun run dev
```

WXT opens a development browser with the extension installed. Use `bun run build` for a production build and `bun run zip` for a distributable archive.

## Verification

```sh
bun run check
bun run test
```

The test command builds the extension and runs its actual production JavaScript and CSS against feed fixtures in headless Chrome. It checks GIF detection, ordinary video preservation, dynamically inserted replies, media changes, and recycled rows. Set `CHROME_BIN` if Chrome is installed somewhere other than the default macOS path.

These are controlled DOM fixtures, not a logged-in X session. Detection relies on X's current tweet markup, GIF media URLs, and GIF badges; changes to X may require selector updates. An unloaded GIF cannot be identified until its media URL or badge appears.
