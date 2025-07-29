// background.js

// メッセージ定義（background.js内でも使用）
const MESSAGES = {
    "ja": {
        apiKeyNotSet: "APIキーが設定されていません。オプションページで設定してください。",
        apiGenericError: "APIで問題が発生しました。APIキーが正しくない可能性があります。",
        apiKeyInvalidOrLimit: "APIキーが無効、またはAPIの上限に達している可能性があります。",
        apiNetworkError: "APIに接続できませんでした。ネットワーク接続を確認してください。"
    },
    "en": {
        apiKeyNotSet: "API Key is not set. Please set it in the options page.",
        apiGenericError: "An API issue occurred. Your API key might be incorrect.",
        apiKeyInvalidOrLimit: "API Key is invalid or API quota limit has been reached.",
        apiNetworkError: "Could not connect to API. Please check your network connection."
    }
};

let currentLang = 'en'; // デフォルト言語

// サービスワーカー起動時に言語設定をストレージから読み込む（初回起動時など）
chrome.storage.sync.get('language', (data) => {
    if (data.language) {
        currentLang = data.language;
    } else {
        // 設定がない場合はブラウザのUI言語を検出
        currentLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
    }
});


// チャンネルIDまたはハンドル名からユーザー名を解決する関数
async function resolveUsername(id) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get('youtubeApiKey', async (data) => {
            const API_KEY = data.youtubeApiKey;

            if (!API_KEY) {
                // APIキーが設定されていない場合
                // 管理ページにはエラーを出さず、オプションページに表示するための情報をストレージに保存
                chrome.storage.sync.set({ 'apiErrorState': true, 'apiErrorMessage': MESSAGES[currentLang].apiKeyNotSet });
                return reject(new Error("API Key is not set."));
            }

            try {
                let apiUrl = '';
                let params = new URLSearchParams({
                    part: 'snippet',
                    key: API_KEY
                });

                if (id.startsWith("@")) {
                    params.append('forHandle', id.substring(1));
                    apiUrl = `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`;
                } else if (id.length === 24 && id.startsWith("UC")) {
                    params.append('id', id);
                    apiUrl = `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`;
                } else {
                    // 無効なID形式の場合は、エラー状態にはせず、解決できなかったとして扱う
                    chrome.storage.sync.set({ 'apiErrorState': false, 'apiErrorMessage': '' }); // 成功時はエラー状態をクリア
                    return resolve(null);
                }

                const response = await fetch(apiUrl);

                if (!response.ok) {
                    // APIからのエラーレスポンスの場合
                    let errorMessage = MESSAGES[currentLang].apiGenericError; // 一般的なAPIエラーメッセージ
                    try {
                        const errorData = await response.json();
                        if (errorData.error && errorData.error.errors && errorData.error.errors.length > 0) {
                            const firstError = errorData.error.errors[0];
                            // 特定のエラーコードに基づいてメッセージを詳細化
                            if (firstError.reason === "keyInvalid" || firstError.reason === "ipRefererBlocked" || firstError.reason === "dailyLimitExceeded" || firstError.reason === "quotaExceeded") {
                                errorMessage = MESSAGES[currentLang].apiKeyInvalidOrLimit;
                            }
                        }
                        // APIのエラーレスポンスはコンソールに出力（デバッグに必要だが、管理ページには影響しない）
                        console.error("Background: API Error Response:", errorData);
                    } catch (jsonError) {
                        const rawErrorText = await response.text();
                        console.error("Background: API Error Response (non-JSON):", rawErrorText);
                    }
                    // オプションページに表示するためのエラー情報をストレージに保存
                    chrome.storage.sync.set({ 'apiErrorState': true, 'apiErrorMessage': errorMessage });
                    return resolve(null); // エラー発生時もnullを返す
                }

                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    const username = data.items[0].snippet.title;
                    // 成功時はエラー状態をクリア
                    chrome.storage.sync.set({ 'apiErrorState': false, 'apiErrorMessage': '' });
                    return resolve(username);
                } else {
                    // ユーザー名が見つからなかった場合もエラー状態はクリア
                    chrome.storage.sync.set({ 'apiErrorState': false, 'apiErrorMessage': '' });
                    return resolve(null);
                }
            } catch (error) {
                // ネットワークエラーなどの予期せぬエラー
                // コンソールには出力（デバッグに必要）
                console.error(`Background: Error in API call for ${id}:`, error);
                // オプションページに表示するためのエラー情報をストレージに保存
                chrome.storage.sync.set({ 'apiErrorState': true, 'apiErrorMessage': MESSAGES[currentLang].apiNetworkError });
                return resolve(null);
            }
        });
    });
}

// コンテンツスクリプトからのメッセージをリッスンする
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "resolveUsername") {
        resolveUsername(request.id)
            .then(username => {
                sendResponse({ username: username });
            })
            .catch(error => {
                // APIキー未設定などのエラーがここでcatchされるが、ログは出さずsendResponseする
                sendResponse({ username: null, error: error.message });
            });
        return true; // 非同期応答を期待する場合に必要
    }
    return false; // 同期応答の場合、または応答しない場合
});

// 拡張機能アイコンがクリックされたときにオプションページを開く
chrome.action.onClicked.addListener(() => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
});