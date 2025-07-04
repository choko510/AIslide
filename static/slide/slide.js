        // =================================================================
        // 構成定数
        // =================================================================
        const CONFIG = {
            SNAP_THRESHOLD: 5,
            DEFAULT_FONT_SIZE: 24,
            MAX_UNDO_STACK: 100,
            DEFAULT_ELEMENT_SIZE: {
                width: 30,
                height: null
            },
            CANVAS_SCALE: {
                min: 0.2,
                max: 6.0,
                default: 1.0
            },
            ANIMATION_DURATION: 300,
            DEBOUNCE_DELAY: 300
        };

        // キャンバスのデフォルトサイズ定数
        const CANVAS_WIDTH = 1280;
        const CANVAS_HEIGHT = 720;

        // =================================================================
        // エラーハンドリング
        // =================================================================
        class ErrorHandler {
            static handle(error, context = '') {
                console.error(`[${context}] Error:`, error);
                
                // ユーザーフレンドリーなエラーメッセージ
                const userMessage = this.getUserMessage(error, context);
                if (userMessage && !window.developmentMode) {
                    this.showNotification(userMessage, 'error');
                }
                
                // 開発モードでの詳細ログ
                if (window.developmentMode) {
                    console.trace('Error stack trace:', error);
                }
            }

            static getUserMessage(error, context) {
                const errorMap = {
                    'file_read': 'ファイルの読み込みに失敗しました',
                    'save_state': '保存に失敗しました',
                    'render': '画面の描画でエラーが発生しました',
                    'export': 'エクスポートに失敗しました'
                };
                return errorMap[context] || 'エラーが発生しました';
            }

            static showNotification(message, type = 'info') {
                // 簡易通知システム
                const notification = document.createElement('div');
                notification.className = `notification notification--${type}`;
                notification.textContent = message;
                notification.style.cssText = `
                    position: fixed; top: 20px; right: 20px; z-index: 10000;
                    padding: 12px 16px; border-radius: 6px; color: white;
                    background: ${type === 'error' ? '#dc3545' : '#28a745'};
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    animation: slideIn 0.3s ease;
                `;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }
        }

        // =================================================================
        // 検証ユーティリティ
        // =================================================================
        class Validator {
            static validateElementType(type) {
                const validTypes = ['text', 'image', 'video', 'chart', 'table', 'icon', 'iframe', 'shape'];
                if (!validTypes.includes(type)) {
                    throw new Error(`Invalid element type: ${type}`);
                }
                return true;
            }

            static validateContent(content, type) {
                if (content === null || content === undefined) return true;
                
                switch (type) {
                    case 'text':
                        return typeof content === 'string';
                    case 'image':
                        return typeof content === 'string' &&
                               (content.startsWith('data:') || content.startsWith('http') || content.startsWith('blob:'));
                    case 'video':
                        return content && typeof content === 'object' && content.url;
                    case 'chart':
                        return content && typeof content === 'object' && content.type;
                    case 'shape':
                        return content && typeof content === 'object' && content.shapeType;
                    default:
                        return true;
                }
            }

            static validateStyle(style) {
                if (!style || typeof style !== 'object') return false;
                
                const required = ['top', 'left', 'width', 'zIndex'];
                return required.every(prop => typeof style[prop] === 'number');
            }
        }

        // =================================================================
        // GuideLineManager: スマートガイドとスナップ機能の管理
        // =================================================================
        class GuideLineManager {
            constructor(container) {
                this.container = container;
                this.guides = [];
                this.SNAP_THRESHOLD = CONFIG.SNAP_THRESHOLD;
            }

            clear() {
                try {
                    this.container.querySelectorAll('.guide-line').forEach(el => el.remove());
                    this.guides = [];
                } catch (error) {
                    ErrorHandler.handle(error, 'guide_clear');
                }
            }

            addGuide(orientation, position) {
                try {
                    if (!['horizontal', 'vertical'].includes(orientation)) {
                        throw new Error(`Invalid orientation: ${orientation}`);
                    }
                    
                    const guide = document.createElement('div');
                    guide.className = `guide-line ${orientation}`;
                    
                    if (orientation === 'horizontal') {
                        guide.style.top = `${position}px`;
                    } else {
                        guide.style.left = `${position}px`;
                    }
                    
                    this.container.appendChild(guide);
                } catch (error) {
                    ErrorHandler.handle(error, 'guide_add');
                }
            }

            calculateSnapGuides(draggingBounds, staticElementsBounds, canvasBounds) {
                try {
                    const snapOffset = { x: 0, y: 0 };
                    const guidesToShow = new Set();

                    const verticalSnapLines = [canvasBounds.left, canvasBounds.centerX, canvasBounds.right];
                    const horizontalSnapLines = [canvasBounds.top, canvasBounds.centerY, canvasBounds.bottom];

                    staticElementsBounds.forEach(bounds => {
                        verticalSnapLines.push(bounds.left, bounds.centerX, bounds.right);
                        horizontalSnapLines.push(bounds.top, bounds.centerY, bounds.bottom);
                    });

                    // 垂直方向のスナップ計算
                    const verticalSnap = this._calculateDirectionalSnap(
                        [draggingBounds.left, draggingBounds.centerX, draggingBounds.right],
                        verticalSnapLines
                    );
                    
                    if (verticalSnap.hasSnap) {
                        snapOffset.x = verticalSnap.offset;
                        verticalSnap.lines.forEach(l => guidesToShow.add(`vertical-${l}`));
                    }

                    // 水平方向のスナップ計算
                    const horizontalSnap = this._calculateDirectionalSnap(
                        [draggingBounds.top, draggingBounds.centerY, draggingBounds.bottom],
                        horizontalSnapLines
                    );
                    
                    if (horizontalSnap.hasSnap) {
                        snapOffset.y = horizontalSnap.offset;
                        horizontalSnap.lines.forEach(l => guidesToShow.add(`horizontal-${l}`));
                    }

                    return { snapOffset, guides: Array.from(guidesToShow) };
                } catch (error) {
                    ErrorHandler.handle(error, 'snap_calculation');
                    return { snapOffset: { x: 0, y: 0 }, guides: [] };
                }
            }

            _calculateDirectionalSnap(draggingLines, targetLines) {
                let minDistance = this.SNAP_THRESHOLD;
                let snapOffset = 0;
                let snapLines = [];

                for (const draggingLine of draggingLines) {
                    for (const targetLine of targetLines) {
                        const distance = targetLine - draggingLine;
                        if (Math.abs(distance) <= this.SNAP_THRESHOLD && Math.abs(distance) < Math.abs(minDistance)) {
                            minDistance = distance;
                            snapOffset = distance;
                            snapLines = draggingLines.map(l => l + snapOffset);
                        }
                    }
                }

                return {
                    hasSnap: minDistance !== this.SNAP_THRESHOLD,
                    offset: snapOffset,
                    lines: snapLines
                };
            }
        }

        // =================================================================
        // 状態管理
        // =================================================================
        class StateManager {
            constructor() {
                this.state = this._createInitialState();
                this.listeners = new Map();
                this._undoStack = [];
                this._redoStack = [];
            }

            _createInitialState() {
                return {
                    presentation: {
                        settings: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, globalCss: '' },
                        slides: [],
                        groups: {} // { 'slideId': [{ id: 'group-xxx', elementIds: [...] }] }
                    },
                    activeSlideId: null,
                    selectedElementIds: [],
                    selectedGroupIds: [],
                    isEditingText: false,
                    
                    interaction: {
                        isDragging: false,
                        isResizing: false,
                        isCtrlPressed: false,
                        handle: null,
                        startX: 0,
                        startY: 0,
                        initialStates: [],
                        lastDx: 0,
                        lastDy: 0,
                        lastSnapOffset: { x: 0, y: 0 }
                    },
                    
                    canvas: {
                        rect: null,
                        scale: CONFIG.CANVAS_SCALE.default,
                        pan: { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 }
                    },

                    ui: {
                        sidebarWidth: 340,
                        rightSidebarWidth: 300,
                        leftSidebarCollapsed: false
                    }
                };
            }

            // 状態の取得
            get(path) {
                if (!path) return Utils.deepClone(this.state);
                
                const keys = path.split('.');
                let current = this.state;
                
                for (const key of keys) {
                    if (current === null || current === undefined) return undefined;
                    current = current[key];
                }
                
                return current;
            }

            // 状態の更新
            set(path, value, options = {}) {
                try {
                    const { silent = false, skipHistory = false } = options;
                    
                    if (!skipHistory && !this._skipHistory) {
                        this._saveToHistory();
                    }

                    const keys = path.split('.');
                    const lastKey = keys.pop();
                    let current = this.state;
                    
                    for (const key of keys) {
                        if (!(key in current)) {
                            current[key] = {};
                        }
                        current = current[key];
                    }
                    
                    const oldValue = current[lastKey];
                    current[lastKey] = value;
                    
                    if (!silent) {
                        this._notifyListeners(path, value, oldValue);
                    }
                    
                    return true;
                } catch (error) {
                    ErrorHandler.handle(error, 'state_update');
                    return false;
                }
            }

            // 複数の状態を一括更新
            batch(updates, options = {}) {
                const { silent = false } = options;
                
                if (!this._skipHistory) {
                    this._saveToHistory();
                }

                this._skipHistory = true;
                
                try {
                    const changedPaths = [];
                    
                    for (const [path, value] of Object.entries(updates)) {
                        if (this.set(path, value, { silent: true, skipHistory: true })) {
                            changedPaths.push(path);
                        }
                    }
                    
                    if (!silent) {
                        changedPaths.forEach(path => {
                            this._notifyListeners(path, this.get(path));
                        });
                    }
                } finally {
                    this._skipHistory = false;
                }
            }

            // リスナーの登録
            subscribe(path, callback) {
                if (!this.listeners.has(path)) {
                    this.listeners.set(path, new Set());
                }
                this.listeners.get(path).add(callback);
                
                // アンサブスクライブ関数を返す
                return () => {
                    const pathListeners = this.listeners.get(path);
                    if (pathListeners) {
                        pathListeners.delete(callback);
                        if (pathListeners.size === 0) {
                            this.listeners.delete(path);
                        }
                    }
                };
            }

            _notifyListeners(path, newValue, oldValue) {
                // 完全一致のリスナーに通知
                const exactListeners = this.listeners.get(path);
                if (exactListeners) {
                    exactListeners.forEach(callback => {
                        try {
                            callback(newValue, oldValue, path);
                        } catch (error) {
                            ErrorHandler.handle(error, 'state_listener');
                        }
                    });
                }

                // パスの親に対するリスナーにも通知
                const pathParts = path.split('.');
                for (let i = pathParts.length - 1; i > 0; i--) {
                    const parentPath = pathParts.slice(0, i).join('.');
                    const parentListeners = this.listeners.get(parentPath);
                    if (parentListeners) {
                        parentListeners.forEach(callback => {
                            try {
                                callback(this.get(parentPath), undefined, parentPath);
                            } catch (error) {
                                ErrorHandler.handle(error, 'state_listener');
                            }
                        });
                    }
                }
            }

            _saveToHistory() {
                this._undoStack.push(Utils.deepClone(this.state));
                if (this._undoStack.length > CONFIG.MAX_UNDO_STACK) {
                    this._undoStack.shift();
                }
                this._redoStack = []; // 新しい操作でredoスタックをクリア
            }

            undo() {
                if (this._undoStack.length === 0) return false;
                this._redoStack.push(Utils.deepClone(this.state));
                this.state = this._undoStack.pop();
                return true;
            }

            redo() {
                if (this._redoStack.length === 0) return false;
                this._undoStack.push(Utils.deepClone(this.state));
                this.state = this._redoStack.pop();
                return true;
            }

            // 履歴をクリア
            clearHistory() {
                this._undoStack = [];
                this._redoStack = [];
            }

            // 台本パネルの表示/非表示を切り替える
            toggleScriptPanel() {
                const rightSidebar = this.elements.rightSidebar;
                if (!rightSidebar) return;

                const isVisible = rightSidebar.style.display !== 'none';
                rightSidebar.style.display = isVisible ? 'none' : 'flex';
                localStorage.setItem('webSlideMakerScriptPanelVisible', !isVisible);
            }

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
            }

            // 状態のリセット
            reset() {
                this.state = this._createInitialState();
                this.clearHistory();
                this._notifyListeners('*', this.state);
            }
        }
        window.StateManager = StateManager; // StateManagerクラスをグローバルに公開

        // =================================================================
        // ユーティリティ関数群
        // =================================================================
        const Utils = window.Utils = { // Utilsオブジェクトをグローバルに公開
            generateId: (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            
            debounce: (func, wait = CONFIG.DEBOUNCE_DELAY) => {
                let timeout;
                return function executedFunction(...args) {
                    const context = this; // thisをキャプチャ
                    const later = () => {
                        clearTimeout(timeout);
                        func.apply(context, args); // キャプチャしたthisを適用
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            },

            throttle: (func, limit) => {
                let inThrottle;
                return function(...args) {
                    if (!inThrottle) {
                        func.apply(this, args);
                        inThrottle = true;
                        setTimeout(() => inThrottle = false, limit);
                    }
                };
            },

            clamp: (value, min, max) => {
                if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
                    throw new Error('clamp requires numeric values');
                }
                return Math.min(Math.max(value, min), max);
            },
            
            pixelsToPercent: (pixels, containerSize) => {
                if (containerSize === 0) return 0;
                return (pixels / containerSize) * 100;
            },
            
            percentToPixels: (percent, containerSize) => (percent / 100) * containerSize,

            // 新しいユーティリティメソッド
            deepClone: (obj) => {
                // モダンブラウザでネイティブサポートされている structuredClone() を優先的に使用
                if (typeof structuredClone === 'function') {
                    try {
                        return structuredClone(obj);
                    } catch (e) {
                        // structuredCloneが失敗した場合 (例: DOM要素などを含む場合)
                        // フォールバックの再帰的コピーに処理を移す
                        console.warn("structuredClone failed, falling back to recursive clone.", e);
                    }
                }

                // フォールバックとしての再帰的なディープコピー処理
                const recursiveClone = (current) => {
                    // プリミティブ値やnullはそのまま返す
                    if (current === null || typeof current !== 'object') {
                        return current;
                    }

                    // Dateオブジェクトのコピー
                    if (current instanceof Date) {
                        return new Date(current.getTime());
                    }

                    // 配列のコピー
                    if (Array.isArray(current)) {
                        const newArr = [];
                        for (let i = 0; i < current.length; i++) {
                            newArr[i] = recursiveClone(current[i]);
                        }
                        return newArr;
                    }

                    // 一般的なオブジェクトのコピー
                    const newObj = {};
                    for (const key in current) {
                        // プロトタイプチェーンのプロパティはコピーしない
                        if (Object.prototype.hasOwnProperty.call(current, key)) {
                            newObj[key] = recursiveClone(current[key]);
                        }
                    }
                    return newObj;
                };

                try {
                    return recursiveClone(obj);
                } catch (error) {
                    ErrorHandler.handle(error, 'deep_clone_fallback');
                    // エラーが発生した場合は、安全のためにnullを返す
                    return null;
                }
            },

            sanitizeHtml: (html) => {
                const div = document.createElement('div');
                div.textContent = html;
                return div.innerHTML;
            },

            formatFileSize: (bytes) => {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            },

            // DOM関連ユーティリティ
            createElement: (tag, attributes = {}, children = []) => {
                const element = document.createElement(tag);
                
                for (const [key, value] of Object.entries(attributes)) {
                    if (key === 'style' && typeof value === 'object') {
                        Object.assign(element.style, value);
                    } else if (key === 'dataset' && typeof value === 'object') {
                        Object.assign(element.dataset, value);
                    } else {
                        element[key] = value;
                    }
                }
                
                children.forEach(child => {
                    if (typeof child === 'string') {
                        element.appendChild(document.createTextNode(child));
                    } else if (child instanceof Node) {
                        element.appendChild(child);
                    }
                });
                
                return element;
            },

            // 配列関連ユーティリティ
            arrayMove: (arr, fromIndex, toIndex) => {
                const element = arr[fromIndex];
                arr.splice(fromIndex, 1);
                arr.splice(toIndex, 0, element);
                return arr;
            },

            // 数値関連ユーティリティ
            roundTo: (num, places) => {
                const factor = Math.pow(10, places);
                return Math.round(num * factor) / factor;
            },

            // 文字列関連ユーティリティ
            capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
            
            kebabCase: (str) => str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase(),

            // 型チェックユーティリティ
            isPlainObject: (obj) => {
                return obj !== null && typeof obj === 'object' && obj.constructor === Object;
            },

            isEmpty: (value) => {
                if (value === null || value === undefined) return true;
                if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
                if (typeof value === 'object') return Object.keys(value).length === 0;
                return false;
            }
        };

        // =================================================================
        // DOM要素作成ヘルパー
        // =================================================================
        class ElementFactory {
            static createElement(elData) {
                try {
                    // 入力検証
                    if (!elData || !elData.type) {
                        throw new Error('Invalid element data');
                    }

                    Validator.validateElementType(elData.type);
                    Validator.validateContent(elData.content, elData.type);

                    // ファクトリーメソッドパターンで要素を作成
                    const methodName = `_create${elData.type.charAt(0).toUpperCase() + elData.type.slice(1)}`;
                    const method = this[methodName];
                    
                    if (!method) {
                        throw new Error(`Unknown element type: ${elData.type}`);
                    }

                    return method.call(this, elData);
                } catch (error) {
                    ErrorHandler.handle(error, 'element_creation');
                    return this._createErrorPlaceholder(elData?.type || 'unknown');
                }
            }

            static _createText(elData) {
                // テキスト要素の場合は、文字列として返す
                return elData.content || '';
            }

            static _createImage(elData) {
                const container = document.createDocumentFragment();
                const img = document.createElement('img');
                
                // 画像の読み込みエラーハンドリング
                img.onerror = () => {
                    img.alt = '画像を読み込めませんでした';
                    img.style.backgroundColor = '#f8f9fa';
                    img.style.border = '1px dashed #dee2e6';
                };
                
                img.src = elData.content;
                container.appendChild(img);

                // Base64またはBlob URLの場合のみ編集ボタンを追加
                if (this._isEditableImage(elData.content)) {
                    const editButton = this._createImageEditButton();
                    container.appendChild(editButton);
                }

                return container;
            }

            static _createVideo(elData) {
                const video = document.createElement('video');
                const content = elData.content || {};
                
                Object.assign(video.style, {
                    width: '100%',
                    height: '100%'
                });
                
                video.src = content.url || '';
                video.autoplay = !!content.autoplay;
                video.loop = !!content.loop;
                video.controls = content.controls !== false;
                video.playsInline = true;
                
                // 動画読み込みエラーハンドリング
                video.onerror = () => {
                    ErrorHandler.handle(new Error('Video load failed'), 'video_load');
                };
                
                return video;
            }

            static _createChart(elData) {
                const canvas = document.createElement('canvas');
                canvas.id = `chart-${elData.id}`;
                
                Object.assign(canvas.style, {
                    width: '100%',
                    height: '100%'
                });
                
                // Chart.jsの非同期初期化
                this._initializeChart(canvas, elData.content);
                
                return canvas;
            }

            static _createTable(elData) {
                const table = document.createElement('table');
                const content = elData.content || { rows: 2, cols: 2, data: [] };
                
                Object.assign(table.style, {
                    width: '100%',
                    height: '100%',
                    borderCollapse: 'collapse'
                });
                
                for (let r = 0; r < content.rows; r++) {
                    const tr = document.createElement('tr');
                    for (let c = 0; c < content.cols; c++) {
                        const td = document.createElement('td');
                        td.textContent = content.data?.[r]?.[c] ?? '';
                        Object.assign(td.style, {
                            border: '1px solid #888',
                            padding: '4px'
                        });
                        tr.appendChild(td);
                    }
                    table.appendChild(tr);
                }
                
                return table;
            }

            static _createIcon(elData) {
                if (elData.iconType === 'fa') {
                    return this._createFontAwesomeIcon(elData);
                } else if (elData.iconType === 'mi') {
                    return this._createMaterialIcon(elData);
                }
                
                return this._createErrorPlaceholder('icon');
            }

            static _createIframe(elData) {
                const container = document.createDocumentFragment();
                const content = elData.content || {};
                
                const iframe = document.createElement('iframe');
                iframe.src = content.url || '';
                Object.assign(iframe.style, {
                    width: '100%',
                    height: '100%',
                    border: 'none'
                });
                iframe.sandbox = content.sandbox || 'allow-scripts allow-same-origin';
                
                const overlay = this._createIframeOverlay();
                
                container.appendChild(iframe);
                container.appendChild(overlay);
                return container;
            }

            static _createShape(elData) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '100%');
                svg.setAttribute('viewBox', '0 0 100 100');
                svg.style.overflow = 'visible';
                svg.style.pointerEvents = 'none'; // クリックイベントが親要素に渡るようにする

                const shapeContent = elData.content;
                const style = elData.style;
                let shape;

                switch (shapeContent.shapeType) {
                    case 'rectangle':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        shape.setAttribute('x', 0);
                        shape.setAttribute('y', 0);
                        shape.setAttribute('width', 100);
                        shape.setAttribute('height', 100);
                        break;
                    case 'circle':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        shape.setAttribute('cx', 50);
                        shape.setAttribute('cy', 50);
                        shape.setAttribute('r', 50);
                        break;
                    case 'triangle':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        shape.setAttribute('points', '50,0 100,100 0,100');
                        break;
                    case 'line':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        shape.setAttribute('x1', 0);
                        shape.setAttribute('y1', 50);
                        shape.setAttribute('x2', 100);
                        shape.setAttribute('y2', 50);
                        shape.setAttribute('stroke', style.stroke || '#000000');
                        shape.setAttribute('stroke-width', style.strokeWidth || 2);
                        break;
                    case 'arrow':
                        svg.setAttribute('viewBox', '0 0 110 100'); // ViewBoxを広げて矢じりが見えるように
                        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                        marker.setAttribute('id', `arrowhead-${elData.id}`);
                        marker.setAttribute('markerWidth', '10');
                        marker.setAttribute('markerHeight', '7');
                        marker.setAttribute('refX', '0');
                        marker.setAttribute('refY', '3.5');
                        marker.setAttribute('orient', 'auto');
                        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
                        polygon.setAttribute('fill', style.stroke || '#000000');
                        marker.appendChild(polygon);
                        defs.appendChild(marker);
                        svg.appendChild(defs);
                        
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        shape.setAttribute('x1', '0');
                        shape.setAttribute('y1', '50');
                        shape.setAttribute('x2', '90'); // 矢じりの分だけ短く
                        shape.setAttribute('y2', '50');
                        shape.setAttribute('stroke', style.stroke || '#000000');
                        shape.setAttribute('stroke-width', style.strokeWidth || 2);
                        shape.setAttribute('marker-end', `url(#arrowhead-${elData.id})`);
                        break;
                    case 'star':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        shape.setAttribute('points', '50,5 61,40 98,40 68,62 79,96 50,75 21,96 32,62 2,40 39,40');
                        break;
                    case 'speech-bubble':
                        shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        shape.setAttribute('d', 'M10 10 H 90 V 70 H 60 L 50 90 L 40 70 H 10 Z');
                        break;
                }

                if (shape) {
                    if (shapeContent.shapeType !== 'line') {
                        shape.setAttribute('fill', style.fill || '#cccccc');
                        shape.setAttribute('stroke-width', style.strokeWidth || 0); // デフォルトの枠線を0に
                    }
                    // strokeはstyleに存在する場合のみ設定する
                    if (style.stroke && shapeContent.shapeType !== 'line') {
                        shape.setAttribute('stroke', style.stroke);
                    }
                    svg.appendChild(shape);
                }

                return svg;
            }

            // =================================================================
            // Private Helper Methods
            // =================================================================
            
            static _isEditableImage(src) {
                return src && (src.startsWith('data:') || src.startsWith('blob:'));
            }

            static _createImageEditButton() {
                const editButton = document.createElement('button');
                editButton.className = 'image-edit-overlay-btn';
                editButton.innerHTML = '<i class="fas fa-edit"></i> 編集';
                
                Object.assign(editButton.style, {
                    position: 'absolute',
                    bottom: '5px',
                    right: '5px',
                    zIndex: '10',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    opacity: '0',
                    transition: 'opacity 0.3s ease'
                });
                
                const icon = editButton.querySelector('i');
                if (icon) {
                    icon.style.pointerEvents = 'none';
                }
                
                return editButton;
            }

            static _createFontAwesomeIcon(elData) {
                const iTag = document.createElement('i');
                iTag.className = elData.content;
                
                Object.assign(iTag.style, {
                    color: elData.style?.color || 'inherit',
                    fontSize: elData.style?.fontSize ? `${elData.style.fontSize}px` : 'inherit',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)'
                });
                
                return iTag;
            }

            static _createMaterialIcon(elData) {
                const spanTag = document.createElement('span');
                spanTag.className = elData.content;
                spanTag.textContent = elData.miContent || '';
                
                Object.assign(spanTag.style, {
                    color: elData.style?.color || 'inherit',
                    fontSize: elData.style?.fontSize ? `${elData.style.fontSize}px` : 'inherit',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)'
                });
                
                return spanTag;
            }

            static _createIframeOverlay() {
                const overlay = document.createElement('div');
                overlay.className = 'iframe-overlay';
                
                Object.assign(overlay.style, {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 10000,
                    backgroundColor: 'transparent',
                    cursor: 'move'
                });
                
                // イベントハンドラーは後でAppクラスから設定
                return overlay;
            }

            static _initializeChart(canvas, config) {
                // Chart.jsの遅延初期化
                setTimeout(() => {
                    try {
                        if (canvas && window.Chart && config) {
                            new Chart(canvas.getContext('2d'), config);
                        }
                    } catch (error) {
                        ErrorHandler.handle(error, 'chart_initialization');
                    }
                }, 0);
            }

            static _createErrorPlaceholder(type) {
                const div = document.createElement('div');
                div.className = 'element-error-placeholder';
                div.textContent = `エラー: ${type}要素を作成できませんでした`;
                
                Object.assign(div.style, {
                    color: '#dc3545',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    padding: '8px',
                    fontSize: '12px',
                    textAlign: 'center'
                });
                
                return div;
            }
        }

        // =================================================================
        // スタイル適用ヘルパー
        // =================================================================
        const StyleManager = {
            applyStyles(element, styles) {
                const height = styles.height != null ? `${styles.height}%` : 'auto';
                const width = typeof styles.width === 'number' ? `${styles.width}%` : styles.width;
                
                Object.assign(element.style, {
                    top: `${styles.top}%`,
                    left: `${styles.left}%`,
                    width: width,
                    height: height,
                    zIndex: styles.zIndex,
                    transform: `rotate(${styles.rotation || 0}deg)`,
                    color: styles.color,
                    fontSize: styles.fontSize ? `${styles.fontSize}px` : null,
                    fontFamily: styles.fontFamily || '',
                    backgroundColor: styles.backgroundColor || 'transparent',
                    border: styles.border || 'none'
                });

                // 縦書き対応
                if (styles.vertical) {
                    element.style.writingMode = 'vertical-rl';
                    element.style.textOrientation = 'mixed';
                } else {
                    element.style.writingMode = '';
                    element.style.textOrientation = '';
                }
            },

            addResizeHandles(element) {
                ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].forEach(handleType => {
                    const handle = document.createElement('div');
                    handle.className = `resize-handle ${handleType}`;
                    handle.dataset.handle = handleType;
                    element.appendChild(handle);
                });
            }
        };

        // =================================================================
        // App: メインアプリケーション（リファクタリング版）
        // =================================================================
        const App = window.App = { // Appオブジェクトをグローバルに公開
            // 新しい状態管理システム
            stateManager: null,
            
            // 従来のstate参照（後方互換性のため）
            // 従来のstate参照（後方互換性のため）
            get state() {
                return this.stateManager ? this.stateManager.state : {};
            },
            
            // stateの直接更新のためのセッター
            set state(value) {
                if (this.stateManager) {
                    this.stateManager.state = value;
                }
            },
            
            elements: {},
            config: {},
            guideLineManager: null,
            domElementCache: new Map(),
            thumbnailCache: new Map(),

            init() {
                try {
                    // 状態管理システムの初期化
                    this.stateManager = new StateManager();
                    this._initializeStateListeners();
                    
                    this.cacheElements();
                    this.guideLineManager = new GuideLineManager(this.elements.slideCanvas);
                    this.presentationManager = new PresentationManager(this); // PresentationManagerの初期化

                    this.thumbnailObserver = new IntersectionObserver(
                        (entries, observer) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting) {
                                    const li = entry.target;
                                    this._renderSingleThumbnail(li);
                                    observer.unobserve(li);
                                }
                            });
                        },
                        { root: this.elements.slideList, rootMargin: '200px' }
                    );
                    
                    // bindEvents, loadState, render, initZoomControl は loadIconData() の後に実行
                    this.bindEvents();
                    this.loadState();
                    this.render();
                    this.initZoomControl();
                    
                    if (window.developmentMode) {
                        console.log('App initialized successfully');
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'app_initialization');
                }
            },
            _initializeStateListeners() {
                // 選択要素変更時の処理
                this.stateManager.subscribe('selectedElementIds', (newIds, oldIds) => {
                    if (JSON.stringify(newIds) !== JSON.stringify(oldIds)) {
                        this.render();
                    }
                });

                // アクティブスライド変更時の処理
                this.stateManager.subscribe('activeSlideId', (newId, oldId) => {
                    if (newId !== oldId) {
                        this.stateManager.set('selectedElementIds', [], { silent: true });
                        
                        const canvas = this.elements.slideCanvas;
                        if (canvas) {
                            canvas.classList.add('slide-canvas-transitioning');
                            setTimeout(() => {
                                this.render();
                                setTimeout(() => {
                                    canvas.classList.remove('slide-canvas-transitioning');
                                }, 50);
                            }, 300);
                        } else {
                            this.render();
                        }
                    }
                });

                // キャンバス拡大率変更時の処理
                this.stateManager.subscribe('canvas.scale', (newScale) => {
                    this.updateZoomDisplay();
                });

                // プレゼンテーション変更時の自動保存
                this.stateManager.subscribe('presentation', () => {
                    if (this._autoSaveEnabled()) {
                        this.saveState();
                    }
                });
            },

            _autoSaveEnabled() {
                return localStorage.getItem('webSlideMakerAutoSave') !== 'false';
            },

            // StateManagerを使った状態更新メソッド
            updateState(path, value, options = {}) {
                return this.stateManager.set(path, value, options);
            },

            getState(path) {
                return this.stateManager.get(path);
            },

            batchUpdateState(updates, options = {}) {
                return this.stateManager.batch(updates, options);
            },

           // アイコンデータを読み込むための新しいメソッド
           async loadIconData() {
               try {
                   const response = await fetch('icons.json');
                   if (!response.ok) {
                       throw new Error(`HTTP error! status: ${response.status}`);
                   }
                   const data = await response.json();
                   this.config.fontAwesomeIcons = data.fontAwesomeIcons;
                   this.config.materialIcons = data.materialIcons;

                   // アイコンに英語名(クラス名から)をaliasプロパティとして追加
                   this.config.fontAwesomeIcons.forEach(icon => {
                       const cls = icon.class.split(' ')[1] || '';
                       icon.alias = cls.replace('fa-', '');
                   });
                   this.config.materialIcons.forEach(icon => {
                       icon.alias = icon.name.toLowerCase().replace(/ /g, '_');
                   });
                   // Fuse.js を使ったアイコンのあいまい検索インスタンス
                   this.faIconFuse = new Fuse(this.config.fontAwesomeIcons, {
                       keys: ['name', 'category', 'class', 'alias'],
                       threshold: 0.4,
                       ignoreLocation: true
                   });
                   this.miIconFuse = new Fuse(this.config.materialIcons, {
                       keys: ['name', 'category', 'class', 'alias'],
                       threshold: 0.4,
                       ignoreLocation: true
                   });

               } catch (error) {
                   console.error("Failed to load icon data:", error);
                   // エラー発生時のフォールバックとして空の配列を設定
                   this.config.fontAwesomeIcons = [];
                   this.config.materialIcons = [];
               }
           },

            // DOM要素のキャッシュ - 整理版
            cacheElements() {
                this.elements = {
                    // メインコンテナ
                    appContainer: document.getElementById('app-container'),
                    toolbar: document.getElementById('toolbar'),
                    appBody: document.getElementById('app-body'),
                    leftSidebar: document.getElementById('left-sidebar'),
                    rightSidebar: document.getElementById('right-sidebar'),
                    mainCanvasArea: document.getElementById('main-canvas-area'),
                    
                    // サイドバー関連
                    sidebarTabs: document.getElementById('sidebar-tabs'),
                    sidebarContent: document.getElementById('sidebar-content'),
                    inspector: document.getElementById('inspector'),
                    noSelectionMessage: document.getElementById('no-selection-message'),
                    chatPanel: document.getElementById('chat-panel'),
                    // ツールバーボタン
                    addSlideBtn: document.getElementById('add-slide-btn'),
                    deleteSlideBtn: document.getElementById('delete-slide-btn'),
                    undoBtn: document.getElementById('undo-btn'),
                    redoBtn: document.getElementById('redo-btn'),
                    saveBtn: document.getElementById('save-btn'),
                    presentBtn: document.getElementById('present-btn'),
                    exportBtn: document.getElementById('export-btn'),
                    exportMenu: document.getElementById('export-menu'),
                    
                    // 要素追加ボタン
                    addTextBtn: document.getElementById('add-text-btn'),
                    addImageBtn: document.getElementById('add-image-btn'),
                    addImageEditBtn: document.getElementById('add-image-edit-btn'),
                    addChartBtn: document.getElementById('add-chart-btn'),
                    addIframeBtn: document.getElementById('add-iframe-btn'),
                    addShapeBtn: document.getElementById('add-shape-btn'),
                    imageUploadInput: document.getElementById('image-upload-input'),

                    // グループ化ボタン
                    groupBtn: document.getElementById('group-btn'),
                    ungroupBtn: document.getElementById('ungroup-btn'),

                    // モーダル
                    shapeModal: document.getElementById('shape-modal'),
                    
                    // 整列ボタン
                    alignLeftBtn: document.getElementById('align-left-btn'),
                    alignCenterHBtn: document.getElementById('align-center-h-btn'),
                    alignRightBtn: document.getElementById('align-right-btn'),
                    alignTopBtn: document.getElementById('align-top-btn'),
                    alignCenterVBtn: document.getElementById('align-center-v-btn'),
                    alignBottomBtn: document.getElementById('align-bottom-btn'),
                    distributeHBtn: document.getElementById('distribute-h-btn'),
                    distributeVBtn: document.getElementById('distribute-v-btn'),
                    
                    // スライド関連
                    slideList: document.getElementById('slide-list'),
                    slideCanvas: document.getElementById('slide-canvas'),
                    
                    // アイコン関連
                    faIconListContainer: document.getElementById('fa-icon-list-container'),
                    faIconSearchInput: document.getElementById('fa-icon-search-input'),
                    faIconCategoryFilter: document.getElementById('fa-icon-category-filter'),
                    miIconListContainer: document.getElementById('mi-icon-list-container'),
                    miIconSearchInput: document.getElementById('mi-icon-search-input'),
                    miIconCategoryFilter: document.getElementById('mi-icon-category-filter'),
                    
                    // プレゼンテーション関連
                    presentationView: document.getElementById('presentation-view'),
                    presentationSlideContainer: document.getElementById('presentation-slide-container'),
                    
                };
            },

            loadState() {
                try {
                    const savedData = localStorage.getItem('webSlideMakerData');
                    if (savedData) {
                        const presentation = JSON.parse(savedData);
                        // 既存のデータにscriptプロパティがない場合、空文字列で初期化
                        if (presentation.script === undefined) {
                            presentation.script = '';
                        }
                        // groupsプロパティがない場合、空のオブジェクトで初期化
                        if (presentation.groups === undefined) {
                            presentation.groups = {};
                        }
                        this.stateManager.batch({
                            'presentation': presentation,
                            'activeSlideId': presentation.slides[0]?.id || null,
                            'selectedElementIds': []
                        }, { silent: true });
                    } else {
                        this.createNewPresentation();
                    }
                    
                    // グローバルCSSをテキストエリアに反映
                    const globalCssInput = document.getElementById('global-css-input');
                    if (globalCssInput) {
                        globalCssInput.value = this.state.presentation?.settings?.globalCss || '';
                    }
                    this.applyCustomCss();
                } catch (error) {
                    ErrorHandler.handle(error, 'load_state');
                    this.createNewPresentation();
                }
            },

            saveState() {
                try {
                    const presentation = this.state.presentation;
                    if (!presentation) return;
                    
                    localStorage.setItem('webSlideMakerData', JSON.stringify(presentation));
                    
                    // UI更新
                    const saveButton = this.elements.saveBtn?.querySelector('span');
                    if (saveButton) {
                        const originalText = saveButton.textContent;
                        saveButton.textContent = '保存済み';
                        setTimeout(() => {
                            if (saveButton.textContent === '保存済み') {
                                saveButton.textContent = originalText;
                            }
                        }, 1500);
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'save_state');
                }
            },

            createNewPresentation() {
                try {
                    const firstSlideId = this.generateId('slide');
                    const newPresentation = {
                        settings: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, globalCss: '' },
                        slides: [{
                            id: firstSlideId,
                            elements: [{
                                id: this.generateId('el'),
                                type: 'text',
                                content: 'タイトル',
                                style: {
                                    top: 20, left: 10, width: 80, height: null,
                                    zIndex: 1, rotation: 0, color: '#212529',
                                    fontSize: 60, fontFamily: 'sans-serif', animation: ''
                                }
                            }, {
                                id: this.generateId('el'),
                                type: 'text',
                                content: 'サブタイトル',
                                style: {
                                    top: 40, left: 10, width: 80, height: null,
                                    zIndex: 2, rotation: 0, color: '#6c757d',
                                    fontSize: 32, fontFamily: 'sans-serif', animation: ''
                                }
                            }]
                        }]
                    };
                    
                    this.stateManager.batch({
                        'presentation': newPresentation,
                        'activeSlideId': firstSlideId,
                        'selectedElementIds': []
                    }, { silent: true });
                } catch (error) {
                    ErrorHandler.handle(error, 'create_new_presentation');
                }
            },

            render() {
                if (!this.state.presentation) return;
                
                requestAnimationFrame(() => {
                    try {
                        // キャンバスのBoundingRectを状態管理システムで管理
                        const canvasRect = this.elements.slideCanvas.getBoundingClientRect();
                        this.stateManager.set('canvas.rect', canvasRect, { silent: true });
                        
                        this.renderThumbnails();
                        this.renderSlideCanvas();

                        const inspectorHasFocus = document.activeElement && this.elements.inspector.contains(document.activeElement);

                        if (!inspectorHasFocus) {
                            // 要素が選択されていれば「設定」タブをアクティブにし、インスペクターを再描画
                            if (this.state.selectedElementIds.length > 0) {
                                this.switchToTab('inspector');
                                this.renderInspector();
                            } else {
                                // 要素が選択されていない場合、もし「設定」タブが開いていたらインスペクターをクリア表示
                                const inspectorTabButton = this.elements.sidebarTabs.querySelector('.sidebar-tab-button[data-tab="inspector"]');
                                if (inspectorTabButton && inspectorTabButton.classList.contains('active')) {
                                    this.renderInspector();
                                }
                            }
                        }
                        this.updateToolbarState();
                        this.applyCustomCss();
                    } catch (error) {
                        ErrorHandler.handle(error, 'render');
                    }
                });
            },

            // Helper function to switch sidebar tabs programmatically
            switchToTab(tabName) {
                if (!this.elements.sidebarTabs || !this.elements.sidebarContent) return;

                // Update tab buttons state
                this.elements.sidebarTabs.querySelectorAll('.sidebar-tab-button').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.tab === tabName);
                });

                // Update tab content visibility
                this.elements.sidebarContent.querySelectorAll('.sidebar-tab-content').forEach(content => {
                    content.classList.toggle('active', content.dataset.tabContent === tabName);
                });

                // Show/hide the entire content panel based on the tab
                const isInspectorTab = tabName === 'inspector';
                const hasSelection = this.state.selectedElementIds.length > 0;
                
                // Show content panel if it's not the inspector tab, or if it is and there's a selection
                const shouldShowContent = !isInspectorTab || (isInspectorTab && hasSelection);
                this.elements.sidebarContent.style.display = shouldShowContent ? 'block' : 'none';
                
                // Adjust sidebar width
                this.elements.leftSidebar.style.width = shouldShowContent ? '340px' : '60px';


                // Initialize editors or render specific content
                if (tabName === 'inspector') {
                    this.renderInspector();
                } else if (tabName === 'page-settings') {
                    this.initGlobalCssEditor();
                }
            },

            updateToolbarState() {
                const selectedElementCount = this.state.selectedElementIds.length;
                const selectedGroupCount = this.state.selectedGroupIds.length;

                const alignButtons = [this.elements.alignLeftBtn, this.elements.alignCenterHBtn, this.elements.alignRightBtn, this.elements.alignTopBtn, this.elements.alignCenterVBtn, this.elements.alignBottomBtn];
                alignButtons.forEach(btn => btn.disabled = selectedElementCount < 2);
                
                const distributeButtons = [this.elements.distributeHBtn, this.elements.distributeVBtn];
                distributeButtons.forEach(btn => btn.disabled = selectedElementCount < 3);

                // Group/Ungroup buttons
                this.elements.groupBtn.disabled = selectedElementCount < 2;
                this.elements.ungroupBtn.disabled = selectedGroupCount === 0;

                // Undo/Redoボタンの状態更新
                this.elements.undoBtn.disabled = this.stateManager._undoStack.length === 0;
                this.elements.redoBtn.disabled = this.stateManager._redoStack.length === 0;
            },

            renderThumbnails() {
                const { slides, settings } = this.state.presentation;
                const slideList = this.elements.slideList;
                const activeSlideId = this.state.activeSlideId;
                const currentSlideIds = new Set(slides.map(s => s.id));

                // 1. 不要になったサムネイルをDOMとキャッシュから削除
                for (const id of this.thumbnailCache.keys()) {
                    if (!currentSlideIds.has(id)) {
                        const li = this.thumbnailCache.get(id);
                        this.thumbnailObserver.unobserve(li); // 監視を解除
                        li.remove();
                        this.thumbnailCache.delete(id);
                    }
                }

                const fragment = document.createDocumentFragment();
                const slideIdOrder = [];

                // 2. サムネイルの更新と追加
                slides.forEach((slide, index) => {
                    slideIdOrder.push(slide.id);
                    let li = this.thumbnailCache.get(slide.id);

                    if (!li) {
                        // --- 新規作成 (プレースホルダー) ---
                        li = document.createElement('li');
                        li.dataset.slideId = slide.id; // IntersectionObserver用にIDを保持
                        li.draggable = true;
                        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', slide.id); li.classList.add('dragging'); });
                        li.addEventListener('dragend', () => li.classList.remove('dragging'));
                        li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
                        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
                        li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('drag-over'); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== slide.id) this.moveSlide(fromId, slide.id); });
                        li.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showSlideContextMenu(e, slide.id); });

                        const wrapper = document.createElement('div'); wrapper.className = 'slide-thumbnail-wrapper';
                        const content = document.createElement('div'); content.className = 'slide-thumbnail-content';
                        const indexSpan = document.createElement('span'); indexSpan.className = 'thumbnail-index';
                        
                        // プレースホルダーの高さを設定
                        const aspectRatio = settings.height / settings.width;
                        wrapper.style.paddingTop = `${aspectRatio * 100}%`;

                        wrapper.appendChild(content);
                        li.appendChild(indexSpan);
                        li.appendChild(wrapper);
                        this.thumbnailCache.set(slide.id, li);
                        this.thumbnailObserver.observe(li); // 監視を開始
                    }

                    // --- 更新 (アクティブ状態とインデックスのみ) ---
                    li.className = `slide-thumbnail ${slide.id === activeSlideId ? 'active' : ''}`;
                    li.querySelector('.thumbnail-index').textContent = index + 1;
                    li.dataset.id = slide.id; // dblclick用
                });

                // 3. DOMの順序を現在のスライド順に並べ替え
                slideIdOrder.forEach(id => {
                    fragment.appendChild(this.thumbnailCache.get(id));
                });

                // 4. 「追加」ボタンを生成
                const addLi = document.createElement('li');
                addLi.className = 'slide-thumbnail add-slide';
                addLi.title = 'スライドを追加';
                addLi.style.cursor = 'pointer';
                addLi.innerHTML = `<div class="slide-thumbnail-wrapper"><div class="slide-thumbnail-content add-slide-content" style="width: ${settings.width}px; height: ${settings.height}px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-plus" style="font-size:48px;color:#aaa;"></i></div></div>`;
                addLi.addEventListener('click', () => this.addSlide());
                fragment.appendChild(addLi);

                // 5. DOMを一括で反映
                slideList.textContent = '';
                slideList.appendChild(fragment);

                // 6. 「追加」ボタンのスケール調整
                requestAnimationFrame(() => {
                    const addWrapper = addLi.querySelector('.slide-thumbnail-wrapper');
                    const addContent = addLi.querySelector('.add-slide-content');
                    if (addWrapper && addWrapper.offsetWidth > 0) {
                        addContent.style.transform = `scale(${addWrapper.offsetWidth / settings.width})`;
                    }
                });
            },

            _renderSingleThumbnail(li) {
                const slideId = li.dataset.slideId;
                const slide = this.state.presentation.slides.find(s => s.id === slideId);
                const settings = this.state.presentation.settings;

                if (!slide) return;

                const content = li.querySelector('.slide-thumbnail-content');
                if (!content) return;
                
                // プレースホルダーのスタイルをリセット
                const wrapper = li.querySelector('.slide-thumbnail-wrapper');
                if (wrapper) {
                    wrapper.style.paddingTop = '';
                }

                content.textContent = ''; // 中身をクリア
                content.style.width = `${settings.width}px`;
                content.style.height = `${settings.height}px`;
                
                slide.elements.forEach(elData => {
                    const el = this.createElementDOM(elData);
                    content.appendChild(el);
                });

                requestAnimationFrame(() => {
                    if (wrapper && wrapper.offsetWidth > 0) {
                        content.style.transform = `scale(${wrapper.offsetWidth / settings.width})`;
                    }
                });
            },

            renderSlideCanvas() {
                const activeSlide = this.getActiveSlide();
                const canvas = this.elements.slideCanvas;
                canvas.querySelectorAll('.selection-bounding-box').forEach(el => el.remove());

                this.updateCanvasScale();

                if (!activeSlide) {
                    this.domElementCache.forEach(cacheEntry => cacheEntry.dom.remove());
                    this.domElementCache.clear();
                    return;
                }

                const currentElementIds = new Set(activeSlide.elements.map(el => el.id));
                const { selectedElementIds, isEditingText } = this.state;

                // 不要になった要素を先に削除
                for (const id of this.domElementCache.keys()) {
                    if (!currentElementIds.has(id)) {
                        const cacheEntry = this.domElementCache.get(id);
                        if (cacheEntry && cacheEntry.dom) {
                            cacheEntry.dom.remove();
                        }
                        this.domElementCache.delete(id);
                    }
                }

                // 要素の更新と追加
                activeSlide.elements.forEach((elData, index) => {
                    elData.style.zIndex = index + 1; // 配列の順序に基づいてzIndexを動的に設定
                    const cacheEntry = this.domElementCache.get(elData.id);
                    let el = cacheEntry ? cacheEntry.dom : null;
                    const previousContent = cacheEntry ? cacheEntry.content : null;
                    const currentContent = JSON.stringify(elData.content);

                    if (!el) {
                        // --- 新規作成 ---
                        el = this.createElementDOM(elData);
                        el.dataset.id = elData.id;
                        canvas.appendChild(el);
                        this.domElementCache.set(elData.id, { dom: el, content: currentContent });
                    } else {
                        // --- 更新 ---
                        StyleManager.applyStyles(el, elData.style);
                        
                        // contentが変更された場合のみ中身を再生成
                        if (previousContent !== currentContent) {
                            const content = ElementFactory.createElement(elData);
                            el.textContent = ''; // 中身をクリア
                            if (content) {
                                if (content instanceof Node) {
                                    el.appendChild(content);
                                } else if (typeof content === 'string') {
                                    el.innerText = content;
                                }
                            }
                            this.domElementCache.set(elData.id, { dom: el, content: currentContent });
                        }
                    }

                    // --- 状態に基づくクラスや属性の更新 ---
                    const isSelected = selectedElementIds.includes(elData.id);
                    const group = this._findGroupForElement(elData.id);
                    const isGroupSelected = group && this.state.selectedGroupIds.includes(group.id);

                    el.classList.toggle('selected', isSelected);
                    el.classList.toggle('grouped', !!group);
                    el.classList.toggle('group-selected', isGroupSelected);

                    // リサイズハンドル
                    const hasHandles = el.querySelector('.resize-handle');
                    if (isSelected && selectedElementIds.length === 1) {
                        if (!hasHandles) {
                            StyleManager.addResizeHandles(el);
                        }
                    } else if (hasHandles) {
                        el.querySelectorAll('.resize-handle').forEach(h => h.remove());
                    }

                    // テキスト編集
                    el.setAttribute('contenteditable', isEditingText && isSelected);
                });

                this.renderSelectionBoundingBox();
                this.renderGroupSelectionBoundingBoxes();
            },

            updateCanvasScale() {
                const canvas = this.elements.slideCanvas;
                const container = this.elements.mainCanvasArea;
                
                if (!canvas || !container) return;
                
                // キャンバスの実際のサイズ（1280x720）
                const canvasWidth = CANVAS_WIDTH;
                const canvasHeight = CANVAS_HEIGHT;
                
                // コンテナのサイズを取得
                const containerRect = container.getBoundingClientRect();
                const availableWidth = containerRect.width - 48; // パディング分を除く
                const availableHeight = containerRect.height - 48;
                
                // アスペクト比を維持しながらフィットするスケールを計算
                const scaleX = availableWidth / canvasWidth;
                const scaleY = availableHeight / canvasHeight;
                const baseScale = Math.min(scaleX, scaleY, 1); // 1を超えないようにする
                
                // ユーザー設定のズーム倍率を適用
                const userScale = this.getState('canvas.scale') || CONFIG.CANVAS_SCALE.default;
                const finalScale = baseScale * userScale;
                
                // パン（移動）を反映
                const pan = this.getState('canvas.pan') || { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
                
                // CSS変換を適用
                canvas.style.transformOrigin = "center center";
                canvas.style.transform = `scale(${finalScale}) translate(${pan.x / finalScale}px, ${pan.y / finalScale}px)`;
                
                // 状態管理システムに実際のスケールを保存
                this.stateManager.set('canvas.actualScale', finalScale, { silent: true });
            },

            renderSelectionBoundingBox() {
                // 既存の選択枠を全て削除
                this.elements.slideCanvas.querySelectorAll('.selection-bounding-box').forEach(el => el.remove());
                if (this.state.selectedElementIds.length <= 1) return;
                const bounds = this.getSelectedElementsBoundingBox(true);
                if (!bounds) return;
                const box = document.createElement('div');
                box.className = 'selection-bounding-box';
                Object.assign(box.style, { left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, height: `${bounds.height}%` });
                this.elements.slideCanvas.appendChild(box);
            },

            renderGroupSelectionBoundingBoxes() {
                this.elements.slideCanvas.querySelectorAll('.group-selection-bounding-box').forEach(el => el.remove());
                const { selectedGroupIds, activeSlideId } = this.state;
                const slideGroups = this.state.presentation.groups?.[activeSlideId] || [];

                selectedGroupIds.forEach(groupId => {
                    const group = slideGroups.find(g => g.id === groupId);
                    if (!group) return;

                    const bounds = this.getGroupBoundingBox(group.elementIds, true);
                    if (!bounds) return;

                    const box = document.createElement('div');
                    box.className = 'group-selection-bounding-box';
                    Object.assign(box.style, {
                        left: `${bounds.left}%`,
                        top: `${bounds.top}%`,
                        width: `${bounds.width}%`,
                        height: `${bounds.height}%`
                    });
                    this.elements.slideCanvas.appendChild(box);
                });
            },

            createElementDOM(elData) {
                const el = document.createElement('div');
                el.className = `slide-element ${elData.type}`;
                StyleManager.applyStyles(el, elData.style);

                // ElementFactoryに完全委譲
                const content = ElementFactory.createElement(elData);
                if (content) {
                    if (content instanceof Node) {
                        el.appendChild(content);
                    } else if (typeof content === 'string') {
                        el.innerText = content;
                    }
                }
                return el;
            },

            // フォールバック用の統合メソッド
            // （不要になったため削除）

            applyStyles(element, styles) {
                // StyleManagerに委譲
                StyleManager.applyStyles(element, styles);
            },

            addResizeHandles(element) {
                // StyleManagerに委譲
                StyleManager.addResizeHandles(element);
            },

            renderInspector() {
                try {
                    const selectedElement = this.state.selectedElementIds.length === 1 ? this.getSelectedElement() : null;
                    const inspectorTabActive = this.elements.sidebarTabs.querySelector('[data-tab="inspector"]')?.classList.contains('active');
                    
                    this._updateInspectorTabVisibility(selectedElement);
                    
                    if (selectedElement && inspectorTabActive) {
                        this._showInspectorContent(selectedElement);
                    } else {
                        this._hideInspectorContent(inspectorTabActive);
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'render_inspector');
                }
            },

            _updateInspectorTabVisibility(selectedElement) {
                const inspectorTabButton = this.elements.sidebarTabs.querySelector('[data-tab="inspector"]');
                const inspectorTabActive = this.elements.sidebarTabs.querySelector('[data-tab="inspector"]')?.classList.contains('active');
                
                if (!inspectorTabButton) return;
                
                if (this.state.selectedElementIds.length > 0) {
                    inspectorTabButton.style.display = 'flex';
                } else {
                    inspectorTabButton.style.display = 'none';
                    if (inspectorTabActive) {
                        const otherTabs = this.elements.sidebarTabs.querySelectorAll('[data-tab]:not([data-tab="inspector"])');
                        if (otherTabs.length > 0) {
                            this.switchToTab(otherTabs[0].dataset.tab);
                        }
                    }
                }
            },

            _showInspectorContent(selectedElement) {
                this.elements.inspector.style.display = 'block';
                this.elements.noSelectionMessage.style.display = 'none';
                this.elements.sidebarContent.style.display = 'block';
                this.elements.leftSidebar.style.width = '340px';

                const inspectorHTML = this._buildInspectorHTML(selectedElement);
                if (window.DOMPurify) {
                    this.elements.inspector.innerHTML = DOMPurify.sanitize(inspectorHTML, { ADD_ATTR: ['data-prop', 'data-type', 'data-table-row', 'data-table-col'] });
                } else {
                    this.elements.inspector.innerHTML = inspectorHTML;
                }
                
                this._initializeInspectorComponents(selectedElement);
            },

            _hideInspectorContent(inspectorTabActive) {
                this.elements.inspector.style.display = 'none';
                this.elements.noSelectionMessage.style.display = 'block';
                
                if (inspectorTabActive) {
                    this.elements.sidebarContent.style.display = 'none';
                    this.elements.leftSidebar.style.width = '60px';
                }
            },

            _buildInspectorHTML(selectedElement) {
                const s = selectedElement.style;

                const accordionItem = (title, content, isOpen = true) => `
                    <div class="accordion-item">
                        <button class="accordion-header" aria-expanded="${isOpen}">
                            ${title}
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                            ${content}
                        </div>
                    </div>
                `;

                const widthInPx = Utils.percentToPixels(parseFloat(s.width) || 0, CANVAS_WIDTH);
                const heightInPx = Utils.percentToPixels(parseFloat(s.height) || 0, CANVAS_HEIGHT);

                const transformContent = `
                    <div class="inspector-group">
                        <div class="pos-size-grid">
                            <div><label for="inspector-left">X (%)</label><input id="inspector-left" type="number" data-prop="left" value="${(s.left || 0).toFixed(2)}" step="0.1"></div>
                            <div><label for="inspector-top">Y (%)</label><input id="inspector-top" type="number" data-prop="top" value="${(s.top || 0).toFixed(2)}" step="0.1"></div>
                            <div><label for="inspector-width">幅 (px)</label><input id="inspector-width" type="number" data-prop="width" data-unit="px" value="${widthInPx.toFixed(0)}" min="10" max="500"></div>
                            <div><label for="inspector-height">高さ (px)</label><input id="inspector-height" type="number" data-prop="height" data-unit="px" value="${heightInPx.toFixed(0)}" min="10" max="500" ${!['image', 'video', 'shape'].includes(selectedElement.type) ? 'disabled' : ''}></div>
                        </div>
                    </div>
                    <div class="inspector-group"><label>回転 (deg)</label><input type="number" data-prop="rotation" value="${s.rotation || 0}" step="1"></div>
                    <div class="inspector-group"><label>重ね順</label><input type="number" data-prop="zIndex" value="${s.zIndex}"></div>
                `;

                const animationContent = `
                    <div class="inspector-group">
                        <label>アニメーション</label>
                        <select data-prop="animation">
                            <option value="">なし</option>
                            <option value="animate__bounce" ${s.animation === 'animate__bounce' ? 'selected' : ''}>バウンス</option>
                            <option value="animate__fadeIn" ${s.animation === 'animate__fadeIn' ? 'selected' : ''}>フェードイン</option>
                            <option value="animate__fadeOut" ${s.animation === 'animate__fadeOut' ? 'selected' : ''}>フェードアウト</option>
                            <option value="animate__zoomIn" ${s.animation === 'animate__zoomIn' ? 'selected' : ''}>ズームイン</option>
                            <option value="animate__zoomOut" ${s.animation === 'animate__zoomOut' ? 'selected' : ''}>ズームアウト</option>
                            <option value="animate__flipInX" ${s.animation === 'animate__flipInX' ? 'selected' : ''}>フリップインX</option>
                            <option value="animate__flipInY" ${s.animation === 'animate__flipInY' ? 'selected' : ''}>フリップインY</option>
                            <option value="animate__rotateIn" ${s.animation === 'animate__rotateIn' ? 'selected' : ''}>回転イン</option>
                            <option value="animate__slideInLeft" ${s.animation === 'animate__slideInLeft' ? 'selected' : ''}>左からスライド</option>
                            <option value="animate__slideInRight" ${s.animation === 'animate__slideInRight' ? 'selected' : ''}>右からスライド</option>
                            <option value="animate__slideInUp" ${s.animation === 'animate__slideInUp' ? 'selected' : ''}>下からスライド</option>
                            <option value="animate__slideInDown" ${s.animation === 'animate__slideInDown' ? 'selected' : ''}>上からスライド</option>
                        </select>
                    </div>
                `;

                const typeSpecificHTML = this._getTypeSpecificHTML(selectedElement);
                const customCssHTML = this._getCustomCssHTML();

                return `
                    <div class="accordion">
                        ${accordionItem('配置とサイズ', transformContent)}
                        ${typeSpecificHTML}
                        ${accordionItem('アニメーション', animationContent)}
                        ${accordionItem('詳細設定', customCssHTML, false)}
                    </div>
                `;
            },

            _getTypeSpecificHTML(selectedElement) {
                const accordionItem = (title, content, isOpen = true) => `
                    <div class="accordion-item">
                        <button class="accordion-header" aria-expanded="${isOpen}">
                            ${title}
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="accordion-content" ${isOpen ? '' : 'style="display: none;"'}>
                            ${content}
                        </div>
                    </div>
                `;

                const typeHandlers = {
                    'text': () => accordionItem('テキストスタイル', this._getTextPropertiesHTML(selectedElement)),
                    'icon': () => accordionItem('アイコンスタイル', this._getIconPropertiesHTML(selectedElement)),
                    'video': () => accordionItem('動画設定', this._getVideoPropertiesHTML(selectedElement)),
                    'chart': () => accordionItem('グラフデータ', this._getChartPropertiesHTML(selectedElement)),
                    'table': () => accordionItem('テーブルデータ', this._getTablePropertiesHTML(selectedElement)),
                    'iframe': () => accordionItem('埋め込み設定', this._getIframePropertiesHTML(selectedElement)),
                    'shape': () => accordionItem('塗りつぶしと枠線', this._getShapePropertiesHTML(selectedElement))
                };

                const handler = typeHandlers[selectedElement.type];
                return handler ? handler() : '';
            },

            _getTextPropertiesHTML(selectedElement) {
                const s = selectedElement.style;
                
                return `
                    <div class="inspector-group">
                        <label><input type="checkbox" data-prop="vertical" id="vertical-writing-checkbox" ${s.vertical ? 'checked' : ''}> 縦書き</label>
                    </div>
                    <div class="inspector-group">
                        <label>フォントサイズ (px)</label>
                        <input type="number" data-prop="fontSize" value="${s.fontSize || 24}">
                    </div>
                    <div class="inspector-group">
                        <label>フォント</label>
                        <select data-prop="fontFamily" id="font-family-select">
                            ${this._getFontOptions(s.fontFamily)}
                        </select>
                        <input type="file" id="font-upload" accept=".ttf,.otf,.woff,.woff2" style="margin-top:8px;">
                        <div id="uploaded-fonts-list" style="margin-top:4px;"></div>
                    </div>
                    <div class="inspector-group">
                        <label>文字色</label>
                        <input type="color" data-prop="color" value="${s.color || '#212529'}">
                    </div>
                    <div class="inspector-group">
                        <label>背景の塗りつぶし</label>
                        <input type="color" data-prop="backgroundColor" value="${s.backgroundColor || '#ffffff'}">
                    </div>
                    <div class="inspector-group">
                        <label>枠線</label>
                        <input type="text" data-prop="border" value="${s.border || '1px solid #000000'}" placeholder="例: 1px solid #000000">
                    </div>
                `;
            },

            _getFontOptions(currentFont) {
                const fonts = [
                    { value: 'sans-serif', name: 'モダン (Sans-serif)', style: 'sans-serif' },
                    { value: 'serif', name: 'クラシック (Serif)', style: 'serif' },
                    { value: '游ゴシック体,YuGothic,\'Yu Gothic\',sans-serif', name: '游ゴシック' },
                    { value: 'メイリオ,Meiryo,sans-serif', name: 'メイリオ' },
                    { value: 'Roboto, sans-serif', name: 'Roboto' },
                    { value: 'Montserrat, sans-serif', name: 'Montserrat' },
                    { value: '\'M PLUS Rounded 1c\', sans-serif', name: 'M PLUS Rounded 1c' }
                ];

                return fonts.map(font =>
                    `<option style="font-family: ${font.style || font.value}" value="${font.value}" ${currentFont === font.value ? 'selected' : ''}>${font.name}</option>`
                ).join('');
            },

            _getIconPropertiesHTML(selectedElement) {
                const s = selectedElement.style;
                const iconStyleOptions = selectedElement.iconType === 'fa'
                    ? this._getFontAwesomeStyleOptions(selectedElement.content)
                    : this._getMaterialIconStyleOptions(selectedElement.content);

                return `
                    <div class="inspector-group">
                        <label>アイコンスタイル</label>
                        <select id="icon-style-select" style="width:100%;padding:6px;border-radius:6px;">
                            ${iconStyleOptions}
                        </select>
                    </div>
                    <div class="inspector-group">
                        <label>アイコンサイズ (px)</label>
                        <input type="number" data-prop="fontSize" value="${s.fontSize || 48}">
                    </div>
                    <div class="inspector-group">
                        <label>アイコン色</label>
                        <input type="color" data-prop="color" value="${s.color || '#212529'}">
                    </div>
                `;
            },

            _getFontAwesomeStyleOptions(content) {
                const styles = [
                    { value: 'fas', name: 'Solid' },
                    { value: 'far', name: 'Regular' },
                    { value: 'fal', name: 'Light' },
                    { value: 'fat', name: 'Thin' }
                ];

                return styles.map(style =>
                    `<option value="${style.value}" ${content.startsWith(style.value + ' ') ? 'selected' : ''}>${style.name}</option>`
                ).join('');
            },

            _getMaterialIconStyleOptions(content) {
                const styles = [
                    { value: 'material-icons', name: 'Filled' },
                    { value: 'material-icons-outlined', name: 'Outlined' },
                    { value: 'material-icons-round', name: 'Round' },
                    { value: 'material-icons-sharp', name: 'Sharp' },
                    { value: 'material-icons-two-tone', name: 'Two Tone' }
                ];

                return styles.map(style =>
                    `<option value="${style.value}" ${content === style.value ? 'selected' : ''}>${style.name}</option>`
                ).join('');
            },

            _getVideoPropertiesHTML(selectedElement) {
                const v = selectedElement.content;
                
                return `
                    <div class="inspector-group">
                        <label>動画URL</label>
                        <input type="text" id="video-url" value="${v.url || ''}" style="width:100%;">
                    </div>
                    <div class="inspector-group">
                        <label><input type="checkbox" id="video-autoplay" ${v.autoplay ? 'checked' : ''}> 自動再生</label>
                    </div>
                    <div class="inspector-group">
                        <label><input type="checkbox" id="video-loop" ${v.loop ? 'checked' : ''}> ループ再生</label>
                    </div>
                    <div class="inspector-group">
                        <label><input type="checkbox" id="video-controls" ${v.controls !== false ? 'checked' : ''}> コントロール表示</label>
                    </div>
                    <button id="update-video-btn" style="margin-top:10px;width:100%;padding:8px;">動画設定を反映</button>
                `;
            },

            _getChartPropertiesHTML(selectedElement) {
                const chartData = selectedElement.content.data;
                let tableRows = '';
                if (chartData && chartData.labels && chartData.datasets?.[0]?.data) {
                    for (let i = 0; i < chartData.labels.length; i++) {
                        const label = chartData.labels[i];
                        const value = chartData.datasets[0].data[i];
                        tableRows += `
                            <tr>
                                <td style="padding: 4px;"><input type="text" data-type="label" value="${label}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                                <td style="padding: 4px;"><input type="number" data-type="value" value="${value}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                                <td style="text-align: center;"><button type="button" class="delete-chart-row-btn" style="background:none; border:none; color: #dc3545; cursor:pointer; font-size: 16px;">&times;</button></td>
                            </tr>
                        `;
                    }
                }

                return `
                    <div class="inspector-group">
                        <label>グラフデータ編集</label>
                        <div style="margin-top: 10px;">
                            <label>データセット名</label>
                            <input type="text" id="chart-dataset-label-inspector" value="${chartData.datasets[0].label}" style="width: 100%;">
                        </div>
                        <div id="chart-data-spreadsheet-inspector" style="margin-top: 10px; max-height: 200px; overflow-y: auto; border: 1px solid #ced4da; border-radius: 6px;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead style="position: sticky; top: 0; background: #f8f9fa;">
                                    <tr>
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ced4da;">ラベル</th>
                                        <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ced4da;">値</th>
                                        <th style="width: 40px; border-bottom: 1px solid #ced4da;"></th>
                                    </tr>
                                </thead>
                                <tbody id="chart-data-tbody-inspector">
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button type="button" id="add-chart-row-btn-inspector" class="sidebar-add-btn" style="flex-grow: 1;">行を追加</button>
                        </div>
                    </div>
                `;
            },

            _getTablePropertiesHTML(selectedElement) {
                const t = selectedElement.content;
                let rowsInputs = '';
                
                for (let r = 0; r < t.rows; r++) {
                    let row = '<tr>';
                    for (let c = 0; c < t.cols; c++) {
                        const val = Utils.sanitizeHtml(t.data?.[r]?.[c] ?? '');
                        row += `<td><input type="text" data-table-row="${r}" data-table-col="${c}" value="${val}" style="width:60px;"></td>`;
                    }
                    row += '</tr>';
                    rowsInputs += row;
                }
                
                return `
                    <div class="inspector-group">
                        <label>行数 <input type="number" id="table-rows" value="${t.rows}" min="1" max="20" style="width:50px;"></label>
                        <label>列数 <input type="number" id="table-cols" value="${t.cols}" min="1" max="20" style="width:50px;"></label>
                    </div>
                    <div class="inspector-group">
                        <label>セル内容</label>
                        <table style="border-collapse:collapse;">${rowsInputs}</table>
                    </div>
                `;
            },

            _getIframePropertiesHTML(selectedElement) {
                return `
                    <div class="inspector-group">
                        <label>iframe URL</label>
                        <input type="text" data-prop="url" value="${selectedElement.content.url || ''}" id="iframe-url-input" style="width:100%;">
                    </div>
                    <div class="inspector-group">
                        <label>Sandbox属性 (スペース区切り)</label>
                        <input type="text" data-prop="sandbox" value="${selectedElement.content.sandbox || ''}" id="iframe-sandbox-input" style="width:100%;">
                        <small style="font-size:10px;color:#666;">例: allow-scripts allow-same-origin allow-popups</small>
                    </div>
                    <button id="update-iframe-btn" style="margin-top:10px;width:100%;padding:8px;">埋め込み設定を反映</button>
                `;
            },

            _getShapePropertiesHTML(selectedElement) {
                const s = selectedElement.style;
                const isLine = selectedElement.content.shapeType === 'line';
                return `
                    <div class="inspector-group">
                        <label>塗りつぶし色</label>
                        <input type="color" data-prop="fill" value="${s.fill || '#cccccc'}" ${isLine ? 'disabled' : ''}>
                    </div>
                    <div class="inspector-group">
                        <label>線の色</label>
                        <input type="color" data-prop="stroke" value="${s.stroke || '#000000'}">
                    </div>
                    <div class="inspector-group">
                        <label>線の太さ (px)</label>
                        <input type="number" data-prop="strokeWidth" value="${s.strokeWidth != null ? s.strokeWidth : 2}" min="0">
                    </div>
                `;
            },

            _getCustomCssHTML() {
                return `
                    <div class="inspector-group">
                        <label>カスタムCSS</label>
                        <div id="element-css-editor-container" style="border: 1px solid var(--border-color); border-radius: var(--border-radius);"></div>
                    </div>
                    <div class="inspector-group" style="margin-top: 20px;">
                        <button id="delete-element-btn">要素を削除</button>
                    </div>
                `;
            },

            _initializeInspectorComponents(selectedElement) {
                const customCss = selectedElement.style.customCss || '';
                this.initElementCssEditor(customCss);
                
                // 基本イベントハンドラーの設定
                this._bindBasicInspectorEvents(selectedElement);

                // アコーディオンのイベントリスナーを設定
                this._bindAccordionEvents();
                
                // タイプ別イベントハンドラーの設定
                this._bindTypeSpecificEvents(selectedElement);
            },

            _bindBasicInspectorEvents(selectedElement) {
                const deleteBtn = document.getElementById('delete-element-btn');
                if (deleteBtn) {
                    deleteBtn.onclick = () => this.deleteSelectedElements();
                }
            },

            _bindAccordionEvents() {
                const inspector = document.getElementById('inspector');
                if (!inspector) return;

                inspector.querySelectorAll('.accordion-header').forEach(button => {
                    button.onclick = () => {
                        const content = button.nextElementSibling;
                        const isExpanded = button.getAttribute('aria-expanded') === 'true';
                        
                        button.setAttribute('aria-expanded', !isExpanded);
                        content.style.display = isExpanded ? 'none' : 'block';
                        
                        const icon = button.querySelector('i');
                        if (icon) {
                            icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
                        }
                    };
                });
            },

            _bindTypeSpecificEvents(selectedElement) {
                const eventHandlers = {
                    'chart': () => this._bindChartEvents(selectedElement),
                    'video': () => this._bindVideoEvents(selectedElement),
                    'table': () => this._bindTableEvents(selectedElement),
                    'iframe': () => this._bindIframeEvents(selectedElement),
                    'text': () => this._bindTextEvents(selectedElement),
                    'icon': () => this._bindIconEvents(selectedElement),
                    'shape': () => this._bindShapeEvents(selectedElement)
                };

                const handler = eventHandlers[selectedElement.type];
                if (handler) {
                    handler();
                }
            },

            _bindChartEvents(selectedElement) {
                const inspector = document.getElementById('inspector');

                const updateChartData = () => {
                    const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
                    if (!tableBody) return;
                    
                    const rows = tableBody.querySelectorAll('tr');
                    const labels = Array.from(rows).map(row => row.querySelector('input[data-type="label"]').value);
                    const dataValues = Array.from(rows).map(row => parseFloat(row.querySelector('input[data-type="value"]').value) || 0);
                    const datasetLabel = inspector.querySelector('#chart-dataset-label-inspector').value;

                    selectedElement.content.data.labels = labels;
                    selectedElement.content.data.datasets[0].label = datasetLabel;
                    selectedElement.content.data.datasets[0].data = dataValues;
                    
                    this.stateManager._saveToHistory();
                    this.saveState();
                    this.render();
                };

                const addRowBtn = inspector.querySelector('#add-chart-row-btn-inspector');
                if (addRowBtn) {
                    addRowBtn.onclick = () => {
                        const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
                        const newRow = this._createInspectorChartRow();
                        tableBody.appendChild(newRow);
                        this._bindInspectorChartRowEvents(newRow, updateChartData);
                        updateChartData();
                    };
                }
                
                const tableBody = inspector.querySelector('#chart-data-tbody-inspector');
                if(tableBody) {
                    tableBody.querySelectorAll('tr').forEach(row => {
                         this._bindInspectorChartRowEvents(row, updateChartData);
                    });
                }
                
                const datasetLabelInput = inspector.querySelector('#chart-dataset-label-inspector');
                if(datasetLabelInput) {
                    datasetLabelInput.addEventListener('input', updateChartData);
                }
            },

            _createInspectorChartRow(label = '', value = '') {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 4px;"><input type="text" data-type="label" value="${label}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                    <td style="padding: 4px;"><input type="number" data-type="value" value="${value}" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;"></td>
                    <td style="text-align: center;"><button type="button" class="delete-chart-row-btn" style="background:none; border:none; color: #dc3545; cursor:pointer; font-size: 16px;">&times;</button></td>
                `;
                return tr;
            },

            _bindInspectorChartRowEvents(row, updateCallback) {
                row.querySelectorAll('input').forEach(input => {
                    input.addEventListener('input', updateCallback);
                });
                const deleteBtn = row.querySelector('.delete-chart-row-btn');
                if(deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        row.remove();
                        updateCallback();
                    });
                }
            },

            _bindVideoEvents(selectedElement) {
                const updateBtn = document.getElementById('update-video-btn');
                if (updateBtn) {
                    updateBtn.onclick = () => {
                        selectedElement.content.url = document.getElementById('video-url').value;
                        selectedElement.content.autoplay = document.getElementById('video-autoplay').checked;
                        selectedElement.content.loop = document.getElementById('video-loop').checked;
                        selectedElement.content.controls = document.getElementById('video-controls').checked;
                        this.saveState();
                        this.render();
                    };
                }
            },

            _bindTableEvents(selectedElement) {
                const updateBtn = document.getElementById('update-table-btn');
                if (updateBtn) {
                    updateBtn.onclick = () => {
                        const newRows = parseInt(document.getElementById('table-rows').value);
                        const newCols = parseInt(document.getElementById('table-cols').value);

                        const currentData = selectedElement.content.data || [];
                        const newData = [];

                        for (let r = 0; r < newRows; r++) {
                            const row = [];
                            for (let c = 0; c < newCols; c++) {
                                const input = document.querySelector(`input[data-table-row="${r}"][data-table-col="${c}"]`);
                                row.push(input ? input.value : (currentData[r]?.[c] || ''));
                            }
                            newData.push(row);
                        }

                        selectedElement.content.rows = newRows;
                        selectedElement.content.cols = newCols;
                        selectedElement.content.data = newData;

                        this.saveState();
                        this.render();
                    };
                }

                // --- セル編集の即時反映 ---
                const cellInputs = document.querySelectorAll('input[data-table-row][data-table-col]');
                cellInputs.forEach(input => {
                    input.addEventListener('input', (e) => {
                        const r = parseInt(input.dataset.tableRow);
                        const c = parseInt(input.dataset.tableCol);
                        if (!selectedElement.content.data) selectedElement.content.data = [];
                        if (!selectedElement.content.data[r]) selectedElement.content.data[r] = [];
                        selectedElement.content.data[r][c] = input.value;

                        // debounceでsaveState/render
                        if (this._saveTableTimeout) clearTimeout(this._saveTableTimeout);
                        this._saveTableTimeout = setTimeout(() => {
                            this.saveState();
                            this.render();
                            this._saveTableTimeout = null;
                        }, 300);
                    });
                });

                // --- 行数・列数の即時反映 ---
                const rowInput = document.getElementById('table-rows');
                const colInput = document.getElementById('table-cols');
                const updateRowsCols = () => {
                    const newRows = parseInt(rowInput.value);
                    const newCols = parseInt(colInput.value);
                    selectedElement.content.rows = newRows;
                    selectedElement.content.cols = newCols;
                    if (this._saveTableTimeout) clearTimeout(this._saveTableTimeout);
                    this._saveTableTimeout = setTimeout(() => {
                        this.saveState();
                        this.render();
                        this._saveTableTimeout = null;
                    }, 300);
                };
                if (rowInput) rowInput.addEventListener('input', updateRowsCols);
                if (colInput) colInput.addEventListener('input', updateRowsCols);
            },

            _bindIframeEvents(selectedElement) {
                const updateBtn = document.getElementById('update-iframe-btn');
                if (updateBtn) {
                    updateBtn.onclick = () => {
                        selectedElement.content.url = document.getElementById('iframe-url-input').value;
                        selectedElement.content.sandbox = document.getElementById('iframe-sandbox-input').value;
                        this.saveState();
                        this.render();
                    };
                }
            },

            _bindTextEvents(selectedElement) {
                this._setupCustomFontUpload(selectedElement);
            },

            _bindIconEvents(selectedElement) {
                const styleSelect = document.getElementById('icon-style-select');
                if (styleSelect) {
                    styleSelect.addEventListener('change', function () {
                        App.updateIconStyle(selectedElement, this.value);
                    });
                }
            },

            _bindShapeEvents(selectedElement) {
                // This is a placeholder. Actual logic is handled by the generic 'input' event
                // listener on the inspector, which calls handleInspectorInput.
            },

            _setupCustomFontUpload(selectedElement) {
                const s = selectedElement.style;
                window._customFonts = window._customFonts || [];
                const fontSelect = document.getElementById('font-family-select');
                const fontsListDiv = document.getElementById('uploaded-fonts-list');
                
                if (!fontSelect || !fontsListDiv) return;
                
                // カスタムフォントのオプションを追加
                window._customFonts.forEach(f => {
                    if (!fontSelect.querySelector(`option[value="${f.family}"]`)) {
                        const opt = document.createElement('option');
                        opt.value = f.family;
                        opt.textContent = f.family + ' (アップロード)';
                        if (s.fontFamily === f.family) opt.selected = true;
                        fontSelect.appendChild(opt);
                    }
                });
                
                fontsListDiv.innerHTML = window._customFonts.map(f =>
                    `<span style="font-family:'${f.family}';font-size:14px;">${f.family}</span>`
                ).join('<br>');
                
                // フォントアップロードのイベントリスナー
                const fontUpload = document.getElementById('font-upload');
                if (fontUpload) {
                    fontUpload.addEventListener('change', function(e) {
                        const file = e.target.files[0];
                        if (!file) return;
                        
                        const reader = new FileReader();
                        reader.onload = function(ev) {
                            const fontFamily = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
                            const style = document.createElement('style');
                            style.innerHTML = `
                                @font-face {
                                    font-family: '${fontFamily}';
                                    src: url('${ev.target.result}');
                                }
                            `;
                            document.head.appendChild(style);
                            window._customFonts.push({ family: fontFamily, data: ev.target.result });
                            
                            const opt = document.createElement('option');
                            opt.value = fontFamily;
                            opt.textContent = fontFamily + ' (アップロード)';
                            fontSelect.appendChild(opt);
                            fontSelect.value = fontFamily;
                            s.fontFamily = fontFamily;
                            
                            App.saveState();
                            App.render();
                        };
                        reader.readAsDataURL(file);
                    });
                }
                
                if (window._customFonts.length > 0) {
                    fontsListDiv.innerHTML += '<div style="color:#dc3545;font-size:12px;">ページ再読込後は再アップロードが必要です</div>';
                }
            },

            bindEvents() {
                try {
                    this.initializeSettings();
                    
                    // 各カテゴリーのイベントを順番にバインド
                    this._bindToolbarEvents();
                    this._bindSidebarEvents();
                    this._bindIconEvents();
                    this._bindCanvasEvents();
                    this._bindAlignmentEvents();
                    this._bindGroupEvents();
                    this._bindInspectorEvents();
                    this._bindGlobalEvents();
                } catch (error) {
                    ErrorHandler.handle(error, 'bind_events');
                }
            },

            _bindToolbarEvents() {
                // スライド操作ボタン
                this.elements.addSlideBtn.addEventListener('click', () => this.addSlide());
                this.elements.deleteSlideBtn.addEventListener('click', () => this.deleteSlide());
                this.elements.undoBtn.addEventListener('click', () => {
                    if (this.stateManager.undo()) {
                        this.render();
                    }
                });
                this.elements.redoBtn.addEventListener('click', () => {
                    if (this.stateManager.redo()) {
                        this.render();
                    }
                });
                
                // 要素追加ボタン
                this.elements.addTextBtn.addEventListener('click', () => this.addElement('text'));
                this.elements.addChartBtn.addEventListener('click', () => this.addChart());
                this.elements.addIframeBtn.addEventListener('click', () => this.addElement('iframe'));
                this.elements.addShapeBtn.addEventListener('click', () => MicroModal.show('shape-modal'));
                
                // 動画・表追加ボタン
                this.elements.addVideoBtn = document.getElementById('add-video-btn');
                if (this.elements.addVideoBtn) {
                    this.elements.addVideoBtn.addEventListener('click', () => this.addElement('video'));
                }
                this.elements.addTableBtn = document.getElementById('add-table-btn');
                if (this.elements.addTableBtn) {
                    this.elements.addTableBtn.addEventListener('click', () => this.addElement('table'));
                }

                // QRコードボタン
                this._bindQRCodeButton();

                // 画像関連ボタン
                this._bindImageButtons();

                // プレゼンテーション・保存・エクスポートボタン
                this.elements.saveBtn.addEventListener('click', () => this.saveState());
                this.elements.presentBtn.addEventListener('click', () => this.presentationManager.startPresentation());
                this.elements.exportBtn.addEventListener('click', (e) => this.showExportMenu(e));
            },

            _bindQRCodeButton() {
                const qrBtn = document.getElementById('add-qr-btn');
                if (qrBtn) {
                    qrBtn.addEventListener('click', function() {
                        if (typeof MicroModal !== "undefined") {
                            MicroModal.show('qr-modal');
                        }
                        // 初期化
                        const qrText = document.getElementById('qr-text');
                        const qrSize = document.getElementById('qr-size');
                        const qrPreview = document.getElementById('qr-preview');
                        if (qrText) qrText.value = '';
                        if (qrSize) qrSize.value = 256;
                        if (qrPreview) qrPreview.innerHTML = '';
                    });
                }
            },

            _bindImageButtons() {
                // 画像アップロードボタン
                this.elements.addImageBtn.addEventListener('click', () => {
                    this.elements.imageUploadInput.click();
                });
                
                // 画像ファイル選択のハンドリング
                this.elements.imageUploadInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            this.addElement('image', e.target.result);
                        };
                        reader.readAsDataURL(file);
                    }
                    event.target.value = null; // ファイル入力をリセット
                });

                // 画像編集ボタン
                if (this.elements.addImageEditBtn) {
                    this.elements.addImageEditBtn.addEventListener('click', function() {
                        if (typeof MicroModal !== "undefined") {
                            MicroModal.show('imgedit-modal');
                        }
                    });
                }
            },

            _bindSidebarEvents() {
                // サイドバータブ切り替え
                if (this.elements.sidebarTabs) {
                    this.elements.sidebarTabs.addEventListener('click', e => {
                        const button = e.target.closest('.sidebar-tab-button');
                        if (button) {
                            const tabName = button.dataset.tab;
                            this.switchToTab(tabName);
                        }
                    });
                }

                // 右サイドバーリサイズ
                this._bindRightSidebarResize();

                // ページCSS保存ボタン
                const saveGlobalCssBtn = document.getElementById('save-global-css-btn');
                if (saveGlobalCssBtn) {
                    saveGlobalCssBtn.addEventListener('click', () => {
                        this._handleGlobalCssSave();
                    });
                }
            },

            _bindIconEvents() {
                // Font Awesome / Material Icons切り替え
                this._bindIconToggleButtons();
                
                // Font Awesomeイベント
                this._bindFontAwesomeEvents();
                
                // Material Iconsイベント
                this._bindMaterialIconEvents();
            },

            _bindIconToggleButtons() {
                const faToggleButton = document.getElementById('fa-toggle-btn');
                const miToggleButton = document.getElementById('mi-toggle-btn');
                const fontAwesomeSection = document.getElementById('font-awesome-section');
                const materialIconsSection = document.getElementById('material-icons-section');

                if (faToggleButton && miToggleButton && fontAwesomeSection && materialIconsSection) {
                    faToggleButton.addEventListener('click', () => {
                        faToggleButton.classList.add('active');
                        miToggleButton.classList.remove('active');
                        fontAwesomeSection.style.display = 'block';
                        materialIconsSection.style.display = 'none';
                        this.initCategoryFilters('fa');
                        this.renderIconList('fa');
                    });

                    miToggleButton.addEventListener('click', () => {
                        miToggleButton.classList.add('active');
                        faToggleButton.classList.remove('active');
                        materialIconsSection.style.display = 'block';
                        fontAwesomeSection.style.display = 'none';
                        this.initCategoryFilters('mi');
                        this.renderIconList('mi');
                    });
                }
            },

            _bindFontAwesomeEvents() {
                // 検索
                if (this.elements.faIconSearchInput) {
                    this.elements.faIconSearchInput.addEventListener('input', e => {
                        const activeCategoryButton = this.elements.faIconCategoryFilter.querySelector('button.active');
                        const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                        this.renderIconList('fa', e.target.value, category);
                    });
                }

                // スタイル選択
                const faStyleSelect = document.getElementById('fa-style-select');
                if (faStyleSelect) {
                    faStyleSelect.addEventListener('change', () => {
                        const activeCategoryButton = this.elements.faIconCategoryFilter.querySelector('button.active');
                        const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                        this.renderIconList('fa', this.elements.faIconSearchInput.value, category);
                    });
                }

                // カテゴリーフィルター初期化
                if (this.elements.faIconCategoryFilter) {
                    this.initCategoryFilters('fa');
                }

                // アイコンクリック
                if (this.elements.faIconListContainer) {
                    this.elements.faIconListContainer.addEventListener('click', e => {
                        const iconDiv = e.target.closest('.icon-item');
                        if (iconDiv && iconDiv.dataset.iconClass) {
                            this.addIconElement('fa', iconDiv.dataset.iconClass);
                        }
                    });
                }
            },

            _bindMaterialIconEvents() {
                // 検索
                if (this.elements.miIconSearchInput) {
                    this.elements.miIconSearchInput.addEventListener('input', e => {
                        const activeCategoryButton = this.elements.miIconCategoryFilter.querySelector('button.active');
                        const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                        this.renderIconList('mi', e.target.value, category);
                    });
                }

                // スタイル選択
                const miStyleSelect = document.getElementById('mi-style-select');
                if (miStyleSelect) {
                    miStyleSelect.addEventListener('change', () => {
                        const activeCategoryButton = this.elements.miIconCategoryFilter.querySelector('button.active');
                        const category = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて';
                        this.renderIconList('mi', this.elements.miIconSearchInput.value, category);
                    });
                }

                // カテゴリーフィルター初期化
                if (this.elements.miIconCategoryFilter) {
                    this.initCategoryFilters('mi');
                }

                // アイコンクリック
                if (this.elements.miIconListContainer) {
                    this.elements.miIconListContainer.addEventListener('click', e => {
                        const iconDiv = e.target.closest('.icon-item');
                        if (iconDiv && iconDiv.dataset.iconClass) {
                            this.addIconElement('mi', iconDiv.dataset.iconClass);
                        }
                    });
                }
            },

            _bindCanvasEvents() {
                // スライドサムネイルクリック
                this.elements.slideList.addEventListener('click', e => this.handleThumbnailClick(e));

                // マウス・タッチイベント統合ハンドラー
                const pointerDownHandler = Utils.debounce(this._createPointerDownHandler(), 50);
                this.elements.slideCanvas.addEventListener('mousedown', pointerDownHandler);
                this.elements.slideCanvas.addEventListener('touchstart', pointerDownHandler, { passive: false });

                // ダブルクリック・ダブルタップ
                this.elements.slideCanvas.addEventListener('dblclick', e => this.handleCanvasDblClick(e));
                this._bindTouchDoubleTap();

                // その他のキャンバスイベント
                this.elements.slideCanvas.addEventListener('blur', e => this.handleElementBlur(e), true);
                this.elements.slideCanvas.addEventListener('contextmenu', e => this._handleCanvasContextMenu(e));
            },

            _createPointerDownHandler() {
                return (e) => {
                    try {
                        // select/option内のイベントは無視
                        if (!e.target || e.target.closest('select, option')) {
                            return;
                        }

                        const isTouch = e.type.startsWith('touch');
                        if (isTouch && (!e.touches || e.touches.length === 0)) {
                            console.warn("Touch event with no touches detected");
                            return;
                        }

                        const point = isTouch ? e.touches[0] : e;
                        if (!point || !point.target) {
                            console.warn("Invalid pointer event");
                            return;
                        }

                        const element = point.target.closest('.slide-element');
                        if (element) {
                            this.handleCanvasMouseDown(e);
                        } else {
                            this.handleSelectionBoxStart(e);
                        }
                    } catch (error) {
                        ErrorHandler.handle(error, 'pointer_down');
                    }
                };
            },

            _bindTouchDoubleTap() {
                this.elements.slideCanvas.addEventListener('touchend', e => {
                    try {
                        if (!this._lastTap) {
                            this._lastTap = Date.now();
                            setTimeout(() => { this._lastTap = null; }, 400);
                        } else {
                            const now = Date.now();
                            if (now - this._lastTap < 400) {
                                const touch = e.changedTouches[0];
                                if (touch) {
                                    const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                    if (target && target.classList.contains('slide-element') && target.classList.contains('text')) {
                                        this.handleCanvasDblClick({ target });
                                    }
                                }
                            }
                            this._lastTap = null;
                        }
                    } catch (error) {
                        ErrorHandler.handle(error, 'touch_double_tap');
                    }
                });
            },

            _bindAlignmentEvents() {
                const alignmentHandlers = {
                    'alignLeftBtn': () => this.alignElements('left'),
                    'alignCenterHBtn': () => this.alignElements('center-h'),
                    'alignRightBtn': () => this.alignElements('right'),
                    'alignTopBtn': () => this.alignElements('top'),
                    'alignCenterVBtn': () => this.alignElements('center-v'),
                    'alignBottomBtn': () => this.alignElements('bottom'),
                    'distributeHBtn': () => this.distributeElements('horizontal'),
                    'distributeVBtn': () => this.distributeElements('vertical')
                };

                Object.entries(alignmentHandlers).forEach(([elementId, handler]) => {
                    const element = this.elements[elementId];
                    if (element) {
                        element.addEventListener('click', handler);
                    }
                });
            },

            _bindGroupEvents() {
                this.elements.groupBtn.addEventListener('click', () => this.groupSelectedElements());
                this.elements.ungroupBtn.addEventListener('click', () => this.ungroupSelectedElements());
            },

            _bindInspectorEvents() {
                // インスペクター内のコントロールイベント伝播を停止
                ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                    this.elements.inspector.addEventListener(eventType, e => {
                        if (e.target.closest('select, option, input[type="color"]')) {
                            e.stopPropagation();
                        }
                    });
                });

                // インスペクター入力イベント
                this.elements.inspector.addEventListener('input', e => this.handleInspectorInput(e));
            },

            _bindRightSidebarResize() {
                const sidebar = this.elements.rightSidebar;
                const handle = document.getElementById('right-sidebar-resize-handle');
                let isResizing = false;
                let startX = 0;
                let startWidth = 0;

                if (handle) {
                    handle.addEventListener('mousedown', (e) => {
                        isResizing = true;
                        startX = e.clientX;
                        startWidth = sidebar.offsetWidth;
                        document.body.style.cursor = 'ew-resize';
                        e.preventDefault();
                    });
                }

                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;
                    let newWidth = startWidth - (e.clientX - startX);
                    newWidth = Math.max(200, Math.min(newWidth, 600)); // 最小・最大幅
                    sidebar.style.width = `${newWidth}px`;
                    this.state.ui.rightSidebarWidth = newWidth;
                });

                document.addEventListener('mouseup', () => {
                    if (isResizing) {
                        isResizing = false;
                        document.body.style.cursor = '';
                    }
                });
            },

            _bindGlobalEvents() {
                // グローバルマウス・タッチイベント
                window.addEventListener('mousemove', e => this.handleMouseMove(e));
                window.addEventListener('touchmove', e => this.handleMouseMove(e), { passive: false });
                window.addEventListener('mouseup', e => this.handleMouseUp(e));
                window.addEventListener('touchend', e => this.handleMouseUp(e));

                // キーボードイベント
                window.addEventListener('keydown', e => this.handleKeyDown(e));
                window.addEventListener('keyup', e => this.handleKeyUp(e));

                // ウィンドウイベント
                window.addEventListener('resize', Utils.debounce(() => {
                    this.updateCanvasScale();
                    this.render();
                }, 250));
                document.addEventListener('fullscreenchange', () => {
                    if (!document.fullscreenElement) {
                        this.presentationManager.stopPresentation();
                    }
                });
            },

            _handleGlobalCssSave() {
                try {
                    const container = document.getElementById('global-css-input');
                    if (!container) return;
                    const textarea = container.querySelector('textarea');
                    if (!textarea) return;
                    const css = textarea.value;

                    this.state.presentation.settings.globalCss = css;
                    this.applyCustomCss();
                    this.saveState();
                    alert('ページ全体のCSSを適用しました。');
                } catch (error) {
                    ErrorHandler.handle(error, 'global_css_save');
                }
            },

            _handleCanvasContextMenu(e) {
                e.preventDefault();
                // 右クリック時にドラッグ・リサイズ状態を必ず解除
                this.batchUpdateState({
                    'interaction.isDragging': false,
                    'interaction.isResizing': false,
                    'interaction.initialStates': []
                });
                try {
                    const el = e.target.closest('.slide-element');
                    const isEditingText = el && el.getAttribute('contenteditable') === 'true';
                    const hasMultipleSelection = this.state.selectedElementIds && this.state.selectedElementIds.length > 1;

                    if ((el && el.dataset.id && !isEditingText) || hasMultipleSelection) {
                        // 要素または複数選択のコンテキストメニュー
                        const targetId = el?.dataset?.id || this.state.selectedElementIds[0];
                        this.showElementContextMenu(e, targetId);
                    } else {
                        // 空白部分のコンテキストメニュー
                        this.showPasteContextMenu(e);
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'canvas_context_menu');
                }
            },

            // スライド拡大縮小コントロール初期化
            initZoomControl() {
                // タッチデバイス向け: 2本指パン・ピンチズーム
                let lastTouchDist = null;
                let lastTouchCenter = null;
                this.elements.slideCanvas.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 2) {
                        e.preventDefault();
                        const t1 = e.touches[0], t2 = e.touches[1];
                        lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                        lastTouchCenter = {
                            x: (t1.clientX + t2.clientX) / 2,
                            y: (t1.clientY + t2.clientY) / 2
                        };
                        const pan = this.getState('canvas.pan') || { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
                        this.batchUpdateState({
                            'canvas.pan.dragging': true,
                            'canvas.pan.startX': lastTouchCenter.x,
                            'canvas.pan.startY': lastTouchCenter.y,
                            'canvas.pan.originX': pan.x,
                            'canvas.pan.originY': pan.y
                        });
                    }
                }, { passive: false });
                this.elements.slideCanvas.addEventListener('touchmove', (e) => {
                    if (e.touches.length === 2 && this.state.canvasPan && this.state.canvasPan.dragging) {
                        e.preventDefault();
                        const t1 = e.touches[0], t2 = e.touches[1];
                        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                        const center = {
                            x: (t1.clientX + t2.clientX) / 2,
                            y: (t1.clientY + t2.clientY) / 2
                        };
                        // ピンチズーム
                        if (lastTouchDist) {
                            const currentScale = this.getState('canvas.scale') || CONFIG.CANVAS_SCALE.default;
                            let scale = currentScale * (dist / lastTouchDist);
                            scale = Utils.clamp(scale, CONFIG.CANVAS_SCALE.min, CONFIG.CANVAS_SCALE.max);
                            this.updateState('canvas.scale', scale);
                            this.updateZoomDisplay();
                        }
                        // 2本指パン
                        if (lastTouchCenter) {
                            const pan = this.getState('canvas.pan') || { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
                            const dx = center.x - pan.startX;
                            const dy = center.y - pan.startY;
                            this.updateState('canvas.pan.x', pan.originX + dx);
                            this.updateState('canvas.pan.y', pan.originY + dy);
                        }
                        lastTouchDist = dist;
                        lastTouchCenter = center;
                        this.updateCanvasScale();
                    }
                }, { passive: false });
                this.elements.slideCanvas.addEventListener('touchend', (e) => {
                    const pan = this.getState('canvas.pan');
                    if (pan && pan.dragging) {
                        this.updateState('canvas.pan.dragging', false);
                        lastTouchDist = null;
                        lastTouchCenter = null;
                    }
                });
                // ミドルクリックパン
                const canvas = this.elements.slideCanvas;
                canvas.addEventListener('mousedown', (e) => {
                    if (e.button === 1) {
                        e.preventDefault();
                        const pan = this.getState('canvas.pan') || { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
                        this.batchUpdateState({
                            'canvas.pan.dragging': true,
                            'canvas.pan.startX': e.clientX,
                            'canvas.pan.startY': e.clientY,
                            'canvas.pan.originX': pan.x,
                            'canvas.pan.originY': pan.y
                        });
                        document.body.style.cursor = 'grab';
                    }
                });
                window.addEventListener('mousemove', (e) => {
                    const pan = this.getState('canvas.pan');
                    if (pan && pan.dragging) {
                        const dx = e.clientX - pan.startX;
                        const dy = e.clientY - pan.startY;
                        this.batchUpdateState({
                            'canvas.pan.x': pan.originX + dx,
                            'canvas.pan.y': pan.originY + dy
                        });
                        this.updateCanvasScale();
                    }
                });
                window.addEventListener('mouseup', (e) => {
                    const pan = this.getState('canvas.pan');
                    if (pan && pan.dragging) {
                        this.updateState('canvas.pan.dragging', false);
                        document.body.style.cursor = '';
                    }
                });
                // ホイールで拡大縮小 (Ctrlキー不要)
                this.elements.slideCanvas.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const currentScale = this.getState('canvas.scale') || CONFIG.CANVAS_SCALE.default;
                    let scale = currentScale;
                    if (e.deltaY < 0) scale *= 1.1;
                    else scale /= 1.1;
                    scale = Utils.clamp(scale, CONFIG.CANVAS_SCALE.min, CONFIG.CANVAS_SCALE.max);
                    this.updateState('canvas.scale', scale);
                    this.updateCanvasScale();
                    this.updateZoomDisplay();
                }, { passive: false });
                // ズームリセットボタン
                if (!document.getElementById('zoom-reset-btn')) {
                    const btn = document.createElement('button');
                    btn.id = 'zoom-reset-btn';
                    btn.textContent = 'リセット';
                    btn.style.position = 'absolute';
                    btn.style.right = '24px';
                    btn.style.top = '24px';
                    btn.style.zIndex = 100;
                    btn.style.background = '#fff';
                    btn.style.border = '1px solid #ccc';
                    btn.style.borderRadius = '6px';
                    btn.style.padding = '4px 10px';
                    btn.style.fontSize = '13px';
                    btn.style.cursor = 'pointer';
                    btn.onclick = () => {
                        this.batchUpdateState({
                            'canvas.scale': CONFIG.CANVAS_SCALE.default,
                            'canvas.pan.x': 0,
                            'canvas.pan.y': 0
                        });
                        this.updateCanvasScale();
                        this.updateZoomDisplay();
                    };
                    this.elements.mainCanvasArea.appendChild(btn);
                }
                // ズーム倍率表示
                if (!document.getElementById('zoom-display')) {
                    const disp = document.createElement('div');
                    disp.id = 'zoom-display';
                    disp.style.position = 'absolute';
                    disp.style.right = '24px';
                    disp.style.top = '60px';
                    disp.style.zIndex = 100;
                    disp.style.background = '#fff';
                    disp.style.border = '1px solid #ccc';
                    disp.style.borderRadius = '6px';
                    disp.style.padding = '2px 10px';
                    disp.style.fontSize = '13px';
                    this.elements.mainCanvasArea.appendChild(disp);
                }
                this.updateZoomDisplay();
            },
            updateZoomDisplay() {
                const disp = document.getElementById('zoom-display');
                if (disp) {
                    const scale = this.getState('canvas.scale') || CONFIG.CANVAS_SCALE.default;
                    disp.textContent = `ズーム: ${(scale * 100).toFixed(0)}%`;
                }
            },

            handleCanvasMouseDown(e) {
                if (!e.type.startsWith('touch') && e.button === 2) return;

                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const target = point.target;

                if (this.state.isEditingText) {
                    const clickedElement = target.closest('.slide-element');
                    if (!clickedElement || !this.state.selectedElementIds.includes(clickedElement.dataset.id)) {
                        this.stopTextEditing(true);
                    }
                    return;
                }

                const element = target.closest('.slide-element');
                const elementId = element ? element.dataset.id : null;
                const clickedGroup = elementId ? this._findGroupForElement(elementId) : null;

                this.state.interaction.isCtrlPressed = e.ctrlKey || e.metaKey;

                if (clickedGroup) {
                    this.batchUpdateState({
                        'selectedElementIds': [],
                        'selectedGroupIds': [clickedGroup.id]
                    });
                    this.state.interaction.isDragging = true;
                    this.startInteraction(e);
                } else if (elementId) {
                    const isSelected = this.state.selectedElementIds.includes(elementId);
                    if (this.state.interaction.isCtrlPressed) {
                        this.updateState('selectedElementIds', isSelected
                            ? this.state.selectedElementIds.filter(id => id !== elementId)
                            : [...this.state.selectedElementIds, elementId]
                        );
                    } else {
                        if (!isSelected) {
                            this.updateState('selectedElementIds', [elementId]);
                        }
                    }
                    this.updateState('selectedGroupIds', []);

                    if (target.classList.contains('resize-handle')) {
                        this.state.interaction.isResizing = true;
                        this.state.interaction.handle = target.dataset.handle;
                    } else {
                        this.state.interaction.isDragging = true;
                    }
                    this.startInteraction(e);
                } else {
                    this.batchUpdateState({
                        'selectedElementIds': [],
                        'selectedGroupIds': []
                    });
                }
                this.render();
            },

            startInteraction(e) {
                this.stateManager._saveToHistory();
                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const canvasRect = this.elements.slideCanvas.getBoundingClientRect();

                this.batchUpdateState({
                    'canvas.rect': canvasRect,
                    'interaction.startX': point.clientX,
                    'interaction.startY': point.clientY
                });

                let elementsToTrack = [];
                if (this.state.selectedGroupIds.length > 0) {
                    const slideGroups = this.state.presentation.groups[this.state.activeSlideId] || [];
                    this.state.selectedGroupIds.forEach(groupId => {
                        const group = slideGroups.find(g => g.id === groupId);
                        if (group) {
                            elementsToTrack.push(...this.getActiveSlide().elements.filter(el => group.elementIds.includes(el.id)));
                        }
                    });
                } else {
                    elementsToTrack = this.getSelectedElementsData();
                }

                const initialStates = elementsToTrack.map(elData => {
                    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                    if (domEl) domEl.style.willChange = 'transform, width, height';
                    
                    return {
                        id: elData.id,
                        startX: elData.style.left,
                        startY: elData.style.top,
                        startW: elData.style.width,
                        startH: elData.style.height ?? (domEl.offsetHeight / canvasRect.height * 100),
                        initialRect: { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight },
                        _initialFontSize: elData.style.fontSize
                    };
                });

                this.updateState('interaction.initialStates', initialStates);
            },

            handleMouseMove(e) {
                const interaction = this.getState('interaction');
                if (!interaction.isDragging && !interaction.isResizing) return;
                
                // passive:false でリスナーを登録しているので、preventDefaultは常に安全
                e.preventDefault();

                const isTouch = e.type.startsWith('touch');
                // touchmoveイベントでtouchesがない場合は何もしない
                if (isTouch && e.touches.length === 0) return;
                const point = isTouch ? e.touches[0] : e;

                const canvasRect = this.getState('canvas.rect');
                const dx = point.clientX - interaction.startX;
                const dy = point.clientY - interaction.startY;

                this.batchUpdateState({
                    'interaction.lastDx': dx,
                    'interaction.lastDy': dy
                }, { silent: true });

                // ドラッグ中にiframeの再読み込みを防ぐ
                this.state.selectedElementIds.forEach(id => {
                    const elData = this.getActiveSlide().elements.find(el => el.id === id);
                    if (elData && elData.type === 'iframe') {
                        const iframeEl = this.elements.slideCanvas.querySelector(`[data-id="${id}"] iframe`);
                        if (iframeEl) {
                            iframeEl.style.pointerEvents = 'none';
                        }
                    }
                });

                if (interaction.isDragging) {
                    this.handleDragMove(dx, dy);
                } else if (interaction.isResizing) {
                    // スロットリングされたリサイズ処理を呼び出す
                    if (!this.throttledPerformResize) {
                        this.throttledPerformResize = Utils.throttle(this.performResize.bind(this), 50); // 50ms間隔で実行
                    }
                    const dxPercent = dx / CANVAS_WIDTH * 100;
                    const dyPercent = dy / CANVAS_HEIGHT * 100;
                    this.throttledPerformResize(dxPercent, dyPercent);
                }
            },

            handleDragMove(dx, dy) {
                this.guideLineManager.clear();
                const interaction = this.getState('interaction');
                const draggingElementsInitialStates = interaction.initialStates;

                // キャンバスの実際のサイズ（固定）を使用
                const canvasWidth = CANVAS_WIDTH;
                const canvasHeight = CANVAS_HEIGHT;

                let snapOffset = { x: 0, y: 0 };
                let guides = [];

                // スナップ機能が有効な場合のみスナップ処理を実行
                if (this.isSnapEnabled()) {
                    // 1. Calculate collective bounds of moving elements at their current position
                    const combinedBounds = draggingElementsInitialStates.reduce((acc, state) => {
                        const currentLeft = state.initialRect.left + dx;
                        const currentTop = state.initialRect.top + dy;
                        acc.left = Math.min(acc.left, currentLeft);
                        acc.top = Math.min(acc.top, currentTop);
                        acc.right = Math.max(acc.right, currentLeft + state.initialRect.width);
                        acc.bottom = Math.max(acc.bottom, currentTop + state.initialRect.height);
                        return acc;
                    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
                    combinedBounds.centerX = combinedBounds.left + (combinedBounds.right - combinedBounds.left) / 2;
                    combinedBounds.centerY = combinedBounds.top + (combinedBounds.bottom - combinedBounds.top) / 2;

                    // 2. Get static elements for snapping
                    const staticElementsBounds = this.getActiveSlide().elements
                        .filter(el => !this.state.selectedElementIds.includes(el.id))
                        .map(el => {
                            const domEl = this.elements.slideCanvas.querySelector(`[data-id="${el.id}"]`);
                            const rect = { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight };
                            rect.right = rect.left + rect.width; rect.bottom = rect.top + rect.height;
                            rect.centerX = rect.left + rect.width / 2; rect.centerY = rect.top + rect.height / 2;
                            return rect;
                        });
                    const canvasBounds = { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight, centerX: canvasWidth / 2, centerY: canvasHeight / 2 };

                    // 3. Calculate snap offsets and get guides
                    const snapResult = this.guideLineManager.calculateSnapGuides(combinedBounds, staticElementsBounds, canvasBounds);
                    snapOffset = snapResult.snapOffset;
                    guides = snapResult.guides;
                }

                // 4. Apply new positions with snapping via transform
                this.updateState('interaction.lastSnapOffset', snapOffset, { silent: true });
                const elementsToUpdate = this.getSelectedElementsData();
                draggingElementsInitialStates.forEach(initialState => {
                    const elData = elementsToUpdate.find(el => el.id === initialState.id);
                    if (elData) {
                        const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (domEl) {
                            const finalDx = dx + snapOffset.x;
                            const finalDy = dy + snapOffset.y;
                            const rotation = elData.style.rotation || 0;
                            domEl.style.transform = `translate(${finalDx}px, ${finalDy}px) rotate(${rotation}deg)`;
                        }
                    }
                });

                // 5. Render guides and bounding box
                this.renderSelectionBoundingBox();
                if (this.isSnapEnabled()) {
                    guides.forEach(g => { const [o, p] = g.split('-'); this.guideLineManager.addGuide(o, p); });
                }
            },

            handleMouseUp() {
                const interaction = this.getState('interaction');
                
                if (this.state.isEditingText) {
                    this.batchUpdateState({ 'interaction.isDragging': false, 'interaction.isResizing': false });
                    return;
                }

                if (interaction.isDragging) {
                    const canvasWidth = CANVAS_WIDTH;
                    const canvasHeight = CANVAS_HEIGHT;
                    const { lastDx, lastDy, lastSnapOffset, initialStates } = interaction;
                    
                    const finalDx = lastDx + (lastSnapOffset.x || 0);
                    const finalDy = lastDy + (lastSnapOffset.y || 0);

                    const elementsToUpdate = this.getSelectedElementsData();
                    initialStates.forEach(initialState => {
                        const elData = elementsToUpdate.find(el => el.id === initialState.id);
                        if (elData) {
                            const newLeft = initialState.startX + finalDx / canvasWidth * 100;
                            const newTop = initialState.startY + finalDy / canvasHeight * 100;
                            elData.style.left = parseFloat(newLeft.toFixed(2));
                            elData.style.top = parseFloat(newTop.toFixed(2));
                        }
                    });
                    this.saveState();
                }
                
                if (interaction.isResizing) {
                    const { handle, initialStates, lastDx, lastDy } = interaction;
                    const elData = this.getSelectedElement();
                    const initialState = initialStates[0];
                    
                    if (elData && initialState) {
                        const dxPercent = lastDx / CANVAS_WIDTH * 100;
                        const dyPercent = lastDy / CANVAS_HEIGHT * 100;
                        
                        const finalStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent);
                        
                        elData.style.left = finalStyles.newLeft;
                        elData.style.top = finalStyles.newTop;
                        elData.style.width = finalStyles.newWidth;
                        if (finalStyles.newHeight != null) {
                            elData.style.height = finalStyles.newHeight;
                        }
                        if (finalStyles.newFontSize) {
                            elData.style.fontSize = finalStyles.newFontSize;
                        }
                    }
                    this.saveState();
                }

                this.guideLineManager.clear();
                
                this.batchUpdateState({
                    'interaction.isDragging': false,
                    'interaction.isResizing': false,
                    'interaction.initialStates': [],
                    'interaction.lastDx': 0,
                    'interaction.lastDy': 0,
                    'interaction.lastSnapOffset': { x: 0, y: 0 }
                });
                
                this.state.selectedElementIds.forEach(id => {
                    const elData = this.getActiveSlide().elements.find(el => el.id === id);
                    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${id}"]`);
                    if (domEl) {
                        domEl.style.willChange = 'auto';
                    }
                    if (elData && elData.type === 'iframe') {
                        const iframeEl = domEl.querySelector('iframe');
                        if (iframeEl) iframeEl.style.pointerEvents = 'auto';
                    }
                });

                this.render();
            },

            performResize(dxPercent, dyPercent) {
                const interaction = this.getState('interaction');
                const { handle, initialStates } = interaction;
                const elData = this.getSelectedElement();
                const initialState = initialStates[0];
                if (!elData || !initialState) return;

                const newStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent);

                const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                if (domEl) {
                    const rotation = elData.style.rotation || 0;
                    domEl.style.width = `${newStyles.newWidth}%`;
                    if (newStyles.newHeight != null) domEl.style.height = `${newStyles.newHeight}%`;

                    const translateXPercent = handle.includes('w') ? dxPercent : 0;
                    const translateYPercent = handle.includes('n') ? dyPercent : 0;
                    const translateXPx = Utils.percentToPixels(translateXPercent, CANVAS_WIDTH);
                    const translateYPx = Utils.percentToPixels(translateYPercent, CANVAS_HEIGHT);
                    
                    domEl.style.transform = `translate(${translateXPx}px, ${translateYPx}px) rotate(${rotation}deg)`;

                    if (newStyles.newFontSize) {
                        const fontSizer = domEl.querySelector('i, span, div');
                        if(fontSizer) fontSizer.style.fontSize = `${newStyles.newFontSize}px`;
                    }
                }
                this.renderSelectionBoundingBox();
            },

            _calculateResize(handle, initialState, dxPercent, dyPercent) {
                const { startX, startY, startW, startH } = initialState;
                let newLeft = startX;
                let newTop = startY;
                let newWidth = startW;
                let newHeight = startH;

                if (handle.includes('e')) newWidth = Math.max(2, startW + dxPercent);
                if (handle.includes('w')) { newWidth = Math.max(2, startW - dxPercent); newLeft = startX + dxPercent; }
                if (handle.includes('s')) newHeight = startH != null ? Math.max(2, startH + dyPercent) : null;
                if (handle.includes('n')) { newHeight = startH != null ? Math.max(2, startH - dyPercent) : null; newTop = startY + dyPercent; }

                const elData = this.getSelectedElement();
                if (elData && elData.type === 'icon' && startW > 0 && startH > 0) {
                    const ratio = startH / startW;
                    if (newWidth !== startW) newHeight = newWidth * ratio;
                    else if (newHeight !== startH) newWidth = newHeight / ratio;
                }

                let newFontSize = null;
                if ((elData.type === 'text' || elData.type === 'icon') && startW > 0 && newWidth !== startW) {
                    const initialFontSize = initialState._initialFontSize || elData.style.fontSize;
                    newFontSize = Math.max(8, Math.round(initialFontSize * (newWidth / startW)));
                }

                return { newLeft, newTop, newWidth, newHeight, newFontSize };
            },
            handleKeyDown(e) {
                const target = e.target;
                const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor');

                // If typing in an input field, do not trigger global shortcuts like 'delete element'.
                if (isInputFocused) {
                    return; // Exit early
                }

                if (e.key === 'Control' || e.key === 'Meta') this.state.interaction.isCtrlPressed = true;

                    // テキスト編集中はEscapeキーで編集終了のみ許可
                    if (this.state.isEditingText) {
                        if (e.key === 'Escape') {
                            this.stopTextEditing(true);
                            this.render();
                        }
                        return;
                    }
                    // 一括削除
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        if (this.state.selectedElementIds.length > 0) this.deleteSelectedElements();
                    }
                    // 一括コピー
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                        if (this.state.selectedElementIds.length > 0) {
                            e.preventDefault();
                            this.copySelectedElements();
                        }
                    }
                    // 一括貼り付け
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                        if (this._lastCopiedIds && this._lastCopiedIds.length > 0) {
                            e.preventDefault();
                            this.pasteCopiedElements();
                        }
                    }
                    // Undo/Redo
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                        e.preventDefault();
                        if (this.stateManager.undo()) {
                            this.render();
                        }
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                        e.preventDefault();
                        if (this.stateManager.redo()) {
                            this.render();
                        }
                    }
            },
            handleKeyUp(e) { if (e.key === 'Control' || e.key === 'Meta') this.state.interaction.isCtrlPressed = false; },

            toggleElementSelection(id) {
                const { selectedElementIds, interaction } = this.state;
                const index = selectedElementIds.indexOf(id);
                if (id === null) { this.state.selectedElementIds = []; }
                else if (interaction.isCtrlPressed) { if (index === -1) selectedElementIds.push(id); else selectedElementIds.splice(index, 1); }
                else { if (index === -1 || selectedElementIds.length > 1) this.state.selectedElementIds = [id]; }
            },

            stopTextEditing(save = false) {
                if (!this.state.isEditingText) return;
                const editableEl = this.elements.slideCanvas.querySelector('[contenteditable="true"]');
                if (editableEl && save) {
                    const elData = this.getSelectedElement();
                    if (elData && elData.content !== editableEl.innerText) {
                        this.stateManager._saveToHistory();
                        elData.content = editableEl.innerText;
                        this.saveState();
                    }
                }
                this.state.isEditingText = false;
            },

            handleCanvasDblClick(e) {
                // タッチイベントから呼ばれた場合は { target } オブジェクトのみが渡されることがある
                const event = (typeof e.preventDefault === "function") ? e : null;
                const target = e.target || e;
                const element = target.closest('.slide-element.text');
                if (!element) return;
                
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                
                // 他の編集中テキストがあれば保存して終了
                this.stopTextEditing(true);
                
                // 要素を選択状態にする
                this.updateState('selectedElementIds', [element.dataset.id]);
                this.updateState('isEditingText', true);
                
                // すべての要素のcontenteditableをfalseにリセット
                this.elements.slideCanvas.querySelectorAll('.slide-element[contenteditable="true"]')
                    .forEach(el => el.setAttribute('contenteditable', 'false'));
                
                // 対象の要素だけcontenteditableをtrueにしてフォーカス
                element.setAttribute('contenteditable', 'true');
                element.style.cursor = 'text';
                
                // フォーカスとテキスト選択を次のフレームで実行
                requestAnimationFrame(() => {
                    element.focus();
                    
                    // テキストを全選択
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    // インスペクターを更新（renderを呼ばずに）
                    if (this.state.selectedElementIds.length > 0) {
                        this.switchToTab('inspector');
                        this.renderInspector();
                    }
                });
            },

            handleElementBlur(e) {
                if (this.state.isEditingText && e.target.classList.contains('slide-element')) {
                    this.stopTextEditing(true);
                    this.saveState();
                    this.render();
                }
            },

            addSlide(silent = false) {
                if (!silent) this.stateManager._saveToHistory();
                const newId = this.generateId('slide');
                const newSlide = { id: newId, elements: [] };
                const activeIndex = this.state.presentation.slides.findIndex(s => s.id === this.state.activeSlideId);
                const insertionIndex = activeIndex === -1 ? this.state.presentation.slides.length : activeIndex + 1;
                
                this.state.presentation.slides.splice(insertionIndex, 0, newSlide);

                if (!silent) {
                    this.state.activeSlideId = newId;
                    this.state.selectedElementIds = [];
                    this.render();
                    this.saveState();
                }
                return newId;
            },
            deleteSlide(slideId, silent = false) {
                if (this.state.presentation.slides.length <= 1) {
                    const msg = '最後のスライドは削除できません。';
                    if (!silent) alert(msg);
                    return { success: false, message: msg };
                }
                const targetId = slideId || this.state.activeSlideId;
                if (!silent && !confirm(`スライド(ID: ${targetId})を削除しますか？`)) {
                    return { success: false, message: '削除がキャンセルされました。' };
                }
                if (!silent) this.stateManager._saveToHistory();
                const idx = this.state.presentation.slides.findIndex(s => s.id === targetId);
                if (idx === -1) {
                     return { success: false, message: `スライド(ID: ${targetId})が見つかりません。` };
                }
                
                this.state.presentation.slides.splice(idx, 1);
                
                if (this.state.activeSlideId === targetId) {
                    this.state.activeSlideId = this.state.presentation.slides[Math.max(0, idx - 1)]?.id;
                }
                if (!silent) {
                    this.state.selectedElementIds = [];
                    this.render();
                    this.saveState();
                }
                return { success: true };
            },
            addElementToSlide(slideId, type, content, style) {
                const slide = this.state.presentation.slides.find(s => s.id === slideId);
                if (!slide) return null;
                const newEl = {
                    id: this.generateId('el'),
                    type,
                    content: content || '',
                    style: {
                        top: 20, left: 20, width: 30, height: null, rotation: 0, animation: '',
                        ...style
                    }
                };
                 if (type === 'text' && !style?.fontSize) newEl.style.fontSize = 24;
                 if (type === 'image' && style.height === undefined) newEl.style.height = 30;

                slide.elements.push(newEl);
                return newEl;
            },
            addElement(type, content) { // This is for user interaction
                this.stateManager._saveToHistory();
                const slide = this.getActiveSlide();
                if (!slide) return;
                const newEl = {
                    id: this.generateId('el'),
                    type,
                    style: { top: 20, left: 20, width: 30, height: null, rotation: 0, animation: '' }
                };
                if (type === 'text') {
                    newEl.content = content || '新しいテキスト'; // Use provided content or default
                    Object.assign(newEl.style, { width: 'auto', color: '#212529', fontSize: 24, fontFamily: 'sans-serif' });
                } else if (type === 'image') {
                    if (!content) { // Content is now the dataURL, no prompt needed
                        console.error('画像データがありません。');
                        return;
                    }
                    newEl.content = content; // content is the Base64 dataURL
                    newEl.style.height = 30; // Default height, user can resize
                } else if (type === 'video') {
                    const url = content || prompt('動画のURLを入力してください:', 'https://www.w3schools.com/html/mov_bbb.mp4');
                    if (!url) return;
                    newEl.content = { url: url, autoplay: false, loop: false, controls: true };
                    newEl.style.height = 30;
                } else if (type === 'table') {
                    // デフォルト2x2の表
                    newEl.content = {
                        rows: 2,
                        cols: 2,
                        data: [
                            ["セル1", "セル2"],
                            ["セル3", "セル4"]
                        ]
                    };
                    newEl.style.height = 30;
                } else if (type === 'iframe') {
                    const url = prompt('埋め込みたいコンテンツのURLを入力してください:');
                    if (!url) return;
                    newEl.content = { url: url, sandbox: 'allow-scripts allow-same-origin allow-popups' }; // デフォルトのsandbox属性
                    newEl.style.width = 50;
                    newEl.style.height = 50;
                } else if (type === 'shape') {
                    if (!content || !content.shapeType) {
                        console.error('図形タイプが指定されていません。');
                        return;
                    }
                    newEl.content = content;
                    Object.assign(newEl.style, {
                        width: 20,
                        height: 20,
                        fill: '#cccccc',
                        stroke: 'transparent', // デフォルトのstrokeを透明に
                        strokeWidth: 0 // デフォルトのstrokeWidthを0に
                    });
                    if (content.shapeType === 'line') {
                        newEl.style.height = 0; // 線は高さを0にする
                        newEl.style.stroke = '#000000'; // 線のデフォルト色
                        newEl.style.strokeWidth = 2; // 線のデフォルト太さ
                        delete newEl.style.fill; // 線はfill不要
                    }
                }
                slide.elements.push(newEl);
                this.state.selectedElementIds = [newEl.id];
                this.saveState();
                this.render();
                if (type === 'text') setTimeout(() => this.handleCanvasDblClick({ target: this.elements.slideCanvas.querySelector(`[data-id="${newEl.id}"]`) }), 50);
                this.applyCustomCss();
            },

            
            addChart() {
                // Micromodalでグラフ作成モーダルを表示
                if (typeof MicroModal !== "undefined") {
                    MicroModal.show('chart-modal');
                } else {
                    console.error("MicroModal is undefined.");
                }
            },

            deleteSelectedElements() { if (!confirm(`${this.state.selectedElementIds.length}個の要素を削除しますか？`)) return; this.stateManager._saveToHistory(); const slide = this.getActiveSlide(); if (!slide) return; slide.elements = slide.elements.filter(el => !this.state.selectedElementIds.includes(el.id)); this.state.selectedElementIds = []; this.render(); this.saveState(); },

            alignElements(type) {
                const elementsData = this.getSelectedElementsData(); if (elementsData.length < 2) return;
                this.stateManager._saveToHistory();
                const pixelElements = this.getElementsWithPixelRects(elementsData); const bounds = this.calculatePixelBounds(pixelElements); const canvasRect = this.state.slideCanvasRect;
                pixelElements.forEach(el => {
                    let newLeft, newTop;
                    switch (type) {
                        case 'left': newLeft = bounds.minX; break; case 'center-h': newLeft = bounds.centerX - el.rect.width / 2; break;
                        case 'right': newLeft = bounds.maxX - el.rect.width; break; case 'top': newTop = bounds.minY; break;
                        case 'center-v': newTop = bounds.centerY - el.rect.height / 2; break; case 'bottom': newTop = bounds.maxY - el.rect.height; break;
                    }
                    if (newLeft !== undefined) el.data.style.left = newLeft / canvasRect.width * 100;
                    if (newTop !== undefined) el.data.style.top = newTop / canvasRect.height * 100;
                });
                this.render(); this.saveState();
            },

            distributeElements(direction) {
                const elementsData = this.getSelectedElementsData(); if (elementsData.length < 3) return;
                this.stateManager._saveToHistory();
                const pixelElements = this.getElementsWithPixelRects(elementsData); const canvasRect = this.state.slideCanvasRect;
                let guidePositions = [];
                if (direction === 'horizontal') {
                    pixelElements.sort((a, b) => a.rect.left - b.rect.left); const bounds = this.calculatePixelBounds(pixelElements);
                    const totalWidth = pixelElements.reduce((sum, el) => sum + el.rect.width, 0); const gap = (bounds.width - totalWidth) / (pixelElements.length - 1);
                    let currentX = bounds.minX;
                    pixelElements.forEach((el, idx) => {
                        el.data.style.left = currentX / canvasRect.width * 100;
                        // ガイド線位置（左端以外）
                        if (idx > 0 && idx < pixelElements.length) {
                            guidePositions.push(currentX);
                        }
                        currentX += el.rect.width + gap;
                    });
                    // 最後のガイド線
                    guidePositions.push(bounds.maxX);
                } else {
                    pixelElements.sort((a, b) => a.rect.top - b.rect.top); const bounds = this.calculatePixelBounds(pixelElements);
                    const totalHeight = pixelElements.reduce((sum, el) => sum + el.rect.height, 0); const gap = (bounds.height - totalHeight) / (pixelElements.length - 1);
                    let currentY = bounds.minY;
                    pixelElements.forEach((el, idx) => {
                        el.data.style.top = currentY / canvasRect.height * 100;
                        if (idx > 0 && idx < pixelElements.length) {
                            guidePositions.push(currentY);
                        }
                        currentY += el.rect.height + gap;
                    });
                    guidePositions.push(bounds.maxY);
                }
                this.render();
                // 等間隔ガイド線の描画
                setTimeout(() => {
                    this.guideLineManager.clear();
                    guidePositions.forEach(pos => {
                        if (direction === 'horizontal') {
                            this.guideLineManager.addGuide('vertical', pos);
                        } else {
                            this.guideLineManager.addGuide('horizontal', pos);
                        }
                    });
                    // ガイド線は2秒後に自動消去
                    setTimeout(() => this.guideLineManager.clear(), 2000);
                }, 50);
                this.saveState(); this.applyCustomCss();
            },

            // --- 範囲選択用 ---
            handleSelectionBoxStart(e) {
                if (e.button !== 0 || e.target.closest('.slide-element')) return;
                const canvas = this.elements.slideCanvas;
                const rect = canvas.getBoundingClientRect();
                const startX = e.clientX - rect.left;
                const startY = e.clientY - rect.top;
                let selectionBox = document.createElement('div');
                selectionBox.className = 'selection-bounding-box';
                Object.assign(selectionBox.style, {
                    left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px', pointerEvents: 'none'
                });
                canvas.appendChild(selectionBox);

                const onMouseMove = (ev) => {
                    const curX = ev.clientX - rect.left;
                    const curY = ev.clientY - rect.top;
                    const x = Math.min(startX, curX);
                    const y = Math.min(startY, curY);
                    const w = Math.abs(curX - startX);
                    const h = Math.abs(curY - startY);
                    Object.assign(selectionBox.style, {
                        left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`
                    });
                };

                const onMouseUp = (ev) => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    const endX = ev.clientX - rect.left;
                    const endY = ev.clientY - rect.top;
                    const x1 = Math.min(startX, endX), x2 = Math.max(startX, endX);
                    const y1 = Math.min(startY, endY), y2 = Math.max(startY, endY);

                    // 範囲内要素を選択
                    const selected = [];
                    this.getActiveSlide().elements.forEach(el => {
                        const domEl = canvas.querySelector(`[data-id="${el.id}"]`);
                        if (!domEl) return;
                        const elRect = domEl.getBoundingClientRect();
                        const cx = elRect.left - rect.left + elRect.width / 2;
                        const cy = elRect.top - rect.top + elRect.height / 2;
                        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) selected.push(el.id);
                    });
                    this.state.selectedElementIds = selected;
                    selectionBox.remove();
                    this.render();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            },

            // --- 複数コピー ---
            copySelectedElements() {
                this.stateManager._saveToHistory();
                const slide = this.getActiveSlide();
                if (!slide || this.state.selectedElementIds.length === 0) return;
                const newIds = [];
                this.state.selectedElementIds.forEach(id => {
                    const idx = slide.elements.findIndex(el => el.id === id);
                    if (idx === -1) return;
                    const newEl = JSON.parse(JSON.stringify(slide.elements[idx]));
                    newEl.id = this.generateId('el');
                    newEl.style.left += 2;
                    newEl.style.top += 2;
                    newEl.style.zIndex = slide.elements.length + 1;
                    slide.elements.push(newEl);
                    newIds.push(newEl.id);
                });
                this.state.selectedElementIds = newIds;
                this.render();
                this.saveState();
                this.applyCustomCss();
            },

            getElementsWithPixelRects(elementsData) { return elementsData.map(elData => { const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`); return { data: elData, rect: { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight, } }; }); },
            calculatePixelBounds(pixelElements) { const bounds = pixelElements.reduce((acc, el) => ({ minX: Math.min(acc.minX, el.rect.left), minY: Math.min(acc.minY, el.rect.top), maxX: Math.max(acc.maxX, el.rect.left + el.rect.width), maxY: Math.max(acc.maxY, el.rect.top + el.rect.height), }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }); bounds.width = bounds.maxX - bounds.minX; bounds.height = bounds.maxY - bounds.minY; bounds.centerX = bounds.minX + bounds.width / 2; bounds.centerY = bounds.minY + bounds.height / 2; return bounds; },
            getSelectedElementsBoundingBox(inPercent = false) {
                const els = this.getSelectedElementsData();
                if (els.length === 0) return null;
                return this.getGroupBoundingBox(els.map(e => e.id), inPercent);
            },

            getGroupBoundingBox(elementIds, inPercent = false) {
                if (!elementIds || elementIds.length === 0) return null;
                const elements = this.getActiveSlide().elements.filter(el => elementIds.includes(el.id));
                const pixelEls = this.getElementsWithPixelRects(elements);
                if (pixelEls.length === 0) return null;

                const bounds = this.calculatePixelBounds(pixelEls);
                if (!inPercent) return bounds;

                const canvasRect = this.getState('canvas.rect');
                if (!canvasRect || !canvasRect.width || !canvasRect.height) return null;

                return {
                    left: bounds.minX / canvasRect.width * 100,
                    top: bounds.minY / canvasRect.height * 100,
                    width: bounds.width / canvasRect.width * 100,
                    height: bounds.height / canvasRect.height * 100
                };
            },

            _findGroupForElement(elementId) {
                const slideGroups = this.state.presentation.groups?.[this.state.activeSlideId] || [];
                return slideGroups.find(group => group.elementIds.includes(elementId));
            },
            handleThumbnailClick(e) { const thumb = e.target.closest('.slide-thumbnail'); if (thumb) { this.state.activeSlideId = thumb.dataset.id; this.state.selectedElementIds = []; this.render(); } },
handleInspectorInput(e) {
    e.stopPropagation();
    const el = this.getSelectedElement();
    if (!el) return;

    const prop = e.target.dataset.prop;
    if (!prop || prop === 'customCss') return;

    if (!this._inspectorInputTimeout) {
        this.stateManager._saveToHistory();
    }
    if (this._inspectorInputTimeout) {
        clearTimeout(this._inspectorInputTimeout);
    }

    let value;
    const unit = e.target.dataset.unit;
    if (e.target.type === 'checkbox') {
        value = e.target.checked;
    } else if (e.target.type === 'number') {
        value = parseFloat(e.target.value);
    } else {
        value = e.target.value;
    }

    // Update the style property on the element's data object
    if (unit === 'px' && (prop === 'width' || prop === 'height')) {
        if (prop === 'width') {
            el.style.width = Utils.pixelsToPercent(value, CANVAS_WIDTH);
        } else if (prop === 'height') {
            el.style.height = Utils.pixelsToPercent(value, CANVAS_HEIGHT);
        }
    } else if ((prop === 'left' || prop === 'top') && unit === '%') {
        el.style[prop] = `${value}%`;
    } else {
        el.style[prop] = value;
    }
    
    // Apply styles to the DOM element
    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${el.id}"]`);
    if (domEl) {
        this.applyStyles(domEl, el.style);
        
        // Special handling for icon color to apply it to the inner element immediately
        if (el.type === 'icon' && prop === 'color') {
            const iconEl = domEl.querySelector('i, span');
            if (iconEl) {
                iconEl.style.color = value;
            }
        }
    }

    // Handle animation separately
    if (prop === 'animation') {
        if (domEl) {
            // Remove previous animation classes if any to avoid conflicts
            const oldAnimation = Object.values(domEl.classList).find(c => c.startsWith('animate__') && c !== value);
            if(oldAnimation) domEl.classList.remove('animate__animated', oldAnimation);

            if (value) {
                // Add new animation
                domEl.classList.add('animate__animated', value);
                // Remove animation classes after it ends to allow re-triggering
                domEl.addEventListener('animationend', function handler() {
                    domEl.classList.remove('animate__animated', value);
                }, { once: true });
            }
        }
    }

    this._inspectorInputTimeout = setTimeout(() => {
        this.saveState();
        this._inspectorInputTimeout = null;
    }, 300);
},
            generateId: (p) => `${p}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            getActiveSlide() { return this.state.presentation?.slides.find(s => s.id === this.state.activeSlideId); },
            getSelectedElement() { const id = this.state.selectedElementIds[0]; return this.getActiveSlide()?.elements.find(el => el.id === id); },
            getSelectedElementsData() { const slide = this.getActiveSlide(); if (!slide) return []; return slide.elements.filter(el => this.state.selectedElementIds.includes(el.id)); },
setActiveSlide(slideId) {
    if (this.state.presentation.slides.some(s => s.id === slideId)) {
        this.state.activeSlideId = slideId;
        this.state.selectedElementIds = [];
        if (document.body.classList.contains('presentation-mode')) {
            this.presentationManager.renderPresentationSlide();
        } else {
            this.render();
        }
    }
},
            showExportMenu(e) {
                const menu = this.elements.exportMenu;
                menu.innerHTML = `
                    <div style="padding:8px 12px;cursor:pointer;" id="export-png-btn">PNGで保存 (このスライドのみ)</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="export-png-all-btn">PNGで保存 (全スライド)</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="export-pdf-btn">PDFで保存 (全スライド)</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="export-pptx-btn">PPTXで保存 (全スライド)</div>
                `;
                menu.style.display = 'block';
                const rect = this.elements.exportBtn.getBoundingClientRect();
                menu.style.left = rect.left + 'px';
                menu.style.top = (rect.bottom + 5) + 'px';
                document.getElementById('export-png-btn').onclick = () => { this.exportCurrentSlideAsImage(); menu.style.display = 'none'; };
                document.getElementById('export-png-all-btn').onclick = () => { this.exportAllSlidesAsImages(); menu.style.display = 'none'; };
                document.getElementById('export-pdf-btn').onclick = () => { this.exportCurrentSlideAsPDF(); menu.style.display = 'none'; };
                document.getElementById('export-pptx-btn').onclick = () => { this.exportAsPPTX(); menu.style.display = 'none'; };

                setTimeout(() => document.addEventListener('click', function h(ev) {
                    if (!menu.contains(ev.target) && !App.elements.exportBtn.contains(ev.target)) {
                        menu.style.display = 'none';
                        document.removeEventListener('click', h);
                    }
                }, { once: true }), 10);
            },
            exportCurrentSlideAsImage() {
                this.runExportWorker('png');
            },
            exportAllSlidesAsImages() {
                this.runExportWorker('png-all');
            },
            exportCurrentSlideAsPDF() {
                this.runExportWorker('pdf');
            },
            exportAsPPTX() {
                this.runExportWorker('pptx');
            },
            async runExportWorker(type) {
                const presentation = this.state.presentation;
                if (!presentation || presentation.slides.length === 0) return;

                ErrorHandler.showNotification('エクスポート処理を開始しました...', 'info');

                const worker = new Worker('export.worker.js');
                
                // --- PPTX (All Slides) ---
                if (type === 'pptx') {
                    const allSlidesData = [];
                    const tempContainer = document.createElement('div');
                    tempContainer.style.position = 'absolute';
                    tempContainer.style.left = '-9999px';
                    document.body.appendChild(tempContainer);

                    for (const slide of presentation.slides) {
                        const slideContainer = document.createElement('div');
                        slideContainer.style.width = `${presentation.settings.width}px`;
                        slideContainer.style.height = `${presentation.settings.height}px`;
                        slide.elements.forEach(elData => {
                            const el = this.createElementDOM(elData);
                            slideContainer.appendChild(el);
                        });
                        tempContainer.appendChild(slideContainer);

                        const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                        const dataUrl = canvas.toDataURL('image/png');
                        allSlidesData.push({ slideData: slide, dataUrl: dataUrl });
                        
                        tempContainer.removeChild(slideContainer);
                    }
                    document.body.removeChild(tempContainer);
                    
                    worker.postMessage({
                        type: 'pptx',
                        slides: allSlidesData,
                        settings: presentation.settings
                    });

                // --- PDF (All Slides) ---
                } else if (type === 'pdf') {
                    const dataUrls = [];
                    const tempContainer = document.createElement('div');
                    tempContainer.style.position = 'absolute';
                    tempContainer.style.left = '-9999px';
                    document.body.appendChild(tempContainer);

                    for (const slide of presentation.slides) {
                        const slideContainer = document.createElement('div');
                        slideContainer.style.width = `${presentation.settings.width}px`;
                        slideContainer.style.height = `${presentation.settings.height}px`;
                        slide.elements.forEach(elData => {
                            const el = this.createElementDOM(elData);
                            slideContainer.appendChild(el);
                        });
                        tempContainer.appendChild(slideContainer);
                        
                        const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                        dataUrls.push(canvas.toDataURL('image/png'));

                        tempContainer.removeChild(slideContainer);
                    }
                    document.body.removeChild(tempContainer);

                    worker.postMessage({
                        type: 'pdf',
                        dataUrls: dataUrls,
                        settings: presentation.settings
                    });
                
                // --- PNG (Current Slide Only) ---
                } else if (type === 'png') {
                    const slide = this.getActiveSlide();
                    if (!slide) return;
                    const slideContainer = document.createElement('div');
                    slideContainer.style.width = `${presentation.settings.width}px`;
                    slideContainer.style.height = `${presentation.settings.height}px`;
                    slide.elements.forEach(elData => {
                        const el = this.createElementDOM(elData);
                        slideContainer.appendChild(el);
                    });
                    document.body.appendChild(slideContainer);
                    const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                    const link = document.createElement('a');
                    link.download = `slide-${slide.id}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    document.body.removeChild(slideContainer);
                    ErrorHandler.showNotification('エクスポートが完了しました。', 'success');
                    worker.terminate(); // No need for worker on PNG
                    return;
                }

                // --- Worker Handlers ---
                worker.onmessage = (event) => {
                    if (event.data.success) {
                        const { type, data } = event.data;
                        let blob, extension;
                        if (type === 'pdf') {
                            blob = new Blob([data], { type: 'application/pdf' });
                            extension = 'pdf';
                        } else if (type === 'pptx') {
                            blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
                            extension = 'pptx';
                        } else if (type === 'png-all') {
                            blob = new Blob([data], { type: 'application/zip' });
                            extension = 'zip';
                        }
                        if (blob) {
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = `presentation.${extension}`;
                            link.click();
                            URL.revokeObjectURL(link.href);
                            ErrorHandler.showNotification('エクスポートが完了しました。', 'success');
                        }
                    } else {
                        console.error('Export failed in worker:', event.data.error);
                        ErrorHandler.handle(new Error(event.data.error), 'export');
                    }
                    worker.terminate();
                };
                worker.onerror = (error) => {
                    console.error('Worker error:', error);
                    ErrorHandler.handle(error, 'export_worker');
                    worker.terminate();
                };
            },
            moveSlide(fromId, toId) { this.stateManager._saveToHistory(); const s = this.state.presentation.slides; const fromIdx = s.findIndex(s => s.id === fromId), toIdx = s.findIndex(s => s.id === toId); if (fromIdx === -1 || toIdx === -1) return; const [moved] = s.splice(fromIdx, 1); s.splice(toIdx, 0, moved); this.render(); this.saveState(); },
            duplicateSlide(slideId) { this.stateManager._saveToHistory(); const s = this.state.presentation.slides; const idx = s.findIndex(s => s.id === slideId); if (idx === -1) return; const newSlide = JSON.parse(JSON.stringify(s[idx])); newSlide.id = this.generateId('slide'); newSlide.elements.forEach(el => el.id = this.generateId('el')); s.splice(idx + 1, 0, newSlide); this.state.activeSlideId = newSlide.id; this.state.selectedElementIds = []; this.render(); this.saveState(); },
            showContextMenu(e, id, content, handlers) { const oldMenu = document.getElementById(id); if (oldMenu) oldMenu.remove(); const menu = document.createElement('div'); menu.id = id; Object.assign(menu.style, { position: 'fixed', zIndex: 99999, left: e.clientX + 'px', top: e.clientY + 'px', background: '#fff', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', padding: '4px' }); if (window.DOMPurify) { menu.innerHTML = DOMPurify.sanitize(content); } else { menu.innerHTML = content; } document.body.appendChild(menu); Object.entries(handlers).forEach(([btnId, handler]) => { const btn = document.getElementById(btnId); if(btn) btn.onclick = () => { handler(); menu.remove(); }; }); setTimeout(() => document.addEventListener('click', function h(ev) { if (!menu.contains(ev.target) && !App.elements.exportBtn.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', h); } }, { once: true }), 10); },
            showSlideContextMenu(e, slideId) { this.showContextMenu(e, 'slide-context-menu', `<div style="padding:8px 12px;cursor:pointer;" id="slide-duplicate-btn">複製</div><div style="padding:8px 12px;cursor:pointer;color:var(--danger-color);" id="slide-delete-btn">削除</div>`, { 'slide-duplicate-btn': () => this.duplicateSlide(slideId), 'slide-delete-btn': () => { this.state.activeSlideId = slideId; this.deleteSlide(); } }); },
            showPasteContextMenu(e) {
                this.showContextMenu(
                    e,
                    'canvas-context-menu',
                    `<div style="padding:8px 12px;cursor:pointer;" id="canvas-paste-btn">ペースト</div>`,
                    {
                        'canvas-paste-btn': () => this.pasteFromClipboard()
                    }
                );
            },
            showElementContextMenu(e, elId) {
                const elData = this.getActiveSlide()?.elements.find(el => el.id === elId);
                if (!elData) return;

                let aiMenuHTML = '';
                if (elData.type === 'text') {
                    aiMenuHTML = `
                    <div style="padding:8px 12px;cursor:pointer;" class="has-submenu" id="el-ai-btn">
                        AI <i class="fas fa-angle-right" style="float:right;"></i>
                        <div class="submenu">
                            <div style="padding:8px 12px;cursor:pointer;" id="el-ai-catchphrase-btn">キャッチコピー</div>
                            <div style="padding:8px 12px;cursor:pointer;" id="el-ai-summarize-btn">要約</div>
                            <div style="padding:8px 12px;cursor:pointer;" id="el-ai-proofread-btn">校正</div>
                        </div>
                    </div>
                    <div class="menu-separator"></div>`;
                }

                const menuContent = `
                    <div style="padding:8px 12px;cursor:pointer;" id="el-copy-btn">コピー</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-paste-btn">ペースト</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-duplicate-btn">複製</div>
                    <div class="menu-separator"></div>
                    ${aiMenuHTML}
                    <div style="padding:8px 12px;cursor:pointer;" id="el-forward-btn">前面へ</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-front-btn">最前面へ</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-backward-btn">背面へ</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-back-btn">最背面へ</div>
                    <div class="menu-separator"></div>
                    <div style="padding:8px 12px;cursor:pointer;color:var(--danger-color);" id="el-delete-btn">削除</div>`;

                const handlers = {
                    'el-copy-btn': () => this.copyToClipboard(elId),
                    'el-paste-btn': () => this.pasteFromClipboard(),
                    'el-duplicate-btn': () => this.duplicateElement(elId),
                    'el-front-btn': () => this.bringElementToFront(elId),
                    'el-forward-btn': () => this.bringElementForward(elId),
                    'el-backward-btn': () => this.sendElementBackward(elId),
                    'el-back-btn': () => this.sendElementToBack(elId),
                    'el-delete-btn': () => { this.state.selectedElementIds = [elId]; this.deleteSelectedElements(); }
                };

                this.showContextMenu(e, 'element-context-menu', menuContent, handlers);

                // AIメニューのイベントハンドラを動的に設定
                if (elData.type === 'text') {
                    const menu = document.getElementById('element-context-menu');
                    if(menu) {
                        const catchphraseBtn = menu.querySelector('#el-ai-catchphrase-btn');
                        const summarizeBtn = menu.querySelector('#el-ai-summarize-btn');
                        const proofreadBtn = menu.querySelector('#el-ai-proofread-btn');

                        const handleAIClick = (processType) => {
                            console.log(`${processType} ボタンがクリックされました`);
                            menu.remove();
                            if (window.aiHandler) {
                                window.aiHandler.processTextWithAI(processType, elData.content, elData.id);
                            } else {
                                console.error('aiHandler が見つかりません');
                            }
                        };

                        if (catchphraseBtn) {
                            catchphraseBtn.addEventListener('click', () => handleAIClick('catchphrase'), { once: true });
                        }
                        if (summarizeBtn) {
                            summarizeBtn.addEventListener('click', () => handleAIClick('summarize'), { once: true });
                        }
                        if (proofreadBtn) {
                            proofreadBtn.addEventListener('click', () => handleAIClick('proofread'), { once: true });
                        }
                    }
                }
            },
            // 複製（現状のコピー機能）
            duplicateElement(elId) {
                this.stateManager._saveToHistory();
                const slide = this.getActiveSlide();
                if (!slide) return;
                const idx = slide.elements.findIndex(el => el.id === elId);
                if (idx === -1) return;
                const newEl = JSON.parse(JSON.stringify(slide.elements[idx]));
                newEl.id = this.generateId('el');
                newEl.style.left += 2;
                newEl.style.top += 2;
                slide.elements.push(newEl);
                this.state.selectedElementIds = [newEl.id];
                this.render();
                this.saveState();
                this.applyCustomCss();
            },
            // クリップボードコピー
            copyToClipboard(elId) {
                const slide = this.getActiveSlide();
                if (!slide) return;
                const el = slide.elements.find(el => el.id === elId);
                if (!el) return;
                window._slideClipboard = JSON.parse(JSON.stringify(el));
            },
            // クリップボードペースト
            pasteFromClipboard() {
                this.stateManager._saveToHistory();
                const slide = this.getActiveSlide();
                if (!slide || !window._slideClipboard) return;
                const newEl = JSON.parse(JSON.stringify(window._slideClipboard));
                newEl.id = this.generateId('el');
                newEl.style.left += 4;
                newEl.style.top += 4;
                slide.elements.push(newEl);
                this.state.selectedElementIds = [newEl.id];
                this.render();
                this.saveState();
                this.applyCustomCss();
            },

            initCategoryFilters(iconType) {
                let categories;
                let filterContainer;
                let activeElements;

                if (iconType === 'fa') {
                    categories = ['すべて', ...new Set(this.config.fontAwesomeIcons.map(icon => icon.category))];
                    filterContainer = this.elements.faIconCategoryFilter;
                    activeElements = this.elements.faIconSearchInput;
                } else if (iconType === 'mi') {
                    categories = ['すべて', ...new Set(this.config.materialIcons.map(icon => icon.category))];
                    filterContainer = this.elements.miIconCategoryFilter;
                    activeElements = this.elements.miIconSearchInput;
                } else {
                    return; // 未知のアイコンタイプ
                }

                filterContainer.innerHTML = '';

                categories.forEach(category => {
                    const button = document.createElement('button');
                    button.textContent = category;
                    button.dataset.category = category;
                    Object.assign(button.style, {
                        padding: '4px 10px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '12px'
                    });

                    if (category === 'すべて') {
                        button.classList.add('active');
                        button.style.backgroundColor = 'var(--primary-color)';
                        button.style.color = 'white';
                        button.style.borderColor = 'var(--primary-color)';
                    }

                    button.addEventListener('click', () => {
                        filterContainer.querySelectorAll('button').forEach(btn => {
                            btn.classList.remove('active');
                            btn.style.backgroundColor = 'transparent';
                            btn.style.color = 'inherit';
                            btn.style.borderColor = 'var(--border-color)';
                        });
                        button.classList.add('active');
                        button.style.backgroundColor = 'var(--primary-color)';
                        button.style.color = 'white';
                        button.style.borderColor = 'var(--primary-color)';

                        activeElements.value = ''; // カテゴリ変更時に検索をクリア
                        this.renderIconList(iconType, '', category);
                    });
                    filterContainer.appendChild(button);
                });
            },

            renderIconList(iconType, searchTerm = '', category = 'すべて') {
                let icons;
                let iconListContainer;
                let fuseInstance;

                if (iconType === 'fa') {
                    icons = this.config.fontAwesomeIcons;
                    iconListContainer = this.elements.faIconListContainer;
                    fuseInstance = this.faIconFuse;
                } else if (iconType === 'mi') {
                    icons = this.config.materialIcons;
                    iconListContainer = this.elements.miIconListContainer;
                    fuseInstance = this.miIconFuse;
                } else {
                    return;
                }

                if (!iconListContainer) return;
                iconListContainer.innerHTML = '';

                let filteredIcons = icons;
                if (searchTerm) {
                    filteredIcons = fuseInstance.search(searchTerm).map(r => r.item);
                }

                const lowerSearchTerm = searchTerm.toLowerCase();

                filteredIcons = filteredIcons.filter(icon => {
                    const inCategory = category === 'すべて' || icon.category === category;
                    const matchesSearch = !searchTerm ||
                        icon.name.toLowerCase().includes(lowerSearchTerm) ||
                        icon.category.toLowerCase().includes(lowerSearchTerm) ||
                        (icon.class && icon.class.toLowerCase().includes(lowerSearchTerm)) ||
                        (icon.alias && icon.alias.toLowerCase().includes(lowerSearchTerm));
                    return inCategory && matchesSearch;
                });

                filteredIcons.forEach(icon => {
                    const iconDiv = document.createElement('div');
                    iconDiv.className = 'icon-item';
                    iconDiv.dataset.iconClass = icon.class;
                    iconDiv.dataset.iconType = iconType;
                    iconDiv.style.padding = '10px';
                    iconDiv.style.border = '1px solid var(--border-color)';
                    iconDiv.style.borderRadius = 'var(--border-radius)';
                    iconDiv.style.cursor = 'pointer';
                    iconDiv.style.textAlign = 'center';
                    iconDiv.style.minWidth = '60px';

                    if (iconType === 'fa') {
                        let stylePrefix = 'fas';
                        const styleSelect = document.getElementById('fa-style-select');
                        if (styleSelect) stylePrefix = styleSelect.value;
                        const faClass = icon.class.replace(/^(fas|far|fal|fat)\s/, stylePrefix + ' ');
                        const iTag = document.createElement('i');
                        iTag.className = `${faClass} fa-2x`;
                        iTag.style.pointerEvents = 'none';
                        iconDiv.appendChild(iTag);
                    } else if (iconType === 'mi') {
                        let stylePrefix = 'material-icons';
                        const styleSelect = document.getElementById('mi-style-select');
                        if (styleSelect) stylePrefix = styleSelect.value;
                        const spanTag = document.createElement('span');
                        spanTag.className = `${stylePrefix}`;
                        spanTag.textContent = icon.class; // Material Icons uses the class name as text content
                        spanTag.style.fontSize = '2em'; // Adjust size for visibility
                        spanTag.style.pointerEvents = 'none';
                        iconDiv.appendChild(spanTag);
                    }
                    iconListContainer.appendChild(iconDiv);
                });
            },

            addIconElement(iconType, iconClass, style = {}) {
                const slide = this.getActiveSlide();
                if (!slide) return;

                const defaultFontSize = 48;
                const fontSize = style.fontSize || defaultFontSize;
                const canvasWidth = this.state.presentation.settings.width || CANVAS_WIDTH;
                const canvasHeight = this.state.presentation.settings.height || CANVAS_HEIGHT;

                const newEl = {
                    id: this.generateId('el'),
                    type: 'icon',
                    iconType: iconType, // Store icon type (fa or mi)
                    content: iconClass, // Class string for FA, class name for MI
                    style: {
                        top: 20,
                        left: 20,
                        width: (fontSize / canvasWidth) * 100,
                        height: (fontSize / canvasHeight) * 100,
                        rotation: 0,
                        color: '#212529',
                        fontSize: fontSize,
                        animation: '',
                        ...style // 渡されたスタイルで上書き
                    }
                };

                if (iconType === 'mi') {
                    // For Material Icons, also store the actual icon name (content for span tag)
                    newEl.miContent = iconClass;
                    // Material Iconsのスタイルを適用
                    const miStyleSelect = document.getElementById('mi-style-select');
                    if (miStyleSelect) {
                        newEl.content = miStyleSelect.value; // e.g., "material-icons-outlined"
                    }
                }

                slide.elements.push(newEl);
                this.state.selectedElementIds = [newEl.id];
                this.saveState();
                this.render();
            },
            // Inspectorでアイコンのスタイルを変更する関数
            updateIconStyle(element, newStylePrefix) {
                this.stateManager._saveToHistory();
                if (element.iconType === 'fa') {
                    // Font Awesomeの場合、クラス名を更新
                    element.content = element.content.replace(/^(fas|far|fal|fat)\s/, newStylePrefix + ' ');
                } else if (element.iconType === 'mi') {
                    // Material Iconsの場合、クラス名を更新 (miContentはそのまま)
                    element.content = newStylePrefix;
                }
                App.saveState();
                App.render();
            },

        // 要素を最前面へ (配列の末尾に移動)
        bringElementToFront(elId) {
            this.stateManager._saveToHistory();
            const slide = this.getActiveSlide();
            if (!slide) return;
            const fromIndex = slide.elements.findIndex(el => el.id === elId);
            if (fromIndex === -1) return;
            Utils.arrayMove(slide.elements, fromIndex, slide.elements.length - 1);
            this.saveState();
            this.render();
        },
        // 要素を最背面へ (配列の先頭に移動)
        sendElementToBack(elId) {
            this.stateManager._saveToHistory();
            const slide = this.getActiveSlide();
            if (!slide) return;
            const fromIndex = slide.elements.findIndex(el => el.id === elId);
            if (fromIndex === -1) return;
            Utils.arrayMove(slide.elements, fromIndex, 0);
            this.saveState();
            this.render();
        },

        // 要素を一つ前面へ (配列内で一つ後ろに)
        bringElementForward(elId) {
            this.stateManager._saveToHistory();
            const slide = this.getActiveSlide();
            if (!slide) return;
            const fromIndex = slide.elements.findIndex(el => el.id === elId);
            if (fromIndex === -1 || fromIndex === slide.elements.length - 1) return;
            Utils.arrayMove(slide.elements, fromIndex, fromIndex + 1);
            this.saveState();
            this.render();
        },

        // 要素を一つ背面へ (配列内で一つ前に)
        sendElementBackward(elId) {
            this.stateManager._saveToHistory();
            const slide = this.getActiveSlide();
            if (!slide) return;
            const fromIndex = slide.elements.findIndex(el => el.id === elId);
            if (fromIndex === -1 || fromIndex === 0) return;
            Utils.arrayMove(slide.elements, fromIndex, fromIndex - 1);
            this.saveState();
            this.render();
        },
        
        // CodeMirror廃止: textareaベースに置換
        initGlobalCssEditor() {
            const container = document.getElementById('global-css-input');
            if (!container) return;

            // 行番号divを用意
            let lineNumbers = container.querySelector('.line-numbers');
            let textarea = container.querySelector('textarea');
            if (!lineNumbers) {
                lineNumbers = document.createElement('div');
                lineNumbers.className = 'line-numbers';
                lineNumbers.style.width = '40px';
                lineNumbers.style.background = '#f7f7f7';
                lineNumbers.style.color = '#888';
                lineNumbers.style.textAlign = 'right';
                lineNumbers.style.padding = '12px 4px 12px 0';
                lineNumbers.style.fontFamily = 'monospace';
                lineNumbers.style.fontSize = '14px';
                lineNumbers.style.userSelect = 'none';
                lineNumbers.style.height = '100%';
                lineNumbers.style.overflow = 'hidden';
                lineNumbers.style.boxSizing = 'border-box';
                lineNumbers.style.borderRadius = 'var(--border-radius) 0 0 var(--border-radius)';
                container.insertBefore(lineNumbers, textarea || null);
            }

            // containerをflexに
            container.style.display = 'flex';
            container.style.flexDirection = 'row';
            container.style.overflow = 'hidden';

            if (!textarea) {
                textarea = document.createElement('textarea');
                textarea.style.width = '100%';
                textarea.style.height = '100%';
                textarea.style.fontFamily = 'monospace';
                textarea.style.fontSize = '14px';
                textarea.style.boxSizing = 'border-box';
                textarea.style.resize = 'none';
                textarea.style.border = 'none';
                textarea.style.borderRadius = '0 var(--border-radius) var(--border-radius) 0';
                textarea.style.background = 'transparent';
                textarea.style.color = 'inherit';
                textarea.style.padding = '12px';
                textarea.style.outline = 'none';
                textarea.style.flex = '1';
                textarea.style.marginLeft = '0';
                container.appendChild(textarea);
            }
            textarea.style.flex = '1';
            textarea.style.marginLeft = '0';

            textarea.value = this.state.presentation.settings.globalCss || '';

            // 行番号更新関数
            function updateLineNumbers() {
                const lines = textarea.value.split('\n').length;
                lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => (i+1)).join('<br>');
            }
            textarea.addEventListener('input', updateLineNumbers);
            textarea.addEventListener('scroll', () => {
                lineNumbers.scrollTop = textarea.scrollTop;
            });
            updateLineNumbers();

            textarea.oninput = () => {
                this.state.presentation.settings.globalCss = textarea.value;
                this.applyCustomCss();
                this.saveState();
            };
        },

        initElementCssEditor(initialContent) {
            const container = document.getElementById('element-css-editor-container');
            if (!container) return;

            // 行番号divを用意
            let lineNumbers = container.querySelector('.line-numbers');
            let textarea = container.querySelector('textarea');
            if (!lineNumbers) {
                lineNumbers = document.createElement('div');
                lineNumbers.className = 'line-numbers';
                lineNumbers.style.width = '40px';
                lineNumbers.style.background = '#f7f7f7';
                lineNumbers.style.color = '#888';
                lineNumbers.style.textAlign = 'right';
                lineNumbers.style.padding = '12px 4px 12px 0';
                lineNumbers.style.fontFamily = 'monospace';
                lineNumbers.style.fontSize = '14px';
                lineNumbers.style.userSelect = 'none';
                lineNumbers.style.height = '100%';
                lineNumbers.style.overflow = 'hidden';
                lineNumbers.style.boxSizing = 'border-box';
                lineNumbers.style.borderRadius = 'var(--border-radius) 0 0 var(--border-radius)';
                container.insertBefore(lineNumbers, textarea || null);
            }

            // containerをflexに
            container.style.display = 'flex';
            container.style.flexDirection = 'row';
            container.style.overflow = 'hidden';

            if (!textarea) {
                textarea = document.createElement('textarea');
                textarea.style.width = '100%';
                textarea.style.height = '100%';
                textarea.style.fontFamily = 'monospace';
                textarea.style.fontSize = '14px';
                textarea.style.boxSizing = 'border-box';
                textarea.style.resize = 'none';
                textarea.style.border = 'none';
                textarea.style.borderRadius = '0 var(--border-radius) var(--border-radius) 0';
                textarea.style.background = 'transparent';
                textarea.style.color = 'inherit';
                textarea.style.padding = '12px';
                textarea.style.outline = 'none';
                textarea.style.flex = '1';
                textarea.style.marginLeft = '0';
                container.appendChild(textarea);
            }
            textarea.style.flex = '1';
            textarea.style.marginLeft = '0';

            textarea.value = initialContent || '';

            // 行番号更新関数
            function updateLineNumbers() {
                const lines = textarea.value.split('\n').length;
                lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => (i+1)).join('<br>');
            }
            textarea.addEventListener('input', updateLineNumbers);
            textarea.addEventListener('scroll', () => {
                lineNumbers.scrollTop = textarea.scrollTop;
            });
            updateLineNumbers();

            textarea.oninput = () => {
                const el = this.getSelectedElement();
                if (el) {
                    el.style.customCss = textarea.value;
                    this.applyCustomCss();
                    this.saveState();
                }
            };
        },

        applyCustomCss() {
            const globalCss = this.state.presentation.settings.globalCss || '';
            document.getElementById('global-custom-styles').textContent = globalCss;

            const slide = this.getActiveSlide();
            if (!slide) return;
            
            let elementCss = '';
            slide.elements.forEach(el => {
                if (el.style.customCss) {
                    // Add !important to each rule to ensure it overrides inline styles
                    const importantCss = el.style.customCss.split(';')
                        .map(s => s.trim())
                        .filter(s => s)
                        .map(s => s + ' !important')
                        .join('; ');
                    elementCss += `[data-id="${el.id}"] { ${importantCss} }\n`;
                }
            });
            document.getElementById('elements-custom-styles').textContent = elementCss;
        },

        // 設定機能の初期化
        initializeSettings() {
            // ダークモード設定の読み込み
            const savedTheme = localStorage.getItem('webSlideMakerTheme') || 'light';
            this.applyTheme(savedTheme);

            // 設定パネルのイベントリスナー
            this.initSettingsEventListeners();
        },

        initSettingsEventListeners() {
            // ダークモードトグル
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                const savedTheme = localStorage.getItem('webSlideMakerTheme') || 'light';
                themeToggle.checked = savedTheme === 'dark';
                
                themeToggle.addEventListener('change', () => {
                    const theme = themeToggle.checked ? 'dark' : 'light';
                    this.applyTheme(theme);
                    localStorage.setItem('webSlideMakerTheme', theme);
                });
            }

            // フォントサイズ設定
            const fontSizeSetting = document.getElementById('font-size-setting');
            if (fontSizeSetting) {
                const savedFontSize = localStorage.getItem('webSlideMakerFontSize') || 'normal';
                fontSizeSetting.value = savedFontSize;
                this.applyFontSize(savedFontSize);
                
                fontSizeSetting.addEventListener('change', () => {
                    this.applyFontSize(fontSizeSetting.value);
                    localStorage.setItem('webSlideMakerFontSize', fontSizeSetting.value);
                });
            }

            // 自動保存設定
            const autoSaveToggle = document.getElementById('auto-save-toggle');
            if (autoSaveToggle) {
                const autoSave = localStorage.getItem('webSlideMakerAutoSave') !== 'false';
                autoSaveToggle.checked = autoSave;
                
                autoSaveToggle.addEventListener('change', () => {
                    localStorage.setItem('webSlideMakerAutoSave', autoSaveToggle.checked);
                });
            }

            // スナップ機能設定
            const snapToggle = document.getElementById('snap-toggle');
            if (snapToggle) {
                const snapEnabled = localStorage.getItem('webSlideMakerSnap') !== 'false';
                snapToggle.checked = snapEnabled;
                
                snapToggle.addEventListener('change', () => {
                    localStorage.setItem('webSlideMakerSnap', snapToggle.checked);
                });
            }

            // グリッド表示設定
            const gridToggle = document.getElementById('grid-toggle');
            if (gridToggle) {
                const gridEnabled = localStorage.getItem('webSlideMakerGrid') === 'true';
                gridToggle.checked = gridEnabled;
                this.applyGridSetting(gridEnabled);
                
                gridToggle.addEventListener('change', () => {
                    this.applyGridSetting(gridToggle.checked);
                    localStorage.setItem('webSlideMakerGrid', gridToggle.checked);
                });
            }

            // データエクスポートボタン
            const exportDataBtn = document.getElementById('export-data-btn');
            if (exportDataBtn) {
                exportDataBtn.addEventListener('click', () => this.exportData());
            }

            // データインポートボタン
            const importDataBtn = document.getElementById('import-data-btn');
            const importDataInput = document.getElementById('import-data-input');
            if (importDataBtn && importDataInput) {
                importDataBtn.addEventListener('click', () => importDataInput.click());
                importDataInput.addEventListener('change', (e) => this.importData(e));
            }

            // データ削除ボタン
            const clearDataBtn = document.getElementById('clear-data-btn');
            if (clearDataBtn) {
                clearDataBtn.addEventListener('click', () => this.clearAllData());
            }
        },

        applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
        },

        applyFontSize(size) {
            const root = document.documentElement;
            switch (size) {
                case 'small':
                    root.style.fontSize = '13px';
                    break;
                case 'large':
                    root.style.fontSize = '16px';
                    break;
                default:
                    root.style.fontSize = '14px';
            }
        },

        applyGridSetting(enabled) {
            const canvas = this.elements.slideCanvas;
            if (enabled) {
                canvas.classList.add('show-grid');
            } else {
                canvas.classList.remove('show-grid');
            }
        },

        exportData() {
            const data = {
                presentation: this.state.presentation,
                settings: {
                    theme: localStorage.getItem('webSlideMakerTheme') || 'light',
                    fontSize: localStorage.getItem('webSlideMakerFontSize') || 'normal',
                    autoSave: localStorage.getItem('webSlideMakerAutoSave') !== 'false',
                    snap: localStorage.getItem('webSlideMakerSnap') !== 'false',
                    grid: localStorage.getItem('webSlideMakerGrid') === 'true'
                },
                exportDate: new Date().toISOString()
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `webslidemaker-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        importData(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.presentation) {
                        if (confirm('データをインポートしますか？現在のデータは上書きされます。')) {
                            this.state.presentation = data.presentation;
                            this.state.activeSlideId = data.presentation.slides[0]?.id || null;
                            this.state.selectedElementIds = [];
                            
                            // 設定の復元
                            if (data.settings) {
                                if (data.settings.theme) {
                                    localStorage.setItem('webSlideMakerTheme', data.settings.theme);
                                    this.applyTheme(data.settings.theme);
                                }
                                if (data.settings.fontSize) {
                                    localStorage.setItem('webSlideMakerFontSize', data.settings.fontSize);
                                    this.applyFontSize(data.settings.fontSize);
                                }
                                localStorage.setItem('webSlideMakerAutoSave', data.settings.autoSave);
                                localStorage.setItem('webSlideMakerSnap', data.settings.snap);
                                localStorage.setItem('webSlideMakerGrid', data.settings.grid);
                            }
                            
                            this.saveState();
                            this.render();
                            
                            // 設定パネルの更新
                            this.initSettingsEventListeners();
                            
                            alert('データのインポートが完了しました。');
                        }
                    } else {
                        alert('無効なファイル形式です。');
                    }
                } catch (error) {
                    alert('ファイルの読み込みに失敗しました。');
                    console.error('Import error:', error);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        },

        clearAllData() {
            if (confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
                if (confirm('本当に削除しますか？')) {
                    localStorage.removeItem('webSlideMakerData');
                    localStorage.removeItem('webSlideMakerTheme');
                    localStorage.removeItem('webSlideMakerFontSize');
                    localStorage.removeItem('webSlideMakerAutoSave');
                    localStorage.removeItem('webSlideMakerSnap');
                    localStorage.removeItem('webSlideMakerGrid');
                    
                    // デフォルト設定に戻す
                    this.createNewPresentation();
                    this.applyTheme('light');
                    this.applyFontSize('normal');
                    this.applyGridSetting(false);
                    
                    this.render();
                    
                    // 設定パネルの更新
                    this.initSettingsEventListeners();
                    
                    alert('すべてのデータが削除されました。');
                }
            }
        },

        // スナップ機能の有効/無効チェック
        isSnapEnabled() {
            return localStorage.getItem('webSlideMakerSnap') !== 'false';
        },

        groupSelectedElements() {
            const { selectedElementIds, activeSlideId } = this.state;
            if (selectedElementIds.length < 2) return;

            this.stateManager._saveToHistory();

            const newGroupId = this.generateId('group');
            const slideGroups = this.state.presentation.groups[activeSlideId] || [];
            
            slideGroups.push({
                id: newGroupId,
                elementIds: [...selectedElementIds]
            });

            this.state.presentation.groups[activeSlideId] = slideGroups;
            this.state.selectedElementIds = [];
            this.state.selectedGroupIds = [newGroupId];
            
            this.render();
            this.saveState();
        },

        ungroupSelectedElements() {
            const { selectedGroupIds, activeSlideId } = this.state;
            if (selectedGroupIds.length === 0) return;

            this.stateManager._saveToHistory();

            const slideGroups = this.state.presentation.groups[activeSlideId] || [];
            const newSelectedElementIds = [];

            selectedGroupIds.forEach(groupId => {
                const groupIndex = slideGroups.findIndex(g => g.id === groupId);
                if (groupIndex > -1) {
                    newSelectedElementIds.push(...slideGroups[groupIndex].elementIds);
                    slideGroups.splice(groupIndex, 1);
                }
            });

            this.state.presentation.groups[activeSlideId] = slideGroups;
            this.state.selectedGroupIds = [];
            this.state.selectedElementIds = newSelectedElementIds;

            this.render();
            this.saveState();
        }
        };

        // 画像編集モーダルを開く関数
        App.openImageEditor = function(imageDataURL, callback) {
            if (typeof window.initEditorWithImageData === "function") {
                window.initEditorWithImageData(imageDataURL, callback);
            } else {
                alert("画像編集ツールが正しく読み込まれていません。");
            }
        };

    // 画像編集スクリプトの初期化関数をグローバルに公開
    // imgedit.htmlのスクリプトはtype="module"なので、直接アクセスできないため
    // この方法でBridge関数を用意する。
    window.initEditorWithImageData = (imageDataURL, callback = null) => { // callbackを引数に追加
        const imageToEdit = document.getElementById('imgedit-image-to-edit');
        const dropZoneContainer = document.getElementById('imgedit-drop-zone-container');
        const imageWorkspace = document.getElementById('imgedit-image-workspace');
        const editorControls = document.getElementById('imgedit-editor-controls');
        
        // 元の画像をセット
        imageToEdit.src = imageDataURL;
        imageToEdit.onload = () => {
            if (window.imgeditApp && window.imgeditApp.initEditor) {
                window.imgeditApp.initEditor(imageDataURL);
            } else {
                dropZoneContainer.classList.add('hidden');
                imageWorkspace.classList.remove('hidden');
                editorControls.classList.remove('hidden');
            }
        };

        window._imageEditorCallback = callback; // コールバックを保存
    };

    // imgedit.htmlのスクリプトからダウンロードボタンのイベントを乗っ取る
    // この関数はimgedit.htmlのdownloadImage関数が呼び出される直前に実行される想定
    window.overrideImageDownload = (finalImageDataURL) => {
        if (window._imageEditorCallback) {
            window._imageEditorCallback(finalImageDataURL);
            window._imageEditorCallback = null; // コールバックをクリア
        }
        MicroModal.close('imgedit-modal'); // モーダルを閉じる
    };

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOMContentLoaded 内で実行する初期化処理 ---

    // 1. QRコードとグラフモーダルの初期化
    // QRコード生成モーダル追加
    if (!document.getElementById('qr-modal')) {
        const qrModal = document.createElement('div');
        qrModal.className = 'modal micromodal-slide';
        qrModal.id = 'qr-modal';
        qrModal.setAttribute('aria-hidden', 'true');
        qrModal.innerHTML = `
        <div class="modal__overlay" tabindex="-1" data-micromodal-close>
            <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <button class="modal__close" aria-label="Close modal" data-micromodal-close style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 24px; color: #6c757d; cursor: pointer; z-index: 1001;">&times;</button>
                <main class="modal__content" id="qr-modal-content" style="padding: 24px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
                        <!-- 左側：設定パネル -->
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 20px;">
                            <form id="qr-create-form">
                                <!-- 基本設定 -->
                                <div style="margin-bottom: 20px;">
                                    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #495057;">基本設定</h3>
                                    <div style="display: grid; gap: 12px;">
                                        <div>
                                            <label style="display: block; margin-bottom: 4px; font-size: 13px; color: #6c757d; font-weight: 500;">QRコード内容</label>
                                            <input type="text" id="qr-text" value="" required placeholder="URLやテキストを入力" style="width: 100%; padding: 10px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px;">
                                        </div>
                                        <div>
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">サイズ: <span id="qr-size-value">256</span>px</label>
                                            <input type="range" id="qr-size" value="256" min="128" max="512" step="16" style="width: 100%; height: 6px; border-radius: 3px; background: #ddd; outline: none;">
                                        </div>
                                    </div>
                                </div>

                                <!-- カラー設定 -->
                                <div style="margin-bottom: 20px;">
                                    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #495057;">カラー</h3>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                        <div style="text-align: center;">
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">QRコード色</label>
                                            <div style="position: relative; display: inline-block;">
                                                <input type="color" id="qr-color" value="#000000" style="width: 60px; height: 60px; border: 3px solid #fff; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                            </div>
                                        </div>
                                        <div style="text-align: center;">
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">背景色</label>
                                            <div style="position: relative; display: inline-block;">
                                                <input type="color" id="qr-bg-color" value="#ffffff" style="width: 60px; height: 60px; border: 3px solid #fff; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- スタイル設定 -->
                                <div style="margin-bottom: 20px;">
                                    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #495057;">スタイル</h3>
                                    <div style="display: grid; gap: 16px;">
                                        <div>
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">ドット形状</label>
                                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                                <button type="button" class="qr-style-btn" data-style="square" title="四角" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg></button>
                                                <button type="button" class="qr-style-btn" data-style="dots" title="丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="currentColor"/></svg></button>
                                                <button type="button" class="qr-style-btn" data-style="rounded" title="角丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="currentColor"/></svg></button>
                                                <button type="button" class="qr-style-btn" data-style="classy" title="クラッシー" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 12C0 5.373 5.373 0 12 0h12v12C24 18.627 18.627 24 12 24S0 18.627 0 12z" fill="currentColor"/></svg></button>
                                                <button type="button" class="qr-style-btn" data-style="classy-rounded" title="クラッシー丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 12C0 5.373 5.373 0 12 0h12v12C24 18.627 18.627 24 12 24S0 18.627 0 12z" clip-rule="evenodd" fill-rule="evenodd" fill="currentColor"/></svg></button>
                                                <button type="button" class="qr-style-btn" data-style="extra-rounded" title="超丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="currentColor"/></svg></button>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">枠線形状</label>
                                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                                <button type="button" class="qr-corner-btn" data-corner="square" title="四角" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" stroke="currentColor" stroke-width="4" fill="transparent"/></svg></button>
                                                <button type="button" class="qr-corner-btn" data-corner="dot" title="丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="4" fill="transparent"/></svg></button>
                                                <button type="button" class="qr-corner-btn" data-corner="extra-rounded" title="超丸" style="padding: 8px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; display: flex; justify-content: center; align-items: center;"><svg width="24" height="24" viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" rx="6" stroke="currentColor" stroke-width="4" fill="transparent"/></svg></button>
                                            </div>
                                        </div>

                                        <div>
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">ロゴ画像（任意）</label>
                                            <input type="file" id="qr-logo-upload" accept="image/*" style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px;">
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" style="width: 100%; padding: 12px; background: var(--primary-color); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s;">
                                    <i class="fas fa-plus" style="margin-right: 8px;"></i>スライドに追加
                                </button>
                            </form>
                        </div>

                        <!-- 右側：プレビュー -->
                        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                            <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #495057; text-align: center;">プレビュー</h3>
                            <div style="display: flex; justify-content: center; align-items: center; min-height: 300px;">
                                <div id="qr-preview" style="display: inline-block; padding: 20px; background: #fafbfc; border: 2px dashed #dee2e6; border-radius: 12px; min-width: 200px; min-height: 200px; text-align: center; color: #6c757d;">
                                    QRコード内容を入力してください
                                </div>
                            </div>
                            <div id="qr-warning" style="display: none; color: #dc3545; font-size: 13px; margin-top: 12px; padding: 8px; background: #f8d7da; border-radius: 6px; text-align: center;"></div>
                        </div>
                    </div>
                </main>
            </div>
        </div>`;
        document.body.appendChild(qrModal);
    }
    // qr-code-styling用QRコードプレビュー・生成
    let qrStylingInstance = null;
    const qrTextInput = document.getElementById('qr-text');
    const qrSizeInput = document.getElementById('qr-size');
    const qrColorInput = document.getElementById('qr-color');
    const qrBgColorInput = document.getElementById('qr-bg-color');
    const qrLogoUpload = document.getElementById('qr-logo-upload');
    let qrLogoDataUrl = null;

    // QRコードスタイル変数
    let selectedDotStyle = 'square';
    let selectedCornerStyle = 'square';

    function updateQRPreview() {
        const text = qrTextInput.value;
        const size = parseInt(qrSizeInput.value) || 256;
        const color = qrColorInput.value;
        const bgColor = qrBgColorInput.value;
        const preview = document.getElementById('qr-preview');
        const warning = document.getElementById('qr-warning');
        
        preview.innerHTML = '';

        if (!text) {
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.innerHTML = '<span style="color: #6c757d;">QRコード内容を入力してください</span>';
            return;
        }

        const typoPattern = /(?:^|[^a-zA-Z])(h{1,2}t{1,2}p[s]?:\/\/|ttp[s]?:\/\/|https?:;\/\/|https?:\/\/\/|https?:\/\/$|https?:\/\/:|https?:\/\/\s|https?:\/\/\W|https?:\/{1,2}[^a-zA-Z0-9])/i;
        const correctPattern = /^https?:\/\/[a-zA-Z0-9]/;

        if (typoPattern.test(text) && !correctPattern.test(text.trim())) {
            warning.style.display = 'block';
            warning.textContent = 'URLにタイプミスがあります（例: hhtps://, https;//, https:/, http;//, ttp://, https::// など）。正しいURLか確認してください。';
        } else {
            warning.style.display = 'none';
            warning.textContent = '';
        }

        preview.style.display = 'block';
        qrStylingInstance = new window.QRCodeStyling({
            width: size,
            height: size,
            data: text,
            image: qrLogoDataUrl,
            dotsOptions: { color: color, type: selectedDotStyle },
            backgroundOptions: { color: bgColor },
            cornersSquareOptions: { type: selectedCornerStyle, color: color },
            cornersDotOptions: { type: selectedCornerStyle, color: color }
        });
        qrStylingInstance.append(preview);
    }

    if (qrLogoUpload) {
        qrLogoUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) {
                qrLogoDataUrl = null;
                updateQRPreview();
                return;
            }
            const reader = new FileReader();
            reader.onload = function(ev) {
                qrLogoDataUrl = ev.target.result;
                updateQRPreview();
            };
            reader.readAsDataURL(file);
        });
    }

    const qrSizeValueSpan = document.getElementById('qr-size-value');
    if (qrSizeInput && qrSizeValueSpan) {
        qrSizeInput.addEventListener('input', function() {
            qrSizeValueSpan.textContent = this.value;
            updateQRPreview();
        });
    }

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('qr-style-btn')) {
            document.querySelectorAll('.qr-style-btn').forEach(btn => {
                btn.style.borderColor = '#dee2e6';
                btn.style.backgroundColor = 'white';
                btn.style.color = '#495057';
            });
            e.target.style.borderColor = 'var(--primary-color)';
            e.target.style.backgroundColor = 'var(--primary-color)';
            e.target.style.color = 'white';
            selectedDotStyle = e.target.dataset.style;
            updateQRPreview();
        }
        if (e.target.classList.contains('qr-corner-btn')) {
            document.querySelectorAll('.qr-corner-btn').forEach(btn => {
                btn.style.borderColor = '#dee2e6';
                btn.style.backgroundColor = 'white';
                btn.style.color = '#495057';
            });
            e.target.style.borderColor = 'var(--primary-color)';
            e.target.style.backgroundColor = 'var(--primary-color)';
            e.target.style.color = 'white';
            selectedCornerStyle = e.target.dataset.corner;
            updateQRPreview();
        }
    });

    [qrTextInput, qrColorInput, qrBgColorInput].forEach(input => {
        if (input) input.addEventListener('input', updateQRPreview);
    });

    const qrForm = document.getElementById('qr-create-form');
    if (qrForm) {
        qrForm.onsubmit = async function(ev) {
            ev.preventDefault();
            if (!qrStylingInstance) return;
            
            const blob = await qrStylingInstance.getRawData("png");
            if (blob) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const imgUrl = e.target.result;
                    if (window.App && App.addElement) App.addElement('image', imgUrl);
                    if (typeof MicroModal !== "undefined") MicroModal.close('qr-modal');
                };
                reader.readAsDataURL(blob);
            }
        };
    }

    let chartInstance = null;

    function generateChartColors(count, existingColors = []) {
        const defaultColors = ['#007bff', '#28a745', '#dc3545', '#ffc107', '#6f42c1', '#e83e8c', '#20c997', '#fd7e14', '#6c757d', '#0dcaf0'];
        let colors = existingColors.filter(Boolean);
        if (colors.length < count) {
            colors = colors.concat(defaultColors.slice(0, count - colors.length));
        }
        return colors;
    }

    function updateChartPreview() {
        // スプレッドシートUIからデータを取得
        const tableBody = document.getElementById('chart-data-tbody');
        const rows = tableBody.querySelectorAll('tr');
        const labels = Array.from(rows).map(row => row.querySelector('input[data-type="label"]').value);
        const dataValues = Array.from(rows).map(row => parseFloat(row.querySelector('input[data-type="value"]').value) || 0);

        const selectedBtn = document.querySelector('.chart-type-btn.selected');
        let chartType = selectedBtn ? selectedBtn.dataset.type : (document.getElementById('chart-type')?.value || 'bar');
        const datasetLabel = document.getElementById('chart-dataset-label').value;
        const customColors = (document.getElementById('chart-colors').value || '').split(',').map(s => s.trim());
        const lineWidth = Number(document.getElementById('chart-line-width')?.value) || 2;
        const showLegend = document.getElementById('chart-show-legend')?.checked ?? true;
        const chartTitle = document.getElementById('chart-title')?.value || datasetLabel;
        const showGrid = document.getElementById('chart-show-grid')?.checked ?? true;
        const colors = generateChartColors(dataValues.length, customColors);

        const chartConfig = {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: datasetLabel,
                    data: dataValues,
                    backgroundColor: ['pie', 'doughnut'].includes(chartType) ? colors : colors[0],
                    borderColor: ['pie', 'doughnut'].includes(chartType) ? colors : colors[0],
                    borderWidth: ['line', 'radar'].includes(chartType) ? lineWidth : 1,
                    pointBackgroundColor: chartType === 'radar' ? colors : undefined
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', display: showLegend },
                    title: { display: !!chartTitle, text: chartTitle }
                },
                scales: ['pie', 'doughnut'].includes(chartType) ? {} : {
                    y: { beginAtZero: true, display: true, grid: { display: showGrid } },
                    x: { display: true, grid: { display: showGrid } }
                }
            }
        };

        const ctx = document.getElementById('chart-preview').getContext('2d');
        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, chartConfig);
    }

    const chartInputs = ['chart-type', 'chart-dataset-label', 'chart-colors', 'chart-line-width', 'chart-show-legend', 'chart-title', 'chart-show-grid'];
    chartInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            const eventType = input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventType, updateChartPreview);
        }
    });

    const chartTypeBtns = document.querySelectorAll('.chart-type-btn');
    if (chartTypeBtns.length > 0 && !document.querySelector('.chart-type-btn.selected')) {
        chartTypeBtns[0].classList.add('selected');
    }
    // グラフ種類ボタンのクリックイベントを追加
    chartTypeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            chartTypeBtns.forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            updateChartPreview();
        });
    });

    const chartForm = document.getElementById('chart-create-form');
    if (chartForm) {
        chartForm.onsubmit = function(ev) {
            ev.preventDefault();
            if (!chartInstance) return;
            const slide = window.App?.getActiveSlide();
            if (!slide) return;
            const newEl = {
                id: App.generateId('el'), type: 'chart', content: Utils.deepClone(chartInstance.config),
                style: { top: 20, left: 20, width: 50, height: 30, zIndex: slide.elements.length + 1, rotation: 0, animation: '' }
            };
            slide.elements.push(newEl);
            App.state.selectedElementIds = [newEl.id];
            App.saveState();
            App.render();
            MicroModal.close('chart-modal');
        };
    }

    // 2. サイドバーリサイズハンドラの初期化
    const sidebar = document.getElementById('left-sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    const iconTabWidth = 60;

    if (handle) {
        handle.addEventListener('mousedown', function(e) {
            if (sidebar.querySelector('#sidebar-content').style.display === 'none') return;
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });
    }
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        let newWidth = startWidth + (e.clientX - startX);
        newWidth = Math.max(iconTabWidth + 180, Math.min(newWidth, 600));
        sidebar.style.width = newWidth + 'px';
    });
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
        }
    });

    // 3. カスタムCSS適用用のstyleタグをheadに準備
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'global-custom-styles' }));
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'elements-custom-styles' }));

    // 4. MicroModalの初期化
    if (typeof MicroModal !== "undefined") {
        MicroModal.init({
            awaitCloseAnimation: true,
            disableScroll: true,
            onShow: modal => {
                if (modal.id === 'chart-modal') {
                    initChartSpreadsheet();
                    if (!document.querySelector('.chart-type-btn.selected') && chartTypeBtns.length > 0) {
                        chartTypeBtns[0].classList.add('selected');
                    }
                    updateChartPreview();
                }
            }
        });
    }

    // 新しいグラフUIのロジック
    const chartTbody = document.getElementById('chart-data-tbody');
    const addChartRowBtn = document.getElementById('add-chart-row-btn');
    const pasteCsvBtn = document.getElementById('paste-csv-btn');
    const csvPasteArea = document.getElementById('csv-paste-area');

    function createChartRow(label = '', value = '') {
        const tr = document.createElement('tr');
        const labelCell = document.createElement('td');
        labelCell.style.padding = '4px';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.dataset.type = 'label';
        labelInput.value = label.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Escape HTML
        labelInput.style.cssText = 'width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;';
        labelCell.appendChild(labelInput);

        const valueCell = document.createElement('td');
        valueCell.style.padding = '4px';
        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.dataset.type = 'value';
        valueInput.value = value.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Escape HTML
        valueInput.style.cssText = 'width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;';
        valueCell.appendChild(valueInput);

        const deleteCell = document.createElement('td');
        deleteCell.style.textAlign = 'center';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-chart-row-btn';
        deleteButton.style.cssText = 'background:none; border:none; color: #dc3545; cursor:pointer; font-size: 16px;';
        deleteButton.textContent = '×';
        deleteCell.appendChild(deleteButton);

        tr.appendChild(labelCell);
        tr.appendChild(valueCell);
        tr.appendChild(deleteCell);

        labelInput.addEventListener('input', updateChartPreview);
        deleteButton.addEventListener('click', () => {
            tr.remove();
            updateChartPreview();
        });
        return tr;
    }

    function initChartSpreadsheet() {
        chartTbody.innerHTML = '';
        // デフォルトで3行追加
        chartTbody.appendChild(createChartRow('A', 10));
        chartTbody.appendChild(createChartRow('B', 20));
        chartTbody.appendChild(createChartRow('C', 30));
    }

    addChartRowBtn.addEventListener('click', () => {
        chartTbody.appendChild(createChartRow());
    });

    pasteCsvBtn.addEventListener('click', () => {
        csvPasteArea.style.display = csvPasteArea.style.display === 'none' ? 'block' : 'none';
        if(csvPasteArea.style.display === 'block') {
            csvPasteArea.focus();
        }
    });

    csvPasteArea.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const rows = text.split('\n').filter(row => row.trim() !== '');
        
        chartTbody.innerHTML = ''; // 既存のデータをクリア
        rows.forEach(row => {
            const cols = row.split(/[\t,]/); // タブまたはカンマで分割
            const label = cols[0] || '';
            const value = cols[1] || '';
            chartTbody.appendChild(createChartRow(label, value));
        });
        updateChartPreview();
        csvPasteArea.style.display = 'none';
        csvPasteArea.value = '';
    });


    // 5. Appの初期化
    await App.loadIconData();
    App.init();
    window.aiHandler = App.aiHandler = new AIHandler(App);

    // 6. 図形選択モーダルのイベントリスナー
    const shapeModal = document.getElementById('shape-modal');
    if (shapeModal) {
        shapeModal.addEventListener('click', (e) => {
            const shapeBtn = e.target.closest('.shape-select-btn');
            if (shapeBtn && shapeBtn.dataset.shape) {
                App.addElement('shape', { shapeType: shapeBtn.dataset.shape });
                MicroModal.close('shape-modal');
            }
        });
    }

    // 7. App初期化後のイベントリスナー設定
    const bottomPane = document.getElementById('bottom-pane');
    if (bottomPane) {
        bottomPane.addEventListener('wheel', function(e) {
            if (Math.abs(e.deltaY) > 30) {
                e.preventDefault();
            }
        }, { passive: false });
    }
});