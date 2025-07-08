/**
 * slideScript.js
 * スライド台本パネルの表示・編集・保存機能をAppに追加する
 */
/**
 * slideScript.js
 * スライド台本パネルの表示・編集・保存機能をAppに追加する
 */
(function() {
    if (typeof window.App === 'undefined') {
        console.error("App object is not defined. slideScript.js cannot initialize.");
        return;
    }

    const App = window.App;
    const Utils = window.Utils;
    const StateManager = window.StateManager;
    const Utils = window.Utils;
    const StateManager = window.StateManager;

    // 台本関連の機能をAppに追加
    // 台本関連の機能をAppに追加
    Object.assign(App, {
        // 台本パネルの表示/非表示を切り替え
        // 台本パネルの表示/非表示を切り替え
        toggleScriptPanel() {
            const rightSidebar = this.elements.rightSidebar;
            if (!rightSidebar) return;
            const isVisible = rightSidebar.style.display !== 'none';
            rightSidebar.style.display = isVisible ? 'none' : 'flex';
            localStorage.setItem('webSlideMakerScriptPanelVisible', !isVisible);
        },
        },

        // 台本パネルの表示状態をロード
        _loadScriptPanelState() {
            const rightSidebar = this.elements.rightSidebar;
            if (!rightSidebar) return;
            const savedState = localStorage.getItem('webSlideMakerScriptPanelVisible');
            if (savedState === 'true') {
                rightSidebar.style.display = 'flex';
            } else if (savedState === 'false') {
                rightSidebar.style.display = 'none';
            }
        },
        },

        // 台本エリアをレンダリング
        // 台本エリアをレンダリング
        renderScript() {
            const { presentation, activeSlideId } = this.state;
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;
            scriptDisplay.innerHTML = '';
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

                const noteDiv = document.createElement('div');
                noteDiv.className = 'script-note';
                noteDiv.contentEditable = 'true';
                noteDiv.dataset.slideIndex = slideIndex;
                noteDiv.textContent = noteLines;
                noteDiv.style.minHeight = '1.2em';
                noteDiv.style.padding = '5px 0';
                noteDiv.addEventListener('input', Utils.debounce(() => {
                    this._updateScriptFromDOM();
                }, 500));
                scriptBlockContainer.appendChild(noteDiv);

                scriptDisplay.appendChild(scriptBlockContainer);
            });
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

                const noteDiv = document.createElement('div');
                noteDiv.className = 'script-note';
                noteDiv.contentEditable = 'true';
                noteDiv.dataset.slideIndex = slideIndex;
                noteDiv.textContent = noteLines;
                noteDiv.style.minHeight = '1.2em';
                noteDiv.style.padding = '5px 0';
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
            // アクティブなスライドブロックまでスクロール
            const activeBlock = scriptDisplay.querySelector('.script-block.active');
            if (activeBlock) {
                activeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        },

        // DOMから台本内容を再構築しstateに保存
        // DOMから台本内容を再構築しstateに保存
        _updateScriptFromDOM: Utils.debounce(function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;
            let newScriptContent = [];
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) newScriptContent.push(marker.textContent);
                if (note) newScriptContent.push(note.textContent);
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) newScriptContent.push(marker.textContent);
                if (note) newScriptContent.push(note.textContent);
            });
            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';
            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.updateState('presentation.script', updatedScript);
                this.saveState();
            }
        }, 500),
        }, 500),

        // debounceなしで即座にDOMから台本内容を保存
        // debounceなしで即座にDOMから台本内容を保存
        _saveScriptFromDOMImmediately: function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;
            let newScriptContent = [];
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) newScriptContent.push(marker.textContent);
                if (note) newScriptContent.push(note.textContent);
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) newScriptContent.push(marker.textContent);
                if (note) newScriptContent.push(note.textContent);
            });
            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';
            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.updateState('presentation.script', updatedScript);
                this.saveState();
            }
        },
        },

        // 初期化時に台本機能をバインド
        // 初期化時に台本機能をバインド
        _initScriptFeatures() {
            this._loadScriptPanelState();
            if (this.elements.scriptDisplay) {
                this.elements.scriptDisplay.addEventListener('input', this.handleScriptInput.bind(this));
                this.elements.scriptDisplay.addEventListener('focusout', this._saveScriptFromDOMImmediately.bind(this));
                this.elements.scriptDisplay.addEventListener('focusout', this._saveScriptFromDOMImmediately.bind(this));
            }
            if (this.elements.toggleScriptPanelBtn) {
                this.elements.toggleScriptPanelBtn.addEventListener('click', () => this.toggleScriptPanel());
            }
        },
        },

        // 台本入力イベントハンドラ
        // 台本入力イベントハンドラ
        handleScriptInput(event) {
            this._updateScriptFromDOM();
        },
        },

        // 台本関連要素をキャッシュ
        // 台本関連要素をキャッシュ
        _cacheScriptElements() {
            this.elements.scriptDisplay = document.getElementById('script-display');
            this.elements.toggleScriptPanelBtn = document.getElementById('toggle-script-panel-btn');
        },
        },

        // 台本初期state
        // 台本初期state
        _initialScriptState: {
            script: ''
        },
        },

        // 新規プレゼンテーションの初期台本
        _newPresentationScript: '[スライド1]\n',
        // 新規プレゼンテーションの初期台本
        _newPresentationScript: '[スライド1]\n',

        // スライド追加時の台本処理
        // スライド追加時の台本処理
        _addSlideScriptLogic(newSlide, insertionIndex) {
            const newMarker = `[スライド${insertionIndex + 1}]`;
            const newNote = '';
            const newNote = '';
            let scriptLines = (this.state.presentation.script || '').split('\n');
            let insertPoint = scriptLines.length;
            // 挿入位置を決定
            let insertPoint = scriptLines.length;
            // 挿入位置を決定
            for (let i = 0; i < scriptLines.length; i++) {
                const match = scriptLines[i].match(/^\[スライド(\d+)\]$/);
                if (match && parseInt(match[1]) === insertionIndex) {
                    insertPoint = i + 1;
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
        },

        // スライド削除時の台本処理
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
        },

        // スライドマーカー番号を再調整
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
        }
    });

    // App初期化後に台本機能を初期化
    // App初期化後に台本機能を初期化
    const originalAppInit = App.init;
    App.init = function() {
        originalAppInit.apply(this, arguments);
        this._initScriptFeatures();
    };

    // App.cacheElements後に台本要素をキャッシュ
    // App.cacheElements後に台本要素をキャッシュ
    const originalCacheElements = App.cacheElements;
    App.cacheElements = function() {
        originalCacheElements.apply(this, arguments);
        this._cacheScriptElements();
    };

    // App.render後に台本をレンダリング
    // App.render後に台本をレンダリング
    const originalRender = App.render;
    App.render = function() {
        originalRender.apply(this, arguments);
        // 台本エリアが編集中なら再描画しない
        const scriptDisplay = this.elements.scriptDisplay;
        if (scriptDisplay && scriptDisplay.contains(document.activeElement)) {
            return;
        }
        // 台本エリアが編集中なら再描画しない
        const scriptDisplay = this.elements.scriptDisplay;
        if (scriptDisplay && scriptDisplay.contains(document.activeElement)) {
            return;
        }
        this.renderScript();
    };

    // StateManager初期state拡張
    // StateManager初期state拡張
    const originalCreateInitialState = StateManager.prototype._createInitialState;
    StateManager.prototype._createInitialState = function() {
        const initialState = originalCreateInitialState.apply(this, arguments);
        Object.assign(initialState.presentation, App._initialScriptState);
        return initialState;
    };

    // 新規プレゼン作成時に台本初期値を設定
    // 新規プレゼン作成時に台本初期値を設定
    const originalCreateNewPresentation = App.createNewPresentation;
    App.createNewPresentation = function() {
        originalCreateNewPresentation.apply(this, arguments);
        this.updateState('presentation.script', App._newPresentationScript, { silent: true }); // silent:true を追加
    };

    // スライド追加時に台本ロジック追加
    // スライド追加時に台本ロジック追加
    const originalAddSlide = App.addSlide;
    App.addSlide = function(silent = false) {
        const newSlideId = originalAddSlide.apply(this, arguments);
        const newSlide = this.state.presentation.slides.find(s => s.id === newSlideId);
        const insertionIndex = this.state.presentation.slides.findIndex(s => s.id === newSlideId);
        const insertionIndex = this.state.presentation.slides.findIndex(s => s.id === newSlideId);
        if (newSlide) {
            App._addSlideScriptLogic.call(this, newSlide, insertionIndex);
        }
        return newSlideId;
    };

    // スライド削除時に台本ロジック追加
    // スライド削除時に台本ロジック追加
    const originalDeleteSlide = App.deleteSlide;
    App.deleteSlide = function(slideId, silent = false) {
        const result = originalDeleteSlide.apply(this, arguments);
        if (result.success) {
            const idx = this.state.presentation.slides.findIndex(s => s.id === slideId);
            const idx = this.state.presentation.slides.findIndex(s => s.id === slideId);
            App._deleteSlideScriptLogic.call(this, idx);
        }
        return result;
    };
})();
