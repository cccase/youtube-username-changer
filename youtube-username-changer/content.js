// content.js

(function() {
    'use strict';

    async function requestUsernameResolution(id) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "resolveUsername", id: id }, (response) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError;
                    // "Extension context invalidated" エラーはコンソールにも管理ページにも表示しない
                    if (error.message && error.message.includes("Extension context invalidated")) {
                        return resolve(null); // 静かに失敗
                    }
                    // その他のChromeランタイムエラーは、コンソールにも出力せず、管理ページにも出さないようにする
                    return resolve(null); // エラーでもユーザー名解決はできないのでnullを返す
                }
                if (response && response.error) {
                    // background.jsから返されたAPIキー未設定などのエラーはコンソールにも管理ページにも表示しない
                    return resolve(null); // ユーザー名が解決できなかったのでnullを返す
                }
                if (response && response.username) {
                    resolve(response.username);
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * 指定されたコメント要素内のハンドル名をユーザー名に変換します。
     * @param {HTMLElement} commentElement - 処理するytd-comment-view-model要素。
     */
    function processCommentElement(commentElement) {
        if (!commentElement) return;

        const authorTextLink = commentElement.querySelector('#author-text');
        if (authorTextLink) {
            const authorSpan = authorTextLink.querySelector('span');
            const authorThumbnailButton = commentElement.querySelector('#author-thumbnail-button');

            if (authorSpan && authorThumbnailButton) {
                const currentText = authorSpan.textContent.trim();
                const handleMatch = authorTextLink.href.match(/\/@([^\/]+)$/);

                const handle = handleMatch ? '@' + decodeURIComponent(handleMatch[1]) : currentText;

                // 処理済みフラグがある場合はスキップ
                if (authorTextLink.dataset.rycuProcessed === 'true') {
                    return;
                }

                if (handle.startsWith('@') || !authorTextLink.dataset.rycuProcessed) {
                    requestUsernameResolution(handle).then(username => {
                        if (username && username !== currentText && username !== handle) {
                            authorSpan.textContent = username;
                            authorThumbnailButton.setAttribute('aria-label', username);
                            authorTextLink.dataset.rycuProcessed = 'true';
                        } else {
                            authorTextLink.dataset.rycuProcessed = 'true';
                        }
                    }).catch(error => {
                        // requestUsernameResolution内でエラーは既に抑制されているため、ここでは何も出力しない
                        authorTextLink.dataset.rycuProcessed = 'true';
                    });
                } else {
                    authorTextLink.dataset.rycuProcessed = 'true';
                }
            }
        }
    }

    /**
     * 現在ページに存在するすべてのコメント要素を検索し、処理します。
     */
    function processAllComments() {
        const commentElements = document.querySelectorAll('ytd-comment-view-model');
        commentElements.forEach(comment => {
            // コメント要素内の処理済みフラグを削除し、再処理を許可する
            const authorTextLink = comment.querySelector('#author-text');
            if (authorTextLink && authorTextLink.dataset.rycuProcessed) {
                delete authorTextLink.dataset.rycuProcessed;
            }
            processCommentElement(comment); // 各コメントを処理
        });
    }

    let sortProcessTimer; // デバウンス用タイマー変数
    const DEBOUNCE_DELAY = 100; // DOM変更が停止したと判断する遅延時間 (ms)

    const observer = new MutationObserver((mutationsList, observer) => {
        let relevantMutationDetected = false;
        mutationsList.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                relevantMutationDetected = true;
            }
        });

        if (relevantMutationDetected) {
            clearTimeout(sortProcessTimer);
            sortProcessTimer = setTimeout(() => {
                processAllComments();
            }, DEBOUNCE_DELAY);
        }
    });

    // body要素に対する変更を監視
    observer.observe(document.body, { childList: true, subtree: true });

    // ページの読み込み完了時に既存のコメントを処理
    window.addEventListener('load', () => {
        setTimeout(processAllComments, 1000);
    });

    // YouTubeのページ遷移完了イベントをリッスン
    document.addEventListener('yt-navigate-finish', () => {
        setTimeout(processAllComments, 1000);
    });

    // YouTubeのカスタムイベント（コメントの追加など）をリッスン
    document.addEventListener('yt-action', (event) => {
        if (event.detail && (event.detail.actionName === 'yt-append-continuation-items-action' || event.detail.actionName === 'yt-reload-continuation-items-command')) {
            setTimeout(processAllComments, 500);
        }
    });

    // コメント並び替えオプションのクリックを検知
    document.body.addEventListener('click', function(event) {
        const clickedElement = event.target.closest('tp-yt-paper-item, a.yt-simple-endpoint');
        const sortDropdownContainer = clickedElement ? clickedElement.closest('.dropdown-content.style-scope.tp-yt-paper-menu-button') : null;

        if (clickedElement && sortDropdownContainer) {
            const itemTextElement = clickedElement.querySelector('.item.style-scope.yt-dropdown-menu');
            if (itemTextElement) {
                const sortOptionText = itemTextElement.textContent.trim();

                clearTimeout(sortProcessTimer);
                sortProcessTimer = setTimeout(() => {
                    processAllComments();
                }, DEBOUNCE_DELAY);
            }
        }
    });

})();