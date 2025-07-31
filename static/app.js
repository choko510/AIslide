document.addEventListener('DOMContentLoaded', () => {
    const authArea = document.getElementById('auth-area');
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterModalBtn = document.getElementById('show-register-modal');
    const showLoginModalBtn = document.getElementById('show-login-modal');
    const createNewSlideBtn = document.getElementById('create-new-slide-btn');
    const slideListContainer = document.getElementById('slide-list');

    const API_BASE_URL = ''; // FastAPIが同じオリジンで提供されるため空文字列

    // --- 多言語対応システム ---
    const MESSAGES = {
        'ja': {
            'welcome': 'ようこそ',
            'login': 'ログイン',
            'register': '新規登録',
            'logout': 'ログアウト',
            'username': 'ユーザー名',
            'password': 'パスワード',
            'login_success': 'ログインしました',
            'logout_success': 'ログアウトしました',
            'register_success': '新規登録が完了しました。ログインしてください。',
            'slide_created': '新しいスライドを作成しました',
            'slide_deleted': 'スライドが削除されました',
            'confirm_delete': 'このスライドを削除してもよろしいですか？',
            'login_required': 'この操作にはログインが必要です',
            'error_occurred': 'エラーが発生しました',
            'network_error': 'ネットワークエラーが発生しました。接続を確認してください。',
            'server_error': 'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。',
            'validation_error': '入力内容に問題があります。確認してください。',
            'unauthorized_error': 'アクセス権限がありません。再度ログインしてください。',
            'login_error_title': 'ログインエラー',
            'register_error_title': '登録エラー',
            'password_error_title': 'パスワードエラー',
            'slide_error_title': 'スライドエラー',
            'no_slides_message': 'まだスライドがありません。「新しいプレゼンテーション」ボタンから作成しましょう！',
            'slide_fetch_error': 'スライドの取得に失敗しました',
            'slide_create_error': 'スライドの作成に失敗しました',
            'slide_delete_error': 'スライドの削除に失敗しました',
            'edit': '編集',
            'delete': '削除',
            'loading': '読み込み中...',
            'processing': '処理中...',
            'settings': '設定',
            'dark_mode': 'ダークモード',
            'language': '言語',
            'japanese': '日本語',
            'english': 'English',
            'save': '保存',
            'cancel': 'キャンセル',
            'settings_saved': '設定を保存しました'
        },
        'en': {
            'welcome': 'Welcome',
            'login': 'Login',
            'register': 'Register',
            'logout': 'Logout',
            'username': 'Username',
            'password': 'Password',
            'login_success': 'Successfully logged in',
            'logout_success': 'Successfully logged out',
            'register_success': 'Registration completed. Please log in.',
            'slide_created': 'New slide created',
            'slide_deleted': 'Slide deleted',
            'confirm_delete': 'Are you sure you want to delete this slide?',
            'login_required': 'Login required for this operation',
            'error_occurred': 'An error occurred',
            'network_error': 'Network error occurred. Please check your connection.',
            'server_error': 'Server error occurred. Please try again later.',
            'validation_error': 'Input validation failed. Please check your input.',
            'unauthorized_error': 'Access denied. Please log in again.',
            'login_error_title': 'Login Error',
            'register_error_title': 'Registration Error',
            'password_error_title': 'Password Error',
            'slide_error_title': 'Slide Error',
            'no_slides_message': 'No slides yet. Create one using the "New Presentation" button!',
            'slide_fetch_error': 'Failed to fetch slides',
            'slide_create_error': 'Failed to create slide',
            'slide_delete_error': 'Failed to delete slide',
            'edit': 'Edit',
            'delete': 'Delete',
            'loading': 'Loading...',
            'processing': 'Processing...',
            'settings': 'Settings',
            'dark_mode': 'Dark Mode',
            'language': 'Language',
            'japanese': '日本語',
            'english': 'English',
            'save': 'Save',
            'cancel': 'Cancel',
            'settings_saved': 'Settings saved'
        }
    };

    // 現在の言語設定を取得
    function getCurrentLanguage() {
        return localStorage.getItem('app_language') || 'ja';
    }

    // 言語設定を保存
    function setLanguage(lang) {
        localStorage.setItem('app_language', lang);
        updateUILanguage();
    }

    // メッセージを取得
    function getMessage(key, lang = null) {
        const currentLang = lang || getCurrentLanguage();
        return MESSAGES[currentLang]?.[key] || MESSAGES['ja'][key] || key;
    }

    // UIの言語を更新
    function updateUILanguage() {
        const lang = getCurrentLanguage();
        
        // ボタンテキストの更新
        const loginBtn = document.getElementById('show-login-btn');
        const registerBtn = document.getElementById('show-register-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (loginBtn) loginBtn.textContent = getMessage('login');
        if (registerBtn) registerBtn.textContent = getMessage('register');
        if (logoutBtn) logoutBtn.textContent = getMessage('logout');
    }

    // エラーコードから適切なメッセージを生成
    function getErrorMessage(response, defaultKey = 'error_occurred') {
        const lang = getCurrentLanguage();
        
        if (response.status === 400) {
            return getMessage('validation_error', lang);
        } else if (response.status === 401) {
            return getMessage('unauthorized_error', lang);
        } else if (response.status === 403) {
            return getMessage('unauthorized_error', lang);
        } else if (response.status === 404) {
            return getMessage('slide_fetch_error', lang);
        } else if (response.status >= 500) {
            return getMessage('server_error', lang);
        }
        
        return getMessage(defaultKey, lang);
    }

    // ネットワークエラーの判定
    function isNetworkError(error) {
        return error instanceof TypeError && error.message.includes('Failed to fetch');
    }

    // --- ダークモード機能 ---
    function getCurrentTheme() {
        return localStorage.getItem('app_theme') || 'light';
    }

    function setTheme(theme) {
        localStorage.setItem('app_theme', theme);
        applyTheme(theme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }

    // --- 設定モーダル機能 ---
    function openSettingsModal() {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            // 現在の設定値を反映
            const languageSelect = document.getElementById('settings-language-select');
            const themeSelect = document.getElementById('settings-theme-select');
            
            if (languageSelect) languageSelect.value = getCurrentLanguage();
            if (themeSelect) themeSelect.value = getCurrentTheme();
            
            settingsModal.classList.add('is-open');
        }
    }

    function closeSettingsModal() {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            settingsModal.classList.remove('is-open');
        }
    }

    function saveSettings() {
        const languageSelect = document.getElementById('settings-language-select');
        const themeSelect = document.getElementById('settings-theme-select');
        
        if (languageSelect) {
            setLanguage(languageSelect.value);
        }
        
        if (themeSelect) {
            setTheme(themeSelect.value);
        }
        
        closeSettingsModal();
        showToast(getMessage('settings_saved'), '', 'success');
    }

    // --- カスタムアラート関数 ---
    function showCustomAlert(message, title = 'お知らせ', type = 'info') {
        return new Promise((resolve) => {
            const alertElement = document.getElementById('custom-alert');
            const iconElement = document.getElementById('alert-icon');
            const titleElement = document.getElementById('alert-title');
            const messageElement = document.getElementById('alert-message');
            const okBtn = document.getElementById('alert-ok-btn');
            const cancelBtn = document.getElementById('alert-cancel-btn');

            // アイコンの設定
            iconElement.className = `alert-icon ${type}`;
            switch (type) {
                case 'success':
                    iconElement.innerHTML = '<i class="fas fa-check-circle"></i>';
                    break;
                case 'error':
                    iconElement.innerHTML = '<i class="fas fa-times-circle"></i>';
                    break;
                case 'warning':
                    iconElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    break;
                default:
                    iconElement.innerHTML = '<i class="fas fa-info-circle"></i>';
            }

            titleElement.textContent = title;
            messageElement.textContent = message;
            cancelBtn.style.display = 'none';

            alertElement.classList.add('show');

            const handleOk = () => {
                alertElement.classList.remove('show');
                okBtn.removeEventListener('click', handleOk);
                resolve(true);
            };

            okBtn.addEventListener('click', handleOk);
        });
    }

    function showCustomConfirm(message, title = '確認') {
        return new Promise((resolve) => {
            const alertElement = document.getElementById('custom-alert');
            const iconElement = document.getElementById('alert-icon');
            const titleElement = document.getElementById('alert-title');
            const messageElement = document.getElementById('alert-message');
            const okBtn = document.getElementById('alert-ok-btn');
            const cancelBtn = document.getElementById('alert-cancel-btn');

            // アイコンの設定
            iconElement.className = 'alert-icon warning';
            iconElement.innerHTML = '<i class="fas fa-question-circle"></i>';

            titleElement.textContent = title;
            messageElement.textContent = message;
            okBtn.textContent = 'はい';
            cancelBtn.textContent = 'いいえ';
            cancelBtn.style.display = 'inline-block';

            alertElement.classList.add('show');

            const handleOk = () => {
                alertElement.classList.remove('show');
                okBtn.removeEventListener('click', handleOk);
                cancelBtn.removeEventListener('click', handleCancel);
                okBtn.textContent = 'OK';
                resolve(true);
            };

            const handleCancel = () => {
                alertElement.classList.remove('show');
                okBtn.removeEventListener('click', handleOk);
                cancelBtn.removeEventListener('click', handleCancel);
                okBtn.textContent = 'OK';
                resolve(false);
            };

            okBtn.addEventListener('click', handleOk);
            cancelBtn.addEventListener('click', handleCancel);
        });
    }

    function showToast(message, title = '', type = 'info', duration = 3000) {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <i class="toast-icon ${type} ${iconMap[type]}"></i>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        toastContainer.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        const closeToast = () => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };

        closeBtn.addEventListener('click', closeToast);
        setTimeout(closeToast, duration);
    }

    // --- モーダル制御 ---
    function openModal(modal) {
        modal.classList.add('is-open');
    }

    function closeModal(modal) {
        modal.classList.remove('is-open');
    }

    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) closeModal(loginModal);
    });
    registerModal.addEventListener('click', (e) => {
        if (e.target === registerModal) closeModal(registerModal);
    });

    showRegisterModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(loginModal);
        openModal(registerModal);
    });

    showLoginModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(registerModal);
        openModal(loginModal);
    });

    // --- 認証関連 ---
    function getToken() {
        return localStorage.getItem('access_token');
    }

    function setToken(token) {
        localStorage.setItem('access_token', token);
    }

    function removeToken() {
        localStorage.removeItem('access_token');
    }

    async function checkAuthAndRenderUI() {
        const token = getToken();
        if (token) {
            try {
                const response = await fetch(`${API_BASE_URL}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    const user = await response.json();
                    renderLoggedInUI(user.username);
                    fetchAndRenderSlides();
                } else {
                    console.warn('認証トークンが無効です:', response.status);
                    removeToken();
                    renderLoggedOutUI();
                }
            } catch (error) {
                console.error('認証チェックエラー:', error);
                if (isNetworkError(error)) {
                    showToast(getMessage('network_error'), '', 'warning', 5000);
                }
                removeToken();
                renderLoggedOutUI();
            }
        } else {
            renderLoggedOutUI();
        }
    }

    function renderLoggedInUI(username) {
        const welcomeMsg = getMessage('welcome');
        const logoutText = getMessage('logout');
        const settingsText = getMessage('settings');
        
        authArea.innerHTML = `
            <div class="user-info">
                <span>${welcomeMsg}、${username}さん！</span>
                <button id="settings-btn" class="settings-btn" title="${settingsText}">
                    <i class="fas fa-cog"></i>
                </button>
                <button id="logout-btn">${logoutText}</button>
            </div>
        `;
        
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
        document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    }

    function renderLoggedOutUI() {
        const loginText = getMessage('login');
        const registerText = getMessage('register');
        const settingsText = getMessage('settings');
        
        authArea.innerHTML = `
            <div class="auth-buttons">
                <button id="show-login-btn">${loginText}</button>
                <button id="show-register-btn">${registerText}</button>
                <button id="settings-btn" class="settings-btn" title="${settingsText}">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
        `;
        
        document.getElementById('show-login-btn').addEventListener('click', () => openModal(loginModal));
        document.getElementById('show-register-btn').addEventListener('click', () => openModal(registerModal));
        document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    }

    async function handleLogin(event) {
        event.preventDefault();
        const username = loginForm.elements['login-username'].value;
        const password = loginForm.elements['login-password'].value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                setToken(data.access_token);
                closeModal(loginModal);
                showToast(getMessage('login_success'), '', 'success');
                checkAuthAndRenderUI(); // UI更新とスライド取得
            } else {
                const errorMessage = getErrorMessage(response, 'unauthorized_error');
                await showCustomAlert(errorMessage, getMessage('login_error_title'), 'error');
            }
        } catch (error) {
            console.error('ログインエラー:', error);
            const errorMessage = isNetworkError(error) ?
                getMessage('network_error') :
                getMessage('error_occurred');
            await showCustomAlert(errorMessage, getMessage('login_error_title'), 'error');
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        const username = registerForm.elements['register-username'].value;
        const password = registerForm.elements['register-password'].value;

        // パスワードのバリデーション
        const passwordValidationResult = validatePassword(password);
        if (!passwordValidationResult.isValid) {
            await showCustomAlert(passwordValidationResult.message, getMessage('password_error_title'), 'warning');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                await showCustomAlert(getMessage('register_success'), getMessage('register_error_title'), 'success');
                closeModal(registerModal);
                openModal(loginModal);
            } else {
                const errorMessage = getErrorMessage(response, 'validation_error');
                await showCustomAlert(errorMessage, getMessage('register_error_title'), 'error');
            }
        } catch (error) {
            console.error('新規登録エラー:', error);
            const errorMessage = isNetworkError(error) ?
                getMessage('network_error') :
                getMessage('error_occurred');
            await showCustomAlert(errorMessage, getMessage('register_error_title'), 'error');
        }
    }

    // パスワードバリデーション関数
    function validatePassword(password) {
        const minLength = 7;

        if (password.length < minLength) {
            return { isValid: false, message: `パスワードは${minLength}文字以上である必要があります。` };
        }

        // 同じ数字が4回以上連続しない
        if (/(.)\1\1\1/.test(password)) {
            return { isValid: false, message: '同じ文字が4回以上連続するパスワードは使用できません。' };
        }

        // 数字のみではないことを確認
        if (/^\d+$/.test(password)) {
            return { isValid: false, message: 'パスワードには英数字や記号を含める必要があります。' };
        }

        return { isValid: true, message: 'パスワードは有効です。' };
    }

    async function handleLogout() {
        removeToken();
        renderLoggedOutUI();
        slideListContainer.innerHTML = ''; // スライドリストをクリア
        showToast(getMessage('logout_success'), '', 'info');
    }

    // --- スライド関連 ---
    async function fetchAndRenderSlides() {
        const token = getToken();
        if (!token) {
            slideListContainer.innerHTML = `<p>${getMessage('login_required')}</p>`;
            return;
        }

        // ローディング表示
        slideListContainer.innerHTML = `<p>${getMessage('loading')}</p>`;

        try {
            const response = await fetch(`${API_BASE_URL}/users/me/slides`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const slides = await response.json();
                renderSlides(slides);
            } else {
                const errorMessage = getErrorMessage(response, 'slide_fetch_error');
                console.error('スライド取得失敗:', response.status);
                slideListContainer.innerHTML = `<p>${errorMessage}</p>`;
                if (response.status === 401) { // トークン切れなどで認証エラーの場合
                    removeToken();
                    renderLoggedOutUI();
                }
            }
        } catch (error) {
            console.error('スライド取得エラー:', error);
            const errorMessage = isNetworkError(error) ?
                getMessage('network_error') :
                getMessage('slide_fetch_error');
            slideListContainer.innerHTML = `<p>${errorMessage}</p>`;
        }
    }

    function renderSlides(slides) {
        slideListContainer.innerHTML = ''; // 既存のスライドをクリア
        if (slides.length === 0) {
            slideListContainer.innerHTML = `<p>${getMessage('no_slides_message')}</p>`;
            return;
        }

        slides.forEach(slide => {
            const slideCard = document.createElement('div');
            slideCard.className = 'slide-card';
            // サムネイルのプレースホルダー。将来的には実際のサムネイル画像を生成して表示
            slideCard.innerHTML = `
                <div class="slide-thumbnail-placeholder">
                    <i class="fas fa-file-powerpoint fa-4x"></i>
                </div>
                <div class="slide-info">
                    <div class="slide-title">スライド #${slide.id}</div>
                    <div class="slide-actions">
                        <button class="edit-btn" data-slide-id="${slide.id}">${getMessage('edit')}</button>
                        <button class="delete-btn" data-slide-id="${slide.id}">${getMessage('delete')}</button>
                    </div>
                </div>
            `;
            slideListContainer.appendChild(slideCard);

            slideCard.querySelector('.edit-btn').addEventListener('click', () => handleEditSlide(slide.id));
            slideCard.querySelector('.delete-btn').addEventListener('click', () => handleDeleteSlide(slide.id));
        });
    }

    async function handleCreateNewSlide() {
        const token = getToken();
        if (!token) {
            await showCustomAlert(getMessage('login_required'), getMessage('slide_error_title'), 'warning');
            openModal(loginModal);
            return;
        }

        try {
            // ローディング通知
            showToast(getMessage('processing'), '', 'info', 2000);
            
            // FastAPIのSlideCreateスキーマに合わせて空のslide_dataを送信
            const response = await fetch(`${API_BASE_URL}/slides`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ slide_data: "{}" }) // 空のJSONオブジェクトを送信
            });

            if (response.ok) {
                const newSlide = await response.json();
                showToast(getMessage('slide_created'), '', 'success');
                window.location.href = `/slide.html?slide_id=${newSlide.id}`;
            } else {
                const errorMessage = getErrorMessage(response, 'slide_create_error');
                await showCustomAlert(errorMessage, getMessage('slide_error_title'), 'error');
            }
        } catch (error) {
            console.error('スライド作成エラー:', error);
            const errorMessage = isNetworkError(error) ?
                getMessage('network_error') :
                getMessage('slide_create_error');
            await showCustomAlert(errorMessage, getMessage('slide_error_title'), 'error');
        }
    }

    function handleEditSlide(slideId) {
        window.location.href = `/slide.html?slide_id=${slideId}`;
    }

    async function handleDeleteSlide(slideId) {
        const confirmed = await showCustomConfirm(getMessage('confirm_delete'), getMessage('slide_error_title'));
        if (!confirmed) {
            return;
        }

        const token = getToken();
        if (!token) {
            await showCustomAlert(getMessage('login_required'), getMessage('slide_error_title'), 'warning');
            openModal(loginModal);
            return;
        }

        try {
            // ローディング通知
            showToast(getMessage('processing'), '', 'info', 2000);
            
            const response = await fetch(`${API_BASE_URL}/slides/${slideId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                showToast(getMessage('slide_deleted'), '', 'success');
                fetchAndRenderSlides(); // リストを再読み込み
            } else {
                const errorMessage = getErrorMessage(response, 'slide_delete_error');
                await showCustomAlert(errorMessage, getMessage('slide_error_title'), 'error');
            }
        } catch (error) {
            console.error('スライド削除エラー:', error);
            const errorMessage = isNetworkError(error) ?
                getMessage('network_error') :
                getMessage('slide_delete_error');
            await showCustomAlert(errorMessage, getMessage('slide_error_title'), 'error');
        }
    }

    // --- イベントリスナー登録 ---
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    createNewSlideBtn.addEventListener('click', handleCreateNewSlide);

    // 設定モーダルのイベントリスナー
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettingsModal();
        });
        
        const saveBtn = document.getElementById('settings-save-btn');
        const cancelBtn = document.getElementById('settings-cancel-btn');
        
        if (saveBtn) saveBtn.addEventListener('click', saveSettings);
        if (cancelBtn) cancelBtn.addEventListener('click', closeSettingsModal);
    }

    // 初期UIのレンダリング
    applyTheme(getCurrentTheme()); // 初期テーマ設定を適用
    checkAuthAndRenderUI();
    updateUILanguage(); // 初期言語設定を適用
});
