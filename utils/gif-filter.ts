const TWEET = 'article[data-testid="tweet"]';
const MARKER = 'data-hide-gif';

function isGifMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const twitterMedia = url.hostname === 'twimg.com' || url.hostname.endsWith('.twimg.com');
    return (
      (twitterMedia && /^\/tweet_video(?:_thumb)?\//.test(url.pathname)) ||
      /\.gif(?::[^/]*)?$/i.test(url.pathname) ||
      url.searchParams.get('format')?.toLowerCase() === 'gif'
    );
  } catch {
    return false;
  }
}

function containsGif(tweet: Element): boolean {
  for (const media of tweet.querySelectorAll('video, video source, [data-testid="tweetPhoto"] img')) {
    for (const attribute of ['src', 'poster']) {
      const value = media.getAttribute(attribute);
      if (value && isGifMediaUrl(value)) return true;
    }
  }

  // X converts GIFs to video; the badge also identifies unloaded/blob-backed GIFs.
  for (const badge of tweet.querySelectorAll(
    '[data-testid="videoPlayer"] span, [data-testid="videoComponent"] span',
  )) {
    if (badge.textContent?.trim() === 'GIF' && !badge.closest('[data-testid="tweetText"]')) {
      return true;
    }
  }
  return false;
}

export function startGifFilter(root: Document): () => void {
  const refresh = (tweet: Element) => {
    tweet.toggleAttribute(MARKER, containsGif(tweet));
  };

  const observer = new MutationObserver((records) => {
    const tweets = new Set<Element>();
    const collect = (node: Node) => {
      const element = node instanceof Element ? node : node.parentElement;
      if (!element) return;
      const tweet = element.closest(TWEET);
      if (tweet) tweets.add(tweet);
      for (const descendant of element.querySelectorAll(TWEET)) tweets.add(descendant);
    };

    for (const record of records) {
      // Recheck removals too: X can reuse a GIF row for an ordinary post.
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      const tweet = element?.closest(TWEET);
      if (tweet) tweets.add(tweet);
      for (const node of record.addedNodes) collect(node);
      if (record.type === 'attributes' && element?.matches(TWEET)) tweets.add(element);
    }
    for (const tweet of tweets) {
      if (tweet.isConnected) refresh(tweet);
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['src', 'poster', 'data-testid'],
  });
  for (const tweet of root.querySelectorAll(TWEET)) refresh(tweet);

  return () => {
    observer.disconnect();
    for (const tweet of root.querySelectorAll(`[${MARKER}]`)) tweet.removeAttribute(MARKER);
  };
}
