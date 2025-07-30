(function() {
    'use strict';

    const channelNameCache = new Map();
    const PROCESSED_DATA_KEY = 'ytncProcessed';

// ...既存のコード...

// チャンネル名を取得（キャッシュ優先、なければfetch）
async function getChannelName(url, identifier) {
    if (channelNameCache.has(identifier)) {
        console.log(`[YTNChanger] cache hit: ${identifier} → ${channelNameCache.get(identifier)}`);
        return channelNameCache.get(identifier);
    }
    try {
        console.log(`[YTNChanger] fetch start: ${url}`);
        const res = await fetch(url, { credentials: 'omit' });
        console.log(`[YTNChanger] fetch status: ${res.status}`);
        const text = await res.text();

        // ytInitialDataからチャンネル名を抽出
        const ytInitialDataMatch = text.match(/var ytInitialData = (.*?);\s*<\/script>/s);
        if (ytInitialDataMatch && ytInitialDataMatch[1]) {
            try {
                const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
                // チャンネル名のパスは下記で取得できる場合が多い
                let channelName = null;
                if (ytInitialData.header && ytInitialData.header.c4TabbedHeaderRenderer) {
                    channelName = ytInitialData.header.c4TabbedHeaderRenderer.title;
                }
                if (channelName) {
                    console.log(`[YTNChanger] fetched channel name (ytInitialData): ${channelName} for ${identifier}`);
                    channelNameCache.set(identifier, channelName);
                    return channelName;
                }
            } catch (e) {
                console.warn(`[YTNChanger] ytInitialData parse error for ${identifier}:`, e);
            }
        }

        // fallback: <title>チャンネル名 - YouTube</title>
        let match = text.match(/<title>([^<]+) - YouTube<\/title>/);
        if (match && match[1]) {
            console.log(`[YTNChanger] fetched channel name (title): ${match[1]} for ${identifier}`);
            channelNameCache.set(identifier, match[1]);
            return match[1];
        }
        console.warn(`[YTNChanger] channel name not found for ${identifier}`);
    } catch (e) {
        console.error(`[YTNChanger] fetch error for ${identifier}:`, e);
    }
    return null;
}

// ...既存のコード...

    // コメント1つを処理
    async function processCommentElement(commentThread) {
        if (!commentThread) return;

        const authorLink = commentThread.querySelector('#author-text');
        if (!authorLink) return;

        if (authorLink.dataset[PROCESSED_DATA_KEY] === 'true') return;

        const authorSpan = authorLink.querySelector('span');
        if (!authorSpan) return;

        const currentText = authorSpan.textContent.trim();

        // ハンドル名またはチャンネルIDを抽出
        let identifier = null;
        let channelUrl = null;
        const handleMatch = authorLink.href.match(/\/@([^\/\?]+)/);
        const channelIdMatch = authorLink.href.match(/\/channel\/([^\/\?]+)/);

        if (handleMatch) {
            identifier = '@' + decodeURIComponent(handleMatch[1]);
            channelUrl = 'https://www.youtube.com/' + identifier;
        } else if (channelIdMatch) {
            identifier = channelIdMatch[1];
            channelUrl = 'https://www.youtube.com/channel/' + identifier;
        } else {
            authorLink.dataset[PROCESSED_DATA_KEY] = 'true';
            return;
        }

        // 既にキャッシュ済みなら即置換
        if (channelNameCache.has(identifier)) {
            const username = channelNameCache.get(identifier);
            if (username && username !== currentText) {
                authorSpan.textContent = username;
            }
            authorLink.dataset[PROCESSED_DATA_KEY] = 'true';
            return;
        }

        // fetchでチャンネル名取得
        const username = await getChannelName(channelUrl, identifier);
        if (username && username !== currentText) {
            authorSpan.textContent = username;
        }
        authorLink.dataset[PROCESSED_DATA_KEY] = 'true';
    }

    // コメント欄の全コメントを処理
    async function processAllComments() {
        const commentElements = document.querySelectorAll('ytd-comment-thread-renderer');
        for (const commentThread of commentElements) {
            await processCommentElement(commentThread);
        }
    }

    // MutationObserverでコメント欄の変化を監視
    let observer = null;
    function observeComments() {
        const container = document.querySelector('ytd-item-section-renderer#sections #contents');
        if (!container) {
            setTimeout(observeComments, 500);
            return;
        }
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            processAllComments();
        });
        observer.observe(container, { childList: true, subtree: true });
        processAllComments();
    }

    // URL変更時の再初期化
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            channelNameCache.clear();
            setTimeout(observeComments, 1000);
        }
    });
    urlObserver.observe(document, { childList: true, subtree: true });

    // ページ初期化
    window.addEventListener('yt-navigate-finish', () => setTimeout(observeComments, 1000));
    window.addEventListener('load', () => setTimeout(observeComments, 1000));

})();