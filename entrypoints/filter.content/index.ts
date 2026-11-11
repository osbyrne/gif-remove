import { defineContentScript } from 'wxt/utils/define-content-script';
import { startGifFilter } from '../../utils/gif-filter';
import './style.css';

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  main(ctx) {
    ctx.onInvalidated(startGifFilter(document));
  },
});
