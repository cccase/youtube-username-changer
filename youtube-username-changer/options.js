// options.js

// 言語コンテンツ定義
const MESSAGES = {
    "ja": {
        optionsPageTitle: "YouTubeコメントユーザー名解決拡張機能オプション",
        mainHeading: "拡張機能オプション",
        apiDescription: "YouTube Data API のキーを設定してください。",
        apiKeyLabel: "API キー:",
        saveButton: "保存",
        apiGuide: 'API キーの取得方法: <a href="https://console.developers.google.com/apis/library/youtube.googleapis.com" target="_blank">Google Cloud Console (YouTube Data API v3)</a> で新しいプロジェクトを作成し、API キーを生成してください。',
        apiNote: '※ 「YouTube Data API v3」を有効にする必要があります。',
        saveSuccess: "API キーが保存されました！",
        saveError: "保存に失敗しました: ",
        placeholder: "ここにAPIキーを入力",
        // API警告メッセージ
        apiKeyNotSet: "APIキーが設定されていません。機能を利用するにはAPIキーを設定してください。",
        apiGenericError: "APIで問題が発生しました。APIキーが正しくない可能性があります。", // 汎用エラーメッセージ
        apiKeyInvalidOrLimit: "APIキーが無効、またはAPIのクォータ上限に達している可能性があります。", // background.jsから返される詳細エラー
        apiNetworkError: "APIに接続できませんでした。ネットワーク接続を確認してください。" // background.jsから返される詳細エラー
    },
    "en": {
        optionsPageTitle: "YouTube Comment Username Resolver Options",
        mainHeading: "Extension Options",
        apiDescription: "Please set your YouTube Data API key.",
        apiKeyLabel: "API Key:",
        saveButton: "Save",
        apiGuide: 'How to get an API Key: Create a new project in <a href="https://console.developers.google.com/apis/library/youtube.googleapis.com" target="_blank">Google Cloud Console (YouTube Data API v3)</a> and generate an API Key.',
        apiNote: '※ You need to enable "YouTube Data API v3".',
        saveSuccess: "API Key saved successfully!",
        saveError: "Failed to save: ",
        placeholder: "Enter API Key here",
        // API警告メッセージ
        apiKeyNotSet: "API Key is not set. Please set it in the options page to use the extension.",
        apiGenericError: "An API issue occurred. Your API key might be incorrect.", // 汎用エラーメッセージ
        apiKeyInvalidOrLimit: "API Key is invalid or API quota limit has been reached.", // background.jsから返される詳細エラー
        apiNetworkError: "Could not connect to API. Please check your network connection." // background.jsから返される詳細エラー
    }
};

let currentLang = 'en'; // デフォルト言語

// オプションを保存
function saveOptions() {
    const apiKey = document.getElementById('apiKey').value.trim(); // 空白をトリム
    const status = document.getElementById('status');

    // APIキーが空の場合の処理
    if (apiKey === '') {
        chrome.storage.sync.set({
            youtubeApiKey: apiKey,
            language: currentLang,
            apiErrorState: true,
            apiErrorMessage: MESSAGES[currentLang].apiKeyNotSet
        }, () => {
            // ★ status: 保存成功メッセージ（APIキーは保存された）
            status.textContent = MESSAGES[currentLang].saveSuccess;
            status.className = 'success';
            // ★ apiWarning: APIキーが設定されていない具体的な警告
            displayApiWarning(true, MESSAGES[currentLang].apiKeyNotSet);
            setTimeout(() => {
                status.textContent = '';
            }, 2000); // 2秒後に保存完了メッセージをクリア
        });
        return; // 空の場合は検証せずに終了
    }

    // APIキーが空でない場合は検証プロセスへ
    chrome.storage.sync.set({
        youtubeApiKey: apiKey,
        language: currentLang,
        apiErrorState: false, // 一旦エラー状態をリセット
        apiErrorMessage: ''
    }, () => {
        // background.js にAPIキー検証をリクエスト
        chrome.runtime.sendMessage({ action: "validateApiKey", apiKey: apiKey }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending message to background for validation:", chrome.runtime.lastError);
                // ★ status: ネットワークエラーの具体的なメッセージ
                status.textContent = MESSAGES[currentLang].apiNetworkError;
                status.className = 'error';
                // ★ apiWarning: 汎用エラーメッセージ
                displayApiWarning(true, MESSAGES[currentLang].apiGenericError);
                chrome.storage.sync.set({ 'apiErrorState': true, 'apiErrorMessage': MESSAGES[currentLang].apiNetworkError });
                return;
            }

            if (response.isValid) {
                // ★ status: 検証成功時は保存成功メッセージ
                status.textContent = MESSAGES[currentLang].saveSuccess;
                status.className = 'success';
                // ★ apiWarning: 成功したら非表示
                displayApiWarning(false, '');
                chrome.storage.sync.set({ 'apiErrorState': false, 'apiErrorMessage': '' });
            } else {
                // ★ status: background.jsから返された具体的なエラーメッセージ
                status.textContent = response.message;
                status.className = 'error';
                // ★ apiWarning: 汎用エラーメッセージ
                displayApiWarning(true, MESSAGES[currentLang].apiGenericError);
                chrome.storage.sync.set({ 'apiErrorState': true, 'apiErrorMessage': response.message });
            }
            setTimeout(() => {
                status.textContent = '';
            }, 3000); // 3秒後にメッセージをクリア
        });
    });
}

// オプションを復元し、API警告も表示
function restoreOptions() {
    chrome.storage.sync.get(['youtubeApiKey', 'language', 'apiErrorState', 'apiErrorMessage'], (data) => {
        const apiKey = data.youtubeApiKey || '';
        document.getElementById('apiKey').value = apiKey;

        const savedLang = data.language || (navigator.language.startsWith('ja') ? 'ja' : 'en');
        setLanguage(savedLang); // 言語設定が読み込まれた後にUIが更新される

        let currentApiErrorState = data.apiErrorState;
        let currentApiErrorMessage = data.apiErrorMessage; // これはstorageに保存されている具体的なエラーメッセージ

        if (apiKey.trim() === '') {
            currentApiErrorState = true;
            currentApiErrorMessage = MESSAGES[currentLang].apiKeyNotSet;
            // ★ status: APIキーが空の場合でも、保存は成功したと表示
            document.getElementById('status').textContent = MESSAGES[currentLang].saveSuccess;
            document.getElementById('status').className = 'success';
            // ★ apiWarning: APIキー未設定の注意メッセージ
            displayApiWarning(true, MESSAGES[currentLang].apiKeyNotSet);
        } else if (currentApiErrorState) {
            // APIエラー状態の場合
            // storageに保存されている具体的なエラーメッセージを現在の言語に変換
            const originalKeyJa = Object.keys(MESSAGES['ja']).find(key => MESSAGES['ja'][key] === currentApiErrorMessage);
            const originalKeyEn = Object.keys(MESSAGES['en']).find(key => MESSAGES['en'][key] === currentApiErrorMessage);
            
            let actualErrorMessageForStatus = currentApiErrorMessage;
            if (originalKeyJa) {
                actualErrorMessageForStatus = MESSAGES[currentLang][originalKeyJa];
            } else if (originalKeyEn) {
                actualErrorMessageForStatus = MESSAGES[currentLang][originalKeyEn];
            }
            
            // ★ status: 具体的なエラーメッセージ
            document.getElementById('status').textContent = actualErrorMessageForStatus;
            document.getElementById('status').className = 'error';
            // ★ apiWarning: 汎用エラーメッセージ
            displayApiWarning(true, MESSAGES[currentLang].apiGenericError);
        } else {
            // エラーがない場合、statusとapiWarningをクリア
            document.getElementById('status').textContent = '';
            document.getElementById('status').className = '';
            displayApiWarning(false, '');
        }
    });
}

// 言語設定を読み込み、表示を更新する (DOMContentLoadedから呼ばれるため、この関数は直接は使われないが残しておく)
function loadLanguagePreference() {
    chrome.storage.sync.get('language', (data) => {
        const savedLang = data.language || (navigator.language.startsWith('ja') ? 'ja' : 'en');
        setLanguage(savedLang);
    });
}

// 言語を設定し、UIを更新する
function setLanguage(lang) {
    currentLang = lang;

    // タイトルとプレースホルダーを更新
    document.title = MESSAGES[lang].optionsPageTitle;
    document.getElementById('apiKey').placeholder = MESSAGES[lang].placeholder;

    // 言語切り替えボタンのアクティブ状態を更新
    document.querySelectorAll('.lang-switcher button').forEach(button => {
        if (button.dataset.lang === lang) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // 各コンテンツ要素のテキストと表示状態を更新
    const contentElements = document.querySelectorAll('[data-lang-content-id]');
    contentElements.forEach(element => {
        const messageKey = element.dataset.langContentId;
        if (MESSAGES[lang][messageKey]) {
            if (messageKey === 'apiGuide' || messageKey === 'apiNote') {
                element.innerHTML = MESSAGES[lang][messageKey];
            } else {
                element.textContent = MESSAGES[lang][messageKey];
            }
        }
    });

    // API警告メッセージも言語に応じて更新
    chrome.storage.sync.get(['apiErrorState', 'apiErrorMessage', 'youtubeApiKey'], (data) => {
        let currentApiErrorState = data.apiErrorState;
        let currentApiErrorMessage = data.apiErrorMessage; // これはstorageに保存されている具体的なエラーメッセージ
        const apiKey = data.youtubeApiKey || '';

        // APIキーが空の場合
        if (apiKey.trim() === '') {
            currentApiErrorState = true;
            currentApiErrorMessage = MESSAGES[currentLang].apiKeyNotSet;
            // statusはrestoreOptionsで更新されるか、ここで更新する必要があるが、言語変更時にはapiWarningのみを確実に更新する
            displayApiWarning(true, MESSAGES[currentLang].apiKeyNotSet); // apiWarningにAPIキー未設定の注意
        } else if (currentApiErrorState && currentApiErrorMessage) {
            // APIキーが空でないがAPIエラー状態の場合
            // storageに保存されている具体的なエラーメッセージを現在の言語に変換
            const originalKeyJa = Object.keys(MESSAGES['ja']).find(key => MESSAGES['ja'][key] === currentApiErrorMessage);
            const originalKeyEn = Object.keys(MESSAGES['en']).find(key => MESSAGES['en'][key] === currentApiErrorMessage);
            
            let actualErrorMessageForStatus = currentApiErrorMessage;
            if (originalKeyJa) {
                actualErrorMessageForStatus = MESSAGES[currentLang][originalKeyJa];
            } else if (originalKeyEn) {
                actualErrorMessageForStatus = MESSAGES[currentLang][originalKeyEn];
            }

            // statusの更新はrestoreOptionsに任せるか、ここで直接行う（ここではstatusも更新する）
            document.getElementById('status').textContent = actualErrorMessageForStatus;
            document.getElementById('status').className = 'error';
            displayApiWarning(true, MESSAGES[currentLang].apiGenericError); // apiWarningに汎用エラー
        } else {
            // エラーがない場合
            document.getElementById('status').textContent = '';
            document.getElementById('status').className = '';
            displayApiWarning(false, '');
        }
    });
}

// API警告を表示/非表示する関数
function displayApiWarning(isError = false, errorMessage = '') {
    const warningDiv = document.getElementById('apiWarning');
    if (warningDiv) {
        if (isError && errorMessage) {
            let prefix = '';
            // APIキーが設定されていないエラーの場合のみ「注意:」を付ける
            if (errorMessage === MESSAGES[currentLang].apiKeyNotSet) {
                prefix = '<strong>注意:</strong> ';
            }
            // その他のエラー（汎用エラーメッセージを含む）では接頭辞なしで、エラーメッセージそのものを表示
            warningDiv.innerHTML = prefix + errorMessage;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.innerHTML = '';
            warningDiv.style.display = 'none';
        }
    }
}

// イベントリスナーのセットアップ
document.addEventListener('DOMContentLoaded', () => {
    restoreOptions(); // 初期ロード時にオプションとAPI警告を復元

    document.getElementById('saveButton').addEventListener('click', saveOptions);

    document.getElementById('lang-ja').addEventListener('click', () => setLanguage('ja'));
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));
});