// slideScript.js

(function() {
    // Appオブジェクトが利用可能であることを確認
    // window.App を使用してグローバルスコープからアクセス
    if (typeof window.App === 'undefined') {
        console.error("App object is not defined. slideScript.js cannot initialize.");
        return;
    }

    const App = window.App;
    const Utils = window.Utils; // Utilsもグローバルから取得
    const StateManager = window.StateManager; // StateManagerもグローバルから取得

    // Appオブジェクトに台本関連のプロパティとメソッドを追加
    Object.assign(App, {
        // 台本パネルの表示/非表示を切り替える
        toggleScriptPanel() {
            const rightSidebar = this.elements.rightSidebar;
            if (!rightSidebar) return;

            const isVisible = rightSidebar.style.display !== 'none';
            rightSidebar.style.display = isVisible ? 'none' : 'flex';
            localStorage.setItem('webSlideMakerScriptPanelVisible', !isVisible);
        }, // <= ここにカンマを追加

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
            // savedStateがnullの場合はHTMLのデフォルト（display: none）が適用される
        }, // <= ここにカンマを追加

        // 台本表示のレンダリング
        renderScript() {
            const { presentation, activeSlideId } = this.state;
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;

            scriptDisplay.innerHTML = ''; // 内容をクリア

            const scriptContent = presentation.script || '';
            const slidesScripts = scriptContent.split(/(?=\[スライド\d+\])/g).filter(s => s.trim());

            slidesScripts.forEach((scriptBlock, index) => {
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

        // DOMから台本の内容を再構築してstateに保存するヘルパー
        _updateScriptFromDOM: Utils.debounce(function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;

            let newScriptContent = [];
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) {
                    newScriptContent.push(marker.textContent);
                }
                if (note) {
                    newScriptContent.push(note.textContent);
                }
            });

            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';

            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.state.presentation.script = updatedScript;
                this.saveState();
            }
        }, 500),
        // <= ここにカンマを追加 (_updateScriptFromDOMメソッドの閉じ括弧後)

        // DOMから台本の内容を即座に再構築してstateに保存するヘルパー (debounceなし)
        _saveScriptFromDOMImmediately: function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;

            let newScriptContent = [];
            scriptDisplay.querySelectorAll('.script-block').forEach(block => {
                const marker = block.querySelector('.script-marker');
                const note = block.querySelector('.script-note');
                if (marker) {
                    newScriptContent.push(marker.textContent);
                }
                if (note) {
                    newScriptContent.push(note.textContent);
                }
            });

            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';

            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.state.presentation.script = updatedScript;
                this.saveState();
            }
        },

        // App初期化時に台本関連の処理をバインド
        _initScriptFeatures() {
            // 台本パネルの初期表示状態をロード
            this._loadScriptPanelState();

            // 台本入力イベント
            if (this.elements.scriptDisplay) {
                this.elements.scriptDisplay.addEventListener('input', this.handleScriptInput.bind(this));
                // focusoutはバブリングするため、子要素のdivからフォーカスが外れた場合も検知できる
                this.elements.scriptDisplay.addEventListener('focusout', this._saveScriptFromDOMImmediately.bind(this));
            }

            // 台本パネル切り替えボタン
            if (this.elements.toggleScriptPanelBtn) {
                this.elements.toggleScriptPanelBtn.addEventListener('click', () => this.toggleScriptPanel());
            }
        }, // <= ここにカンマを追加 (_initScriptFeaturesメソッドの閉じ括弧後)

        // handleScriptInput メソッドを追加
        handleScriptInput(event) {
            // ここで必要に応じてイベント処理ロジックを追加
            // 例えば、debounceされた_updateScriptFromDOMを呼び出すなど
            this._updateScriptFromDOM();
        }, // <= ここにカンマを追加 (handleScriptInputメソッドの閉じ括弧後)

        // App.cacheElementsの拡張
        _cacheScriptElements() {
            this.elements.scriptDisplay = document.getElementById('script-display');
            this.elements.toggleScriptPanelBtn = document.getElementById('toggle-script-panel-btn');
        }, // <= ここにカンマを追加 (_cacheScriptElementsメソッドの閉じ括弧後)

        // App._createInitialStateの拡張
        _initialScriptState: {
            script: ''
        }, // <= ここにカンマを追加 (_initialScriptStateオブジェクトの閉じ括弧後)

        // App.createNewPresentationの拡張
        _newPresentationScript: '[スライド1]\n', // 新しいプレゼンテーションの初期台本
        // 上の行にはすでにカンマがあるので修正不要

        // App.addSlideの拡張
        _addSlideScriptLogic(newSlide, insertionIndex) {
            // 新しいスライドのマーカーと空のノートを追加
            const newMarker = `[スライド${insertionIndex + 1}]`;
            const newNote = ''; // 空のノート
            
            let scriptLines = (this.state.presentation.script || '').split('\n');
            let insertPoint = scriptLines.length; // デフォルトは末尾

            // 挿入位置を特定
            // 既存のスライドマーカーの直後に挿入
            for (let i = 0; i < scriptLines.length; i++) {
                const match = scriptLines[i].match(/^\[スライド(\d+)\]$/);
                if (match && parseInt(match[1]) === insertionIndex) {
                    insertPoint = i + 1; // マーカーの次の行
                    // そのスライドのノートがあれば、そのノートの終わりまでスキップ
                    while (insertPoint < scriptLines.length && !scriptLines[insertPoint].match(/^\[スライド(\d+)\]$/)) {
                        insertPoint++;
                    }
                    break;
                }
            }

            scriptLines.splice(insertPoint, 0, newMarker, newNote);
            this.state.presentation.script = scriptLines.join('\n');

            // スライド番号の再調整
            this._reindexScriptMarkers();
        }, // <= ここにカンマを追加 (_addSlideScriptLogicメソッドの閉じ括弧後)

        // App.deleteSlideの拡張
        _deleteSlideScriptLogic(deletedIdx) {
            let scriptLines = (this.state.presentation.script || '').split('\n');
            let newScriptLines = [];
            let currentIdx = -1;
            let skipUntilNextMarker = false;

            for (let i = 0; i < scriptLines.length; i++) {
                const line = scriptLines[i];
                const slideMarkerMatch = line.match(/^\[スライド(\d+)\]$/);

                if (slideMarkerMatch) {
                    const markerNum = parseInt(slideMarkerMatch[1]) - 1; // 0-indexed
                    if (markerNum === deletedIdx) {
                        // 削除対象のスライドマーカーとそれに続くノートをスキップ
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
            this.state.presentation.script = newScriptLines.join('\n');

            // スライド番号の再調整
            this._reindexScriptMarkers();
        }, // <= ここにカンマを追加 (_deleteSlideScriptLogicメソッドの閉じ括弧後)

        // スライドマーカーの番号を再調整するヘルパー
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
            this.state.presentation.script = reindexedLines.join('\n');
        } // これはObject.assignの最後のプロパティなので、カンマは不要です
    }); // Object.assign(App, { ... }); の閉じ括弧

    // App.init()の後に台本機能を初期化するフック
    const originalAppInit = App.init;
    App.init = function() {
        originalAppInit.apply(this, arguments);
        this._initScriptFeatures();
    };

    // App.cacheElements()の後に台本要素をキャッシュするフック
    const originalCacheElements = App.cacheElements;
    App.cacheElements = function() {
        originalCacheElements.apply(this, arguments);
        this._cacheScriptElements();
    };

    // App.render()の後に台本をレンダリングするフック
    const originalRender = App.render;
    App.render = function() {
        originalRender.apply(this, arguments);

        // 台本エリアが編集中（フォーカスされている）場合は、
        // renderScriptを呼び出さないことで、入力中のフォーカス消失を防ぐ。
        // フォーカスが外れた（blur/focusout）時に保存と再描画が行われるため、
        // データの整合性は保たれる。
        const scriptDisplay = this.elements.scriptDisplay;
        if (scriptDisplay && scriptDisplay.contains(document.activeElement)) {
            return;
        }

        this.renderScript();
    };

    // App._createInitialState()の後に台本初期状態を追加するフック
    const originalCreateInitialState = StateManager.prototype._createInitialState;
    StateManager.prototype._createInitialState = function() {
        const initialState = originalCreateInitialState.apply(this, arguments);
        Object.assign(initialState.presentation, App._initialScriptState);
        return initialState;
    };

    // App.createNewPresentation()の後に台本初期値を設定するフック
    const originalCreateNewPresentation = App.createNewPresentation;
    App.createNewPresentation = function() {
        originalCreateNewPresentation.apply(this, arguments);
        this.state.presentation.script = App._newPresentationScript;
    };

    // App.addSlide()の後に台本ロジックを追加するフック
    const originalAddSlide = App.addSlide;
    App.addSlide = function(silent = false) {
        const newSlideId = originalAddSlide.apply(this, arguments);
        const newSlide = this.state.presentation.slides.find(s => s.id === newSlideId);
        const insertionIndex = this.state.presentation.slides.findIndex(s => s.id === newSlideId); // 挿入されたスライドのインデックス
        if (newSlide) {
            App._addSlideScriptLogic.call(this, newSlide, insertionIndex);
        }
        return newSlideId;
    };

    // App.deleteSlide()の後に台本ロジックを追加するフック
    const originalDeleteSlide = App.deleteSlide;
    App.deleteSlide = function(slideId, silent = false) {
        const result = originalDeleteSlide.apply(this, arguments);
        if (result.success) {
            const idx = this.state.presentation.slides.findIndex(s => s.id === slideId); // 削除されたスライドの元のインデックス
            App._deleteSlideScriptLogic.call(this, idx);
        }
        return result;
    };
})();
