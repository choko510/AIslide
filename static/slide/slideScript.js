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

            // 現在フォーカスされている要素がscriptDisplayの子要素であっても更新を許可
            // フォーカスが外れた際に即座に保存されるため、常に最新の状態を反映
            scriptDisplay.innerHTML = ''; // 内容をクリア

                const scriptContent = presentation.script || '';
                const lines = scriptContent.split('\n');
                let currentSlideIndex = -1;

                lines.forEach(line => {
                    const slideMarkerMatch = line.match(/^\[スライド(\d+)\]$/);
                    if (slideMarkerMatch) {
                        // スライドマーカー行
                        currentSlideIndex = parseInt(slideMarkerMatch[1]) - 1;
                        const markerDiv = document.createElement('div');
                        markerDiv.className = 'script-marker';
                        markerDiv.textContent = line;
                        markerDiv.contentEditable = 'false'; // 編集不可
                        markerDiv.style.fontWeight = 'bold'; // 太字
                        markerDiv.style.marginTop = '10px';
                        markerDiv.style.marginBottom = '5px';
                        markerDiv.style.color = 'var(--primary-color)';
                        markerDiv.style.userSelect = 'none'; // 選択不可

                        if (presentation.slides[currentSlideIndex]?.id === activeSlideId) {
                            markerDiv.classList.add('active-slide-marker');
                            markerDiv.style.backgroundColor = 'var(--highlight-color)'; // ハイライト
                            markerDiv.style.padding = '2px 5px';
                            markerDiv.style.borderRadius = '3px';
                        }
                        scriptDisplay.appendChild(markerDiv);
                    } else {
                        // ノート行
                        const noteDiv = document.createElement('div');
                        noteDiv.className = 'script-note';
                        noteDiv.contentEditable = 'true'; // 編集可能
                        noteDiv.dataset.slideIndex = currentSlideIndex; // どのスライドのノートか識別
                        noteDiv.textContent = line;
                        noteDiv.style.minHeight = '1.2em'; // 空行でも高さを持つように
                        noteDiv.style.padding = '2px 0';

                        // ノートの変更をstateに反映するイベントリスナー
                        // debounceを使って入力頻度を制限し、パフォーマンスを向上
                        noteDiv.addEventListener('input', Utils.debounce(() => {
                            this._updateScriptFromDOM();
                        }, 500));

                        scriptDisplay.appendChild(noteDiv);
                    }
                });
            // } // この閉じ括弧は余分であるか、位置が不適切です。削除または適切に配置してください。
        }, // <= ここにカンマを追加 (renderScriptメソッドの閉じ括弧後)

        // DOMから台本の内容を再構築してstateに保存するヘルパー
        _updateScriptFromDOM: Utils.debounce(function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;

            let newScriptContent = [];
            scriptDisplay.childNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList.contains('script-marker')) {
                        newScriptContent.push(node.textContent);
                    } else if (node.classList.contains('script-note')) {
                        newScriptContent.push(node.textContent);
                    }
                } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                    // テキストノードが直接scriptDisplayにある場合（通常は発生しないはずだが念のため）
                    newScriptContent.push(node.textContent.trim());
                }
            });

            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';

            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.state.presentation.script = updatedScript;
                this.saveState();
            }
        }, 500), // debounce delay
        // <= ここにカンマを追加 (_updateScriptFromDOMメソッドの閉じ括弧後)

        // DOMから台本の内容を即座に再構築してstateに保存するヘルパー (debounceなし)
        _saveScriptFromDOMImmediately: function() {
            const scriptDisplay = this.elements.scriptDisplay;
            if (!scriptDisplay) return;

            let newScriptContent = [];
            scriptDisplay.childNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList.contains('script-marker')) {
                        newScriptContent.push(node.textContent);
                    } else if (node.classList.contains('script-note')) {
                        newScriptContent.push(node.textContent);
                    }
                } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                    newScriptContent.push(node.textContent.trim());
                }
            });

            const updatedScript = newScriptContent.join('\n');
            const currentScript = this.state.presentation.script || '';

            if (currentScript !== updatedScript) {
                this.stateManager._saveToHistory();
                this.state.presentation.script = updatedScript;
                this.saveState();
            }
        }, // <= ここにカンマを追加 (_saveScriptFromDOMImmediatelyメソッドの閉じ括弧後)

        // App初期化時に台本関連の処理をバインド
        _initScriptFeatures() {
            // 台本パネルの初期表示状態をロード
            this._loadScriptPanelState();

            // 台本入力イベント
            if (this.elements.scriptDisplay) {
                this.elements.scriptDisplay.addEventListener('input', this.handleScriptInput.bind(this));
                // 追加: フォーカスが外れたときに即座に更新 (debounceなしの関数を呼び出す)
                this.elements.scriptDisplay.addEventListener('blur', this._saveScriptFromDOMImmediately.bind(this));
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