/**
 * slideScript.js
 * スライド台本パネルの表示・編集・保存機能をAppに追加する
 */
window.addEventListener('app-initialized', () => {
    (function() {
        if (typeof window.App === 'undefined') {
            console.error("App object is not defined. slideScript.js cannot initialize.");
            return;
        }

        const App = window.App;
        const Utils = window.Utils;
        const StateManager = window.StateManager;

        // 台本関連の機能をAppに追加
        Object.assign(App, {
            // 台本パネルの表示/非表示を切り替え
            toggleScriptPanel() {
                // 状態をトグルし、UIは render で反映
                const key = 'webSlideMakerScriptPanelVisible';
                const current = localStorage.getItem(key);
                const next = current === 'true' ? 'false' : 'true';
                localStorage.setItem(key, next);

                // Immer管理stateを破壊せず更新
                this.updateState('ui', {
                    ...(this.state.ui || {}),
                    scriptPanelVisible: (next === 'true')
                }, { silent: true });

                // 即時反映
                this.render();
            },

            // 台本パネルの表示状態をロード
            _loadScriptPanelState() {
                const saved = localStorage.getItem('webSlideMakerScriptPanelVisible');
                const visible = saved === null ? true : (saved === 'true');
                // Immer管理stateを破壊せず更新
                this.updateState('ui', {
                    ...(this.state.ui || {}),
                    scriptPanelVisible: visible
                }, { silent: true });
            },

            // 台本エリアをレンダリング
            renderScript() {
                const { presentation, activeSlideId } = this.state;
                const scriptDisplay = this.elements.scriptDisplay;
                if (!scriptDisplay) return;
                scriptDisplay.innerHTML = '';

                const scriptContent = presentation.script || '';
                const slidesScripts = scriptContent.split(/(?=\[スライド\d+\])/g).filter(s => s.trim());

                slidesScripts.forEach((scriptBlock) => {
                    const lines = scriptBlock.trim().split('\n');
                    const markerLine = lines.shift() || '';
                    const noteLines = lines.join('\n');
                    const slideMarkerMatch = markerLine.match(/^\[スライド(\d+)\]$/);
                    if (!slideMarkerMatch) return;
    
                    const slideIndex = parseInt(slideMarkerMatch[1]) - 1;
                    const isActiveSlide = presentation.slides[slideIndex]?.id === activeSlideId;
    
                    const scriptBlockContainer = document.createElement('div');
                    scriptBlockContainer.className = 'script-block';
                    if (isActiveSlide) {
                        scriptBlockContainer.classList.add('active');
                        scriptBlockContainer.style.backgroundColor = 'var(--highlight-color)';
                        scriptBlockContainer.style.borderRadius = 'var(--border-radius)';
                        scriptBlockContainer.style.padding = '8px';
                        scriptBlockContainer.style.margin = '8px 0';
                    }
    
                    const markerDiv = document.createElement('div');
                    markerDiv.className = 'script-marker';
                    markerDiv.textContent = markerLine;
                    markerDiv.contentEditable = 'false';
                    markerDiv.style.fontWeight = 'bold';
                    markerDiv.style.color = 'var(--primary-color)';
                    markerDiv.style.userSelect = 'none';
                    if (isActiveSlide) {
                        markerDiv.classList.add('active-slide-marker');
                    }
                    scriptBlockContainer.appendChild(markerDiv);
    
                    // 単一ビューエディタ: 編集も表示も同一要素
                    const noteDiv = document.createElement('div');
                    noteDiv.className = 'script-note script-note-unified';
                    noteDiv.contentEditable = 'true';
                    noteDiv.dataset.slideIndex = slideIndex;
                    noteDiv.textContent = noteLines; // stateはMarkdownプレーンテキストを保持
                    Object.assign(noteDiv.style, {
                        minHeight: '1.2em',
                        padding: '6px 8px',
                        border: '1px solid var(--border-color, #e9ecef)',
                        borderRadius: '6px',
                        background: 'var(--bg-soft, #fff)',
                        whiteSpace: 'pre-wrap'
                    });

                    // 描画モード切替: 未フォーカス時はMarkdownをHTMLレンダ、フォーカス時はMarkdown編集
                    const renderViewMode = () => {
                        // 表示モード: HTMLプレビュー
                        const md = noteDiv.dataset.rawMarkdown ?? noteDiv.textContent;
                        // dataset.rawMarkdownを優先（編集時に保持）
                        this._renderMarkdownPreview(md || '', noteDiv);
                        noteDiv.contentEditable = 'false';
                        noteDiv.dataset.view = 'preview';
                    };
                    const renderEditMode = () => {
                        // 編集モード: プレーンテキスト表示＋編集可能
                        const currentMd = noteDiv.dataset.rawMarkdown ?? noteDiv.textContent;
                        noteDiv.textContent = currentMd || '';
                        noteDiv.contentEditable = 'true';
                        noteDiv.dataset.view = 'edit';
                    };

                    // 初期はプレビューモード
                    noteDiv.dataset.rawMarkdown = noteLines;
                 renderViewMode();
    
                    // クリックで編集開始、フォーカスアウトでプレビューに戻す
                    const enterEdit = () => {
                        renderEditMode();
                        // キャレットを末尾に
                        const range = document.createRange();
                        range.selectNodeContents(noteDiv);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        noteDiv.focus();
                    };
                    noteDiv.addEventListener('click', (e) => {
                        // 既に編集モードなら何もしない
                        if (noteDiv.dataset.view === 'edit') return;
                        // マーカーや他の領域クリック誤反応を避けるため自身のみ
                        if (e.target !== noteDiv) return enterEdit();
                        enterEdit();
                    });
    
                    noteDiv.addEventListener('focusout', () => {
                        // DOM保存（従来処理）
                        this._saveScriptFromDOMImmediately();
                        // 最新のMarkdown原文を保持
                        noteDiv.dataset.rawMarkdown = noteDiv.textContent;
                        // ビューモードに戻す
                        renderViewMode();
                    });
    
                    // 入力時: state更新はdebounce、rawMarkdown更新は即時
                    noteDiv.addEventListener('input', () => {
                        noteDiv.dataset.rawMarkdown = noteDiv.textContent;
                    });
                    noteDiv.addEventListener('input', Utils.debounce(() => {
                        this._updateScriptFromDOM();
                    }, 500));
    
                    scriptBlockContainer.appendChild(noteDiv);
                    scriptDisplay.appendChild(scriptBlockContainer);
                });

                // アクティブなスライドブロックまでスクロール
                const activeBlock = scriptDisplay.querySelector('.script-block.active');
                if (activeBlock) {
                    activeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            },

            // DOMから台本内容を再構築しstateに保存
            _updateScriptFromDOM: Utils.debounce(function() {
                const scriptDisplay = this.elements.scriptDisplay;
                if (!scriptDisplay) return;
                let newScriptContent = [];
                scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                    const marker = block.querySelector('.script-marker');
                    const note = block.querySelector('.script-note');
                    if (marker) newScriptContent.push(marker.textContent);
                    if (note) {
                        // 編集モード/表示モードを問わず、Markdown原文を優先的に収集
                        const md = note.dataset.rawMarkdown ?? note.textContent;
                        newScriptContent.push(md);
                    }
                });
                const updatedScript = newScriptContent.join('\n');
                const currentScript = this.state.presentation.script || '';
                if (currentScript !== updatedScript) {
                    this.updateState('presentation.script', updatedScript);
                    this.saveState();
                }
            }, 500),

            // debounceなしで即座にDOMから台本内容を保存
            _saveScriptFromDOMImmediately: function() {
                const scriptDisplay = this.elements.scriptDisplay;
                if (!scriptDisplay) return;
                let newScriptContent = [];
                scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                    const marker = block.querySelector('.script-marker');
                    const note = block.querySelector('.script-note');
                    if (marker) newScriptContent.push(marker.textContent);
                    if (note) {
                        const md = note.dataset.rawMarkdown ?? note.textContent;
                        newScriptContent.push(md);
                    }
                });
                const updatedScript = newScriptContent.join('\n');
                const currentScript = this.state.presentation.script || '';
                if (currentScript !== updatedScript) {
                    this.updateState('presentation.script', updatedScript);
                    this.saveState();
                }
            },

            // 初期化時に台本機能をバインド
            _initScriptFeatures() {
                // 状態の復元（elements キャッシュ後でも安全）
                this._loadScriptPanelState();

                if (this.elements.scriptDisplay) {
                    this.elements.scriptDisplay.addEventListener('input', this.handleScriptInput.bind(this));
                    this.elements.scriptDisplay.addEventListener('focusout', this._saveScriptFromDOMImmediately.bind(this));
                }
                if (this.elements.toggleScriptPanelBtn) {
                    this.elements.toggleScriptPanelBtn.addEventListener('click', () => this.toggleScriptPanel());
                }

                // 初期レンダリングで右サイドバー可視状態を反映
                this.render();
            },

            // 台本入力イベントハンドラ
            handleScriptInput(event) {
                this._updateScriptFromDOM();
            },

            // 台本関連要素をキャッシュ
            _cacheScriptElements() {
                this.elements.scriptDisplay = document.getElementById('script-display');
                this.elements.toggleScriptPanelBtn = document.getElementById('toggle-script-panel-btn');
            },

            // 台本初期state
            _initialScriptState: {
                script: ''
            },

            // 新規プレゼンテーションの初期台本
            _newPresentationScript: '[スライド1]\n',

            // スライド追加時の台本処理
            _addSlideScriptLogic(newSlide, insertionIndex) {
                const newMarker = `[スライド${insertionIndex + 1}]`;
                const newNote = '';
                let scriptLines = (this.state.presentation.script || '').split('\n');
                let insertPoint = scriptLines.length;
                // 挿入位置を決定
                for (let i = 0; i < scriptLines.length; i++) {
                    const match = scriptLines[i].match(/^\[スライド(\d+)\]$/);
                    if (match && parseInt(match[1]) === insertionIndex) {
                        insertPoint = i + 1;
                        while (insertPoint < scriptLines.length && !scriptLines[insertPoint].match(/^\[スライド(\d+)\]$/)) {
                            insertPoint++;
                        }
                        break;
                    }
                }
                scriptLines.splice(insertPoint, 0, newMarker, newNote);
                this.updateState('presentation.script', scriptLines.join('\n'));
                this._reindexScriptMarkers();
            },

            // スライド削除時の台本処理
            _deleteSlideScriptLogic(deletedIdx) {
                let scriptLines = (this.state.presentation.script || '').split('\n');
                let newScriptLines = [];
                let skipUntilNextMarker = false;
                for (let i = 0; i < scriptLines.length; i++) {
                    const line = scriptLines[i];
                    const slideMarkerMatch = line.match(/^\[スライド(\d+)\]$/);
                    if (slideMarkerMatch) {
                        const markerNum = parseInt(slideMarkerMatch[1]) - 1;
                        if (markerNum === deletedIdx) {
                            skipUntilNextMarker = true;
                            continue;
                        } else {
                            skipUntilNextMarker = false;
                        }
                    }
                    if (!skipUntilNextMarker) {
                        newScriptLines.push(line);
                    }
                }
                this.updateState('presentation.script', newScriptLines.join('\n'));
                this._reindexScriptMarkers();
            },

            // スライドマーカー番号を再調整
            _reindexScriptMarkers() {
                let scriptLines = (this.state.presentation.script || '').split('\n');
                let slideCounter = 1;
                let reindexedLines = [];
                scriptLines.forEach(line => {
                    const slideMarkerMatch = line.match(/^\[スライド(\d+)\]$/);
                    if (slideMarkerMatch) {
                        reindexedLines.push(`[スライド${slideCounter}]`);
                        slideCounter++;
                    } else {
                        reindexedLines.push(line);
                    }
                });
                this.updateState('presentation.script', reindexedLines.join('\n'));
                this.renderScript(); // ★ 修正点: 台本エリアを再描画
            },

            // Markdown をプレビュー用にHTMLへ変換し安全に挿入
            _renderMarkdownPreview(markdownText, targetDiv) {
                try {
                    const hasMarked = typeof window.marked !== 'undefined' && window.marked && typeof window.marked.parse === 'function';
                    const hasDOMPurify = typeof window.DOMPurify !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function';

                    if (!targetDiv) return;

                    if (!markdownText) {
                        targetDiv.innerHTML = '';
                        return;
                    }

                    if (hasMarked) {
                        const rawHtml = window.marked.parse(markdownText);
                        const safeHtml = hasDOMPurify ? window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) : rawHtml;
                        targetDiv.innerHTML = safeHtml;
                    } else {
                        // フォールバック: プレーンテキストとして表示
                        targetDiv.textContent = markdownText;
                    }
                } catch (e) {
                    console.error('Markdown preview render failed:', e);
                    targetDiv.textContent = markdownText || '';
                }
            }
        });

        // App初期化後に台本機能を初期化
        const originalAppInit = App.init;
        App.init = function() {
            originalAppInit.apply(this, arguments);
            // elements キャッシュが行われた後に呼ばれるように順序を保証
            // すでに cacheElements をフックしているため、ここでは機能初期化のみ
            this._initScriptFeatures();
        };

        // App.cacheElements後に台本要素をキャッシュ
        const originalCacheElements = App.cacheElements;
        App.cacheElements = function() {
            originalCacheElements.apply(this, arguments);
            this._cacheScriptElements();
        };

        // App.render後に台本をレンダリング
        const originalRender = App.render;
        App.render = function() {
            originalRender.apply(this, arguments);

            // 右サイドバーの表示/非表示を状態から反映
            const rs = this.elements.rightSidebar;
            if (rs) {
                const visible = this.state?.ui?.scriptPanelVisible;
                rs.style.display = visible ? 'flex' : 'none';
            }

            // 台本エリアが編集中なら再描画しない
            const scriptDisplay = this.elements.scriptDisplay;
            if (scriptDisplay && scriptDisplay.contains(document.activeElement)) {
                return;
            }
            this.renderScript();
        };

        // StateManager初期state拡張
        const originalCreateInitialState = StateManager.prototype._createInitialState;
        StateManager.prototype._createInitialState = function() {
            const initialState = originalCreateInitialState.apply(this, arguments);
            Object.assign(initialState.presentation, App._initialScriptState);
            return initialState;
        };

        // 新規プレゼン作成時に台本初期値を設定
        const originalCreateNewPresentation = App.createNewPresentation;
        App.createNewPresentation = function() {
            originalCreateNewPresentation.apply(this, arguments);
            this.updateState('presentation.script', App._newPresentationScript, { silent: true }); // silent:true を追加
        };

        // スライド追加時に台本ロジック追加
        const originalAddSlide = App.addSlide;
        App.addSlide = function(silent = false) {
            const newSlideId = originalAddSlide.apply(this, arguments);
            const newSlide = this.state.presentation.slides.find(s => s.id === newSlideId);
            const insertionIndex = this.state.presentation.slides.findIndex(s => s.id === newSlideId);
            if (newSlide) {
                App._addSlideScriptLogic.call(this, newSlide, insertionIndex);
            }
            return newSlideId;
        };

        // スライド削除時に台本ロジック追加
        const originalDeleteSlide = App.deleteSlide;
        App.deleteSlide = function(slideId, silent = false) {
            // ★ 修正点: オリジナルの削除処理を呼び出す前にインデックスを取得
            const targetId = slideId || this.state.activeSlideId;
            const deletedIdx = this.state.presentation.slides.findIndex(s => s.id === targetId);

            const result = originalDeleteSlide.apply(this, arguments);

            // ★ 修正点: 削除が成功し、かつ有効なインデックスが取得できた場合に台本を削除
            if (result.success && deletedIdx > -1) {
                App._deleteSlideScriptLogic.call(this, deletedIdx);
            }
            return result;
        };
    })();
});