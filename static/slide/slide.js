        // =================================================================
        // Configuration Constants
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
                max: 5.0,
                default: 1.0
            },
            ANIMATION_DURATION: 300,
            DEBOUNCE_DELAY: 300
        };

        // =================================================================
        // Error Handling
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
        // Validation Utilities
        // =================================================================
        class Validator {
            static validateElementType(type) {
                const validTypes = ['text', 'image', 'video', 'chart', 'table', 'icon', 'iframe'];
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
        // State Management
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
                    presentation: null,
                    activeSlideId: null,
                    selectedElementIds: [],
                    isEditingText: false,
                    
                    interaction: {
                        isDragging: false,
                        isResizing: false,
                        isCtrlPressed: false,
                        handle: null,
                        startX: 0,
                        startY: 0,
                        initialStates: []
                    },
                    
                    canvas: {
                        rect: null,
                        scale: CONFIG.CANVAS_SCALE.default,
                        pan: { x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 }
                    },

                    ui: {
                        sidebarWidth: 340,
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
                const previousState = this._undoStack.pop();
                
                this._skipHistory = true;
                this.state = previousState;
                this._notifyListeners('*', this.state); // 全体の変更を通知
                this._skipHistory = false;
                
                return true;
            }

            redo() {
                if (this._redoStack.length === 0) return false;
                
                this._undoStack.push(Utils.deepClone(this.state));
                const nextState = this._redoStack.pop();
                
                this._skipHistory = true;
                this.state = nextState;
                this._notifyListeners('*', this.state); // 全体の変更を通知
                this._skipHistory = false;
                
                return true;
            }

            // 履歴をクリア
            clearHistory() {
                this._undoStack = [];
                this._redoStack = [];
            }

            // 状態のリセット
            reset() {
                this.state = this._createInitialState();
                this.clearHistory();
                this._notifyListeners('*', this.state);
            }
        }

        // =================================================================
        // ユーティリティ関数群
        // =================================================================
        const Utils = {
            generateId: (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            
            debounce: (func, wait = CONFIG.DEBOUNCE_DELAY) => {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
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
                try {
                    if (obj === null || typeof obj !== 'object') return obj;
                    if (obj instanceof Date) return new Date(obj);
                    if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
                    if (typeof obj === 'object') {
                        const clonedObj = {};
                        for (const key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                clonedObj[key] = Utils.deepClone(obj[key]);
                            }
                        }
                        return clonedObj;
                    }
                    return obj;
                } catch (error) {
                    ErrorHandler.handle(error, 'deep_clone');
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

            // =================================================================
            // Legacy Support (backward compatibility)
            // =================================================================
            
            static createText(elData) { return this._createText(elData); }
            static createImage(elData) { return this._createImage(elData); }
            static createVideo(elData) { return this._createVideo(elData); }
            static createChart(elData) { return this._createChart(elData); }
            static createTable(elData) { return this._createTable(elData); }
            static createIcon(elData) { return this._createIcon(elData); }
            static createIframe(elData) { return this._createIframe(elData); }
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
                    fontFamily: styles.fontFamily || ''
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
        const App = {
            // 新しい状態管理システム
            stateManager: null,
            
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
            cmInstances: {}, // CodeMirrorインスタンスを保持
            guideLineManager: null,

            init() {
                try {
                    // 状態管理システムの初期化
                    this.stateManager = new StateManager();
                    this._initializeStateListeners();
                    
                    this.cacheElements();
                    this.guideLineManager = new GuideLineManager(this.elements.slideCanvas);
                    
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
                        this.render();
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
                    imageUploadInput: document.getElementById('image-upload-input'),
                    
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

                    // StateManagerの履歴機能を使用しない場合の従来の履歴管理
                    if (!this._skipHistory) {
                        // 従来のundoStack管理をStateManagerに移行
                        this.stateManager._saveToHistory();
                    }
                    
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
                        settings: { width: 1280, height: 720, globalCss: '' },
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

                // Destroy CodeMirror instance if it exists
                if (this.cmInstances.elementCssEditor) {
                    this.cmInstances.elementCssEditor.destroy();
                    this.cmInstances.elementCssEditor = null;
                }

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
                const selectedCount = this.state.selectedElementIds.length;
                const alignButtons = [this.elements.alignLeftBtn, this.elements.alignCenterHBtn, this.elements.alignRightBtn, this.elements.alignTopBtn, this.elements.alignCenterVBtn, this.elements.alignBottomBtn];
                alignButtons.forEach(btn => btn.disabled = selectedCount < 2);
                const distributeButtons = [this.elements.distributeHBtn, this.elements.distributeVBtn];
                distributeButtons.forEach(btn => btn.disabled = selectedCount < 3);
            },

            renderThumbnails() {
                const { slides, settings } = this.state.presentation;
                this.elements.slideList.innerHTML = '';
                slides.forEach((slide, index) => {
                    const li = document.createElement('li');
                    li.className = `slide-thumbnail ${slide.id === this.state.activeSlideId ? 'active' : ''}`;
                    li.dataset.id = slide.id;
                    li.draggable = true;
                    li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', slide.id); li.classList.add('dragging'); });
                    li.addEventListener('dragend', () => li.classList.remove('dragging'));
                    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
                    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
                    li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('drag-over'); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== slide.id) this.moveSlide(fromId, slide.id); });
                    li.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showSlideContextMenu(e, slide.id); });

                    const wrapper = document.createElement('div'); wrapper.className = 'slide-thumbnail-wrapper';
                    const content = document.createElement('div'); content.className = 'slide-thumbnail-content'; content.style.width = `${settings.width}px`; content.style.height = `${settings.height}px`;
                    slide.elements.forEach(elData => {
                        const el = this.createElementDOM(elData);
                        if (elData.style.animation) {
                            // アニメーションをリセットして再生
                            el.classList.remove('animate__animated', elData.style.animation);
                            // 強制再描画
                            void el.offsetWidth;
                            el.classList.add('animate__animated', elData.style.animation);
                            // アニメーション終了時にクラスを外す
                            el.addEventListener('animationend', function handler() {
                                el.classList.remove('animate__animated', elData.style.animation);
                                el.removeEventListener('animationend', handler);
                            });
                        }
                        content.appendChild(el);
                    });

                    const indexSpan = document.createElement('span'); indexSpan.className = 'thumbnail-index'; indexSpan.textContent = index + 1;
                    wrapper.appendChild(content);
                    li.appendChild(indexSpan);
                    li.appendChild(wrapper);
                    this.elements.slideList.appendChild(li);

                    requestAnimationFrame(() => { if (wrapper.offsetWidth > 0) content.style.transform = `scale(${wrapper.offsetWidth / settings.width})`; });
                });

                // --- 追加ボタンを最後に追加 ---
                const addLi = document.createElement('li');
                addLi.className = 'slide-thumbnail add-slide';
                addLi.title = 'スライドを追加';
                addLi.style.cursor = 'pointer';

                const addWrapper = document.createElement('div');
                addWrapper.className = 'slide-thumbnail-wrapper';

                const addContent = document.createElement('div');
                addContent.className = 'slide-thumbnail-content add-slide-content';
                addContent.style.width = `${settings.width}px`;
                addContent.style.height = `${settings.height}px`;
                addContent.style.display = 'flex';
                addContent.style.alignItems = 'center';
                addContent.style.justifyContent = 'center';

                // アイコン＋テキスト
                addContent.innerHTML = '<i class="fas fa-plus" style="font-size:48px;color:#aaa;"></i>';

                addWrapper.appendChild(addContent);
                addLi.appendChild(addWrapper);

                addLi.addEventListener('click', () => this.addSlide());

                this.elements.slideList.appendChild(addLi);

                requestAnimationFrame(() => {
                    if (addWrapper.offsetWidth > 0) addContent.style.transform = `scale(${addWrapper.offsetWidth / settings.width})`;
                });
            },

            renderSlideCanvas() {
                const activeSlide = this.getActiveSlide();
                const canvas = this.elements.slideCanvas;
                canvas.querySelectorAll('.slide-element, .selection-bounding-box').forEach(el => el.remove());
                
                // キャンバスのスケーリングを適切に設定
                this.updateCanvasScale();
                
                if (!activeSlide) return;

                activeSlide.elements.forEach(elData => {
                    const el = this.createElementDOM(elData);
                    el.dataset.id = elData.id;
                    if (this.state.selectedElementIds.includes(elData.id)) {
                        el.classList.add('selected');
                        if (this.state.selectedElementIds.length === 1) this.addResizeHandles(el);
                    }
                    el.setAttribute('contenteditable', this.state.isEditingText && this.state.selectedElementIds.includes(elData.id));
                    canvas.appendChild(el);
                });
                this.renderSelectionBoundingBox();
            },

            updateCanvasScale() {
                const canvas = this.elements.slideCanvas;
                const container = this.elements.mainCanvasArea;
                
                if (!canvas || !container) return;
                
                // キャンバスの実際のサイズ（1280x720）
                const canvasWidth = 1280;
                const canvasHeight = 720;
                
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
            createElementDOM(elData) {
                const el = document.createElement('div');
                el.className = `slide-element ${elData.type}`;
                
                // StyleManagerを使ってスタイルを適用
                StyleManager.applyStyles(el, elData.style);

                // ElementFactoryを使ってコンテンツを作成
                let content = null;
                switch (elData.type) {
                    case 'text':
                        content = ElementFactory.createText(elData);
                        if (content) el.innerText = content;
                        break;
                    case 'image':
                        content = ElementFactory.createImage(elData);
                        if (content) el.appendChild(content);
                        break;
                    case 'video':
                        content = ElementFactory.createVideo(elData);
                        if (content) el.appendChild(content);
                        break;
                    case 'chart':
                        content = ElementFactory.createChart(elData);
                        if (content) el.appendChild(content);
                        break;
                    case 'table':
                        content = ElementFactory.createTable(elData);
                        if (content) el.appendChild(content);
                        break;
                    case 'icon':
                        content = ElementFactory.createIcon(elData);
                        if (content) {
                            el.style.overflow = 'visible';
                            el.appendChild(content);
                        }
                        break;
                    case 'iframe':
                        content = ElementFactory.createIframe(elData);
                        if (content) {
                            // DocumentFragmentの場合は子要素を順番に追加
                            if (content instanceof DocumentFragment) {
                                el.appendChild(content);
                            } else {
                                el.appendChild(content);
                            }
                        }
                        break;
                    default:
                        // フォールバック: 従来のメソッドを使用
                        this._createDOMForElement(el, elData);
                }
                return el;
            },

            // フォールバック用の統合メソッド
            _createDOMForElement(el, elData) {
                switch (elData.type) {
                    case 'text':
                        this._createDOMForText(el, elData);
                        break;
                    case 'image':
                        this._createDOMForImage(el, elData);
                        break;
                    case 'video':
                        this._createDOMForVideo(el, elData);
                        break;
                    case 'chart':
                        this._createDOMForChart(el, elData);
                        break;
                    case 'table':
                        this._createDOMForTable(el, elData);
                        break;
                    case 'icon':
                        this._createDOMForIcon(el, elData);
                        break;
                    case 'iframe':
                        this._createDOMForIframe(el, elData);
                        break;
                }
            },

            // 各要素タイプに対応するDOM生成ヘルパーメソッド
            _createDOMForText(el, elData) {
                el.innerText = elData.content;
            },

            _createDOMForImage(el, elData) {
                let img = el.querySelector('img');
                if (!img) {
                    img = document.createElement('img');
                    el.appendChild(img);
                }
                img.src = elData.content;

                // Base64またはBlob URLの場合のみ編集ボタンを追加
                if (elData.content.startsWith('data:') || elData.content.startsWith('blob:')) {
                    let editButton = el.querySelector('.image-edit-overlay-btn');
                    if (!editButton) {
                        editButton = document.createElement('button');
                        editButton.className = 'image-edit-overlay-btn'; // CSSでスタイルを適用
                        editButton.innerHTML = '<i class="fas fa-edit"></i> 編集'; // Font Awesomeアイコン
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
                            opacity: '0', // デフォルト非表示
                            transition: 'opacity 0.3s ease'
                        });
                        editButton.querySelector('i').style.pointerEvents = 'none'; // アイコンクリックでイベントが伝播しないように
                        el.appendChild(editButton);
                    }
                    editButton.onclick = (e) => {
                        e.stopPropagation(); // 要素の選択イベントを阻止
                        MicroModal.show('imgedit-modal');
                        // 画像データを画像編集モーダルに渡し、コールバックを設定
                        App.openImageEditor(elData.content, (editedImageDataURL) => {
                            // 編集後の画像をスライドの既存要素に適用
                            const slide = App.getActiveSlide();
                            if (slide) {
                                const elementToUpdate = slide.elements.find(el => el.id === elData.id);
                                if (elementToUpdate) {
                                    elementToUpdate.content = editedImageDataURL;
                                    App.saveState();
                                    App.render();
                                }
                            }
                        });
                    };
                } else {
                    // URLがdata:またはblob:以外の場合、ボタンを削除
                    const editButton = el.querySelector('.image-edit-overlay-btn');
                    if (editButton) {
                        editButton.remove();
                    }
                }
            },

            _createDOMForVideo(el, elData) {
                let video = el.querySelector('video');
                if (!video) {
                    video = document.createElement('video');
                    video.style.width = '100%';
                    video.style.height = '100%';
                    el.appendChild(video);
                }
                if (!video.src || video.src !== elData.content.url) {
                    video.src = elData.content.url || '';
                }
                video.autoplay = !!elData.content.autoplay;
                video.loop = !!elData.content.loop;
                video.controls = elData.content.controls !== false;
                video.playsInline = true;
            },

            _createDOMForChart(el, elData) {
                const canvasEl = document.createElement('canvas');
                canvasEl.id = `chart-${elData.id}`;
                canvasEl.style.width = '100%';
                canvasEl.style.height = '100%';
                el.appendChild(canvasEl);
                setTimeout(() => {
                    if (canvasEl) {
                        new Chart(canvasEl.getContext('2d'), elData.content);
                    }
                }, 0);
            },

            _createDOMForTable(el, elData) {
                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.height = '100%';
                table.style.borderCollapse = 'collapse';
                for (let r = 0; r < elData.content.rows; r++) {
                    const tr = document.createElement('tr');
                    for (let c = 0; c < elData.content.cols; c++) {
                        const td = document.createElement('td');
                        td.textContent = elData.content.data?.[r]?.[c] ?? '';
                        td.style.border = '1px solid #888';
                        td.style.padding = '4px';
                        tr.appendChild(td);
                    }
                    table.appendChild(tr);
                }
                el.appendChild(table);
            },

            _createDOMForIcon(el, elData) {
                if (elData.iconType === 'fa') {
                    const iTag = document.createElement('i');
                    iTag.className = elData.content;
                    iTag.style.color = elData.style.color || 'inherit';
                    iTag.style.fontSize = elData.style.fontSize ? `${elData.style.fontSize}px` : 'inherit';
                    iTag.style.position = 'absolute';
                    iTag.style.left = '50%';
                    iTag.style.top = '50%';
                    iTag.style.transform = 'translate(-50%, -50%)';
                    el.style.overflow = 'visible';
                    el.appendChild(iTag);
                } else if (elData.iconType === 'mi') {
                    const spanTag = document.createElement('span');
                    spanTag.className = elData.content;
                    spanTag.textContent = elData.miContent;
                    spanTag.style.color = elData.style.color || 'inherit';
                    spanTag.style.fontSize = elData.style.fontSize ? `${elData.style.fontSize}px` : 'inherit';
                    spanTag.style.position = 'absolute';
                    spanTag.style.left = '50%';
                    spanTag.style.top = '50%';
                    spanTag.style.transform = 'translate(-50%, -50%)';
                    el.style.overflow = 'visible';
                    el.appendChild(spanTag);
                }
            },

            _createDOMForIframe(el, elData) {
                const iframe = document.createElement('iframe');
                iframe.src = elData.content.url;
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.sandbox = elData.content.sandbox || 'allow-scripts allow-same-origin';
                el.appendChild(iframe);

                const overlay = document.createElement('div');
                overlay.className = 'iframe-overlay';
                Object.assign(overlay.style, {
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 10000,
                    backgroundColor: 'transparent',
                    cursor: 'move',
                });
                overlay.addEventListener('mousedown', (e) => {
                    App.handleCanvasMouseDown(e);
                });
                overlay.addEventListener('touchstart', (e) => {
                    App.handleCanvasMouseDown(e);
                }, { passive: false });
                el.appendChild(overlay);
            },

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
                this.elements.inspector.innerHTML = inspectorHTML;
                
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
                const baseHTML = this._getBasePropertiesHTML(selectedElement);
                const typeSpecificHTML = this._getTypeSpecificHTML(selectedElement);
                const customCssHTML = this._getCustomCssHTML();
                
                return `${baseHTML}${typeSpecificHTML}${customCssHTML}`;
            },

            _getBasePropertiesHTML(selectedElement) {
                const s = selectedElement.style;
                
                return `
                    <div class="inspector-group">
                        <label>位置 & サイズ</label>
                        <div class="pos-size-grid">
                            <div>
                                <label for="inspector-left">X (%)</label>
                                <input id="inspector-left" name="inspector-left" type="number" data-prop="left" value="${isFinite(Number(s.left)) ? Number(s.left).toFixed(2) : ''}" step="0.1">
                            </div>
                            <div>
                                <label for="inspector-top">Y (%)</label>
                                <input id="inspector-top" name="inspector-top" type="number" data-prop="top" value="${isFinite(Number(s.top)) ? Number(s.top).toFixed(2) : ''}" step="0.1">
                            </div>
                            <div>
                                <label for="inspector-width">幅 (%)</label>
                                <input id="inspector-width" name="inspector-width" type="number" data-prop="width" value="${isFinite(Number(s.width)) ? Number(s.width).toFixed(2) : ''}" step="0.1">
                            </div>
                            <div>
                                <label for="inspector-height">高さ (%)</label>
                                <input id="inspector-height" name="inspector-height" type="number" data-prop="height" value="${isFinite(Number(s.height)) ? Number(s.height).toFixed(2) : ''}" step="0.1" ${!['image', 'video'].includes(selectedElement.type) ? 'disabled' : ''}>
                            </div>
                        </div>
                    </div>
                    <div class="inspector-group">
                        <label>回転 (deg)</label>
                        <input type="number" data-prop="rotation" value="${s.rotation || 0}" step="1">
                    </div>
                    <div class="inspector-group">
                        <label>重ね順</label>
                        <input type="number" data-prop="zIndex" value="${s.zIndex}">
                    </div>
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
            },

            _getTypeSpecificHTML(selectedElement) {
                const typeHandlers = {
                    'text': () => this._getTextPropertiesHTML(selectedElement),
                    'icon': () => this._getIconPropertiesHTML(selectedElement),
                    'video': () => this._getVideoPropertiesHTML(selectedElement),
                    'chart': () => this._getChartPropertiesHTML(selectedElement),
                    'table': () => this._getTablePropertiesHTML(selectedElement),
                    'iframe': () => this._getIframePropertiesHTML(selectedElement)
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
                
                return `
                    <div class="inspector-group">
                        <label>グラフデータ編集</label>
                        <div style="margin-top: 10px;">
                            <label>データセット名</label>
                            <input type="text" id="chart-dataset-label" value="${chartData.datasets[0].label}" style="width: 100%;">
                        </div>
                        <div style="margin-top: 10px;">
                            <label>ラベル (カンマ区切り)</label>
                            <input type="text" id="chart-labels" value="${chartData.labels.join(',')}" style="width: 100%;">
                        </div>
                        <div style="margin-top: 10px;">
                            <label>値 (カンマ区切り)</label>
                            <input type="text" id="chart-data" value="${chartData.datasets[0].data.join(',')}" style="width: 100%;">
                        </div>
                        <button id="update-chart-btn" style="margin-top: 10px; width: 100%; padding: 8px;">グラフを更新</button>
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
                    <button id="update-table-btn" style="margin-top:10px;width:100%;padding:8px;">表を更新</button>
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

            _getCustomCssHTML() {
                return `
                    <div class="inspector-group" style="margin-top: 30px;">
                        <button id="delete-element-btn">要素を削除</button>
                    </div>
                    <div class="inspector-group">
                        <label>カスタムCSS</label>
                        <div id="element-css-editor-container" style="border: 1px solid var(--border-color); border-radius: var(--border-radius);"></div>
                    </div>
                `;
            },

            _initializeInspectorComponents(selectedElement) {
                const customCss = selectedElement.style.customCss || '';
                this.initElementCssEditor(customCss);
                
                // 基本イベントハンドラーの設定
                this._bindBasicInspectorEvents(selectedElement);
                
                // タイプ別イベントハンドラーの設定
                this._bindTypeSpecificEvents(selectedElement);
            },

            _bindBasicInspectorEvents(selectedElement) {
                const deleteBtn = document.getElementById('delete-element-btn');
                if (deleteBtn) {
                    deleteBtn.onclick = () => this.deleteSelectedElements();
                }
            },

            _bindTypeSpecificEvents(selectedElement) {
                const eventHandlers = {
                    'chart': () => this._bindChartEvents(selectedElement),
                    'video': () => this._bindVideoEvents(selectedElement),
                    'table': () => this._bindTableEvents(selectedElement),
                    'iframe': () => this._bindIframeEvents(selectedElement),
                    'text': () => this._bindTextEvents(selectedElement),
                    'icon': () => this._bindIconEvents(selectedElement)
                };

                const handler = eventHandlers[selectedElement.type];
                if (handler) {
                    handler();
                }
            },

            _bindChartEvents(selectedElement) {
                const updateBtn = document.getElementById('update-chart-btn');
                if (updateBtn) {
                    updateBtn.onclick = () => {
                        const labels = document.getElementById('chart-labels').value.split(',').map(l => l.trim());
                        const dataValues = document.getElementById('chart-data').value.split(',').map(d => parseFloat(d.trim()) || 0);
                        const datasetLabel = document.getElementById('chart-dataset-label').value;

                        selectedElement.content.data.labels = labels;
                        selectedElement.content.data.datasets[0].label = datasetLabel;
                        selectedElement.content.data.datasets[0].data = dataValues;

                        this.saveState();
                        this.render();
                    };
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
                
                // 要素追加ボタン
                this.elements.addTextBtn.addEventListener('click', () => this.addElement('text'));
                this.elements.addChartBtn.addEventListener('click', () => this.addChart());
                this.elements.addIframeBtn.addEventListener('click', () => this.addElement('iframe'));
                
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
                this.elements.presentBtn.addEventListener('click', () => this.startPresentation());
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
                        this.stopPresentation();
                    }
                });
            },

            _handleGlobalCssSave() {
                if (!this.cmInstances.globalCssEditor) return;

                try {
                    const view = this.cmInstances.globalCssEditor;
                    const css = view.state.doc.toString();
                    
                    // Lint結果を取得
                    let diagnostics = [];
                    if (view.state.field && window.codemirror.lint && window.codemirror.lint.linter) {
                        try {
                            diagnostics = window.codemirror.langs.cssLinter(view.state);
                        } catch (e) {
                            diagnostics = [];
                        }
                    }
                    
                    const hasError = diagnostics && diagnostics.some(d => d.severity === "error");
                    if (hasError) {
                        alert('CSSに構文エラーがあります。修正してください。');
                        return;
                    }
                    
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
                    btn.style.zIndex = 10001;
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
                    disp.style.zIndex = 10001;
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
                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                let target = point.target;

                // Traverse up to find an Element if the target is not one (e.g., a text node)
                while (target && target.nodeType !== Node.ELEMENT_NODE) {
                    target = target.parentNode;
                }

                if (!target || typeof target.closest !== 'function') {
                    console.error("handleCanvasMouseDown: target is not an Element or is null.", point.target, e);
                    return;
                }

                const element = target.closest('.slide-element');
                const elementId = element ? element.dataset.id : null;
                this.state.interaction.isCtrlPressed = e.ctrlKey || e.metaKey;

                if (this.state.isEditingText) {
                    // 編集中に現在の編集要素以外をクリックした場合は編集を終了
                    const element = e.target.closest('.slide-element');
                    const elementId = element ? element.dataset.id : null;
                    if (!elementId || !this.state.selectedElementIds.includes(elementId)) {
                        this.stopTextEditing(true);
                        this.render();
                    }
                    // 編集中は他の操作を禁止
                    return;
                }

                // 複数選択時のドラッグ開始を直感的に
                if (elementId) {
                    if (this.state.selectedElementIds.includes(elementId)) {
                        // 既に選択中の要素上なら選択状態維持してドラッグ開始
                        // e.preventDefault() を削除。実際の移動が始まるMouseMove/TouchMoveで呼ぶ
                        if (target.classList.contains('resize-handle')) {
                            this.state.interaction.isResizing = true;
                            this.state.interaction.handle = target.dataset.handle;
                        } else {
                            this.state.interaction.isDragging = true;
                        }
                        this.startInteraction(e);
                        this.render();
                        return;
                    } else {
                        // 未選択要素なら選択を切り替えてからドラッグ開始
                        this.state.selectedElementIds = [elementId];
                        this.render();
                        // 次のmousedownでドラッグ開始
                        return;
                    }
                } else {
                    // キャンバス空白クリックで選択解除
                    this.state.selectedElementIds = [];
                    this.render();
                }
            },

            startInteraction(e) {
                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const canvasRect = this.elements.slideCanvas.getBoundingClientRect();
                
                // 状態管理システムでキャンバス矩形とインタラクション状態を更新
                this.batchUpdateState({
                    'canvas.rect': canvasRect,
                    'interaction.startX': point.clientX,
                    'interaction.startY': point.clientY
                });

                const initialStates = this.getSelectedElementsData().map(elData => {
                    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                    return {
                        id: elData.id, startX: elData.style.left, startY: elData.style.top,
                        startW: elData.style.width, startH: elData.style.height ?? (domEl.offsetHeight / canvasRect.height * 100),
                        initialRect: { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight }
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
                    // 固定キャンバスサイズを使用してパーセント計算
                    const dxPercent = dx / 1280 * 100;
                    const dyPercent = dy / 720 * 100;
                    this.performResize(dxPercent, dyPercent);
                }
            },

            handleDragMove(dx, dy) {
                this.guideLineManager.clear();
                const interaction = this.getState('interaction');
                const draggingElementsInitialStates = interaction.initialStates;

                // キャンバスの実際のサイズ（固定）を使用
                const canvasWidth = 1280;
                const canvasHeight = 720;

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

                // 4. Apply new positions with snapping
                const elementsToUpdate = this.getSelectedElementsData();
                draggingElementsInitialStates.forEach(initialState => {
                    const elData = elementsToUpdate.find(el => el.id === initialState.id);
                    if (elData) {
                        // 固定キャンバスサイズを使用してパーセント計算
                        const newLeft = initialState.startX + (dx + snapOffset.x) / canvasWidth * 100;
                        const newTop = initialState.startY + (dy + snapOffset.y) / canvasHeight * 100;
                        
                        elData.style.left = parseFloat(newLeft.toFixed(2));
                        elData.style.top = parseFloat(newTop.toFixed(2));
                        
                        // Update DOM directly for immediate feedback
                        const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (domEl) this.applyStyles(domEl, elData.style);
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
                
                // テキスト編集中は、ドラッグ/リサイズ状態のみリセットし、再描画しない
                if (this.state.isEditingText) {
                    this.batchUpdateState({
                        'interaction.isDragging': false,
                        'interaction.isResizing': false
                    });
                    return;
                }

                if (interaction.isDragging || interaction.isResizing) this.saveState();
                this.guideLineManager.clear();
                
                // インタラクション状態をリセット
                this.batchUpdateState({
                    'interaction.isDragging': false,
                    'interaction.isResizing': false,
                    'interaction.initialStates': []
                });
                
                // ドラッグ終了後、iframeのpointer-eventsを元に戻す
                this.state.selectedElementIds.forEach(id => {
                    const elData = this.getActiveSlide().elements.find(el => el.id === id);
                    if (elData && elData.type === 'iframe') {
                        const iframeEl = this.elements.slideCanvas.querySelector(`[data-id="${id}"] iframe`);
                        if (iframeEl) {
                            iframeEl.style.pointerEvents = 'auto'; // または 'initial'
                        }
                    }
                });

                this.render(); // Final render to clean up handles etc.
            },

            performResize(dx, dy) {
                const interaction = this.getState('interaction');
                const { handle, initialStates } = interaction;
                const elData = this.getSelectedElement();
                const initialState = initialStates[0];
                if (!elData || !initialState) return;

                let { left, top, width, height } = elData.style;
                const { startX, startY, startW, startH } = initialState;

                // リサイズ開始時のfontSizeを保存（初回のみ）
                if (initialState._initialFontSize === undefined) {
                    initialState._initialFontSize = elData.style.fontSize;
                }
                const initialFontSize = initialState._initialFontSize;

                if (handle.includes('e')) width = Math.max(2, startW + dx);
                if (handle.includes('w')) { width = Math.max(2, startW - dx); left = startX + dx; }
                if (handle.includes('s')) height = startH != null ? Math.max(2, startH + dy) : null;
                if (handle.includes('n')) { height = startH != null ? Math.max(2, startH - dy) : null; top = startY + dy; }

                elData.style.left = left; elData.style.top = top;

                // アイコンはアスペクト比を維持
                if (elData.type === 'icon' && startW > 0) {
                    const ratio = startH / startW;
                    if (width !== startW) { // 幅が変わった
                        height = width * ratio;
                    } else if (height !== startH) { // 高さが変わった
                        width = height / ratio;
                    }
                }

                elData.style.width = width;
                if (height != null) elData.style.height = height;

                // テキストまたはアイコン要素の場合、幅に合わせてフォントサイズを調整
                if ((elData.type === 'text' || elData.type === 'icon') && startW > 0 && width !== startW) {
                    const newFontSize = Math.max(8, Math.round(initialFontSize * (width / startW)));
                    elData.style.fontSize = newFontSize;
                }

                // Direct DOM update for smooth resizing
                const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                if (domEl) { this.applyStyles(domEl, elData.style); this.renderSelectionBoundingBox(); }
            },

            handleKeyDown(e) {
                const target = e.target;
                const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor');

                // If typing in an input field, do not trigger global shortcuts like 'delete element'.
                if (isInputFocused) {
                    return; // Exit early
                }

                if (e.key === 'Control' || e.key === 'Meta') this.state.interaction.isCtrlPressed = true;

                if (document.body.classList.contains('presentation-mode')) {
                    if (e.key === 'ArrowRight' || e.key === ' ') this.changePresentationSlide(1);
                    else if (e.key === 'ArrowLeft') this.changePresentationSlide(-1);
                    else if (e.key === 'Escape') this.stopPresentation();
                } else {
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
                    if (elData) elData.content = editableEl.innerText;
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
                        top: 20, left: 20, width: 30, height: null, zIndex: slide.elements.length + 1, rotation: 0, animation: '',
                        ...style
                    }
                };
                 if (type === 'text' && !style?.fontSize) newEl.style.fontSize = 24;
                 if (type === 'image' && !style?.height) newEl.style.height = 30;

                slide.elements.push(newEl);
                return newEl;
            },
            addElement(type, content) { // This is for user interaction
                const slide = this.getActiveSlide();
                if (!slide) return;
                const newEl = {
                    id: this.generateId('el'),
                    type,
                    style: { top: 20, left: 20, width: 30, height: null, zIndex: slide.elements.length + 1, rotation: 0, animation: '' }
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

            deleteSelectedElements() { if (!confirm(`${this.state.selectedElementIds.length}個の要素を削除しますか？`)) return; const slide = this.getActiveSlide(); if (!slide) return; slide.elements = slide.elements.filter(el => !this.state.selectedElementIds.includes(el.id)); this.state.selectedElementIds = []; this.render(); this.saveState(); },

            alignElements(type) {
                const elementsData = this.getSelectedElementsData(); if (elementsData.length < 2) return;
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
            getSelectedElementsBoundingBox(inPercent = false) { const els = this.getSelectedElementsData(); if (els.length === 0) return null; const pixelEls = this.getElementsWithPixelRects(els); const bounds = this.calculatePixelBounds(pixelEls); if (!inPercent) return bounds; const canvasRect = this.state.slideCanvasRect; return { left: bounds.minX / canvasRect.width * 100, top: bounds.minY / canvasRect.height * 100, width: bounds.width / canvasRect.width * 100, height: bounds.height / canvasRect.height * 100 }; },
            handleThumbnailClick(e) { const thumb = e.target.closest('.slide-thumbnail'); if (thumb) { this.state.activeSlideId = thumb.dataset.id; this.state.selectedElementIds = []; this.render(); } },
handleInspectorInput(e) {
    // Stop the event from bubbling up, just in case.
    e.stopPropagation();

    // Ignore events from CodeMirror, it has its own handler.
    if (e.target.closest('.cm-editor')) {
        return;
    }

    const el = this.getSelectedElement();
    if (!el) return;

    const prop = e.target.dataset.prop;
    if (!prop || prop === 'customCss') return;

let value;
if (e.target.type === 'checkbox') {
    value = e.target.checked;
} else if (e.target.type === 'number') {
    value = parseFloat(e.target.value);
} else {
    value = e.target.value;
}

    if (el.style.hasOwnProperty(prop)) {
        el.style[prop] = value;
        // アニメーション選択時は見本として再生
        if (prop === 'animation') {
            const domEl = this.elements.slideCanvas.querySelector(`[data-id="${el.id}"]`);
            if (domEl) {
                if (value) {
                    domEl.classList.remove('animate__animated', value);
                    void domEl.offsetWidth;
                    domEl.classList.add('animate__animated', value);
                    domEl.addEventListener('animationend', function handler() {
                        domEl.classList.remove('animate__animated', value);
                        domEl.removeEventListener('animationend', handler);
                    });
                } else {
                    domEl.classList.remove('animate__animated');
                }
            }
        }
    }

    // Update the element on the canvas for real-time feedback
    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${el.id}"]`);
    if (domEl) {
        this.applyStyles(domEl, el.style);
    }

    // Save state with debounce to avoid excessive calls during rapid input
    // We are NOT calling render(), which is the expensive operation that causes focus loss.
    if (this._saveStateTimeout) {
        clearTimeout(this._saveStateTimeout);
    }
    this._saveStateTimeout = setTimeout(() => {
        this.saveState();
        this._saveStateTimeout = null;
    }, 300); // 300msのデバウンス
},
            generateId: (p) => `${p}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            getActiveSlide() { return this.state.presentation?.slides.find(s => s.id === this.state.activeSlideId); },
            getSelectedElement() { const id = this.state.selectedElementIds[0]; return this.getActiveSlide()?.elements.find(el => el.id === id); },
            getSelectedElementsData() { const slide = this.getActiveSlide(); if (!slide) return []; return slide.elements.filter(el => this.state.selectedElementIds.includes(el.id)); },
            startPresentation() {
                document.body.classList.add('presentation-mode');
                this.elements.presentationView.requestFullscreen().catch(() => {
                    alert('フルスクリーンモードの開始に失敗しました。');
                    this.stopPresentation();
                });
                this.renderPresentationSlide();
                window.addEventListener('resize', this.renderPresentationSlide.bind(this));
                // クリックで次のスライド
                this._presentationClickHandler = (e) => {
                    const rect = this.elements.presentationView.getBoundingClientRect();
                    const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
                    if (x < rect.left + rect.width / 2) {
                        this.changePresentationSlide(-1);
                    } else {
                        this.changePresentationSlide(1);
                    }
                };
                this.elements.presentationView.addEventListener('click', this._presentationClickHandler);
            },
            stopPresentation() {
                document.body.classList.remove('presentation-mode');
                if (document.fullscreenElement) document.exitFullscreen();
                window.removeEventListener('resize', this.renderPresentationSlide.bind(this));
                // クリックイベント解除
                if (this._presentationClickHandler) {
                    this.elements.presentationView.removeEventListener('click', this._presentationClickHandler);
                    this._presentationClickHandler = null;
                }
            },
            changeSlide(dir) {
                const { slides } = this.state.presentation;
                const curIdx = slides.findIndex(s => s.id === this.state.activeSlideId);
                let nextIdx = curIdx + dir;
                if (nextIdx >= 0 && nextIdx < slides.length) {
                    this.setActiveSlide(slides[nextIdx].id);
                }
            },
            setActiveSlide(slideId) {
                if (this.state.presentation.slides.some(s => s.id === slideId)) {
                    this.state.activeSlideId = slideId;
                    this.state.selectedElementIds = [];
                    if (document.body.classList.contains('presentation-mode')) {
                        this.renderPresentationSlide();
                    } else {
                        this.render();
                    }
                }
            },
            changePresentationSlide(dir) { this.changeSlide(dir); },
            renderPresentationSlide() {
                const slide = this.getActiveSlide();
                if (!slide) return;
                const { presentationSlideContainer } = this.elements;
                const { settings } = this.state.presentation;
                presentationSlideContainer.innerHTML = '';
                const presW = this.elements.presentationView.clientWidth, presH = this.elements.presentationView.clientHeight;
                const presRatio = presW / presH, slideRatio = settings.width / settings.height;
                let sW = (presRatio > slideRatio) ? presH * slideRatio : presW;
                let scale = sW / settings.width;
                presentationSlideContainer.style.width = `${settings.width}px`;
                presentationSlideContainer.style.height = `${settings.height}px`;
                presentationSlideContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
                Object.assign(presentationSlideContainer.style, { position: 'absolute', left: '50%', top: '50%' });
            
                slide.elements.forEach(elData => {
                    const el = this.createElementDOM(elData);
                    // アニメーション付与
                    if (elData.style.animation) {
                        el.classList.remove('animate__animated', elData.style.animation);
                        void el.offsetWidth; // 強制再描画
                        el.classList.add('animate__animated', elData.style.animation);
                        el.addEventListener('animationend', function handler() {
                            el.classList.remove('animate__animated', elData.style.animation);
                            el.removeEventListener('animationend', handler);
                        });
                    }
                    presentationSlideContainer.appendChild(el);
                });
            },
            showExportMenu(e) { const menu = this.elements.exportMenu; menu.innerHTML = `<div style="padding:8px 12px;cursor:pointer;" id="export-png-btn">PNG保存</div><div style="padding:8px 12px;cursor:pointer;" id="export-pdf-btn">PDF保存</div>`; menu.style.display = 'block'; const rect = this.elements.exportBtn.getBoundingClientRect(); menu.style.left = rect.left + 'px'; menu.style.top = (rect.bottom + 5) + 'px'; document.getElementById('export-png-btn').onclick = () => { this.exportCurrentSlideAsImage(); menu.style.display = 'none'; }; document.getElementById('export-pdf-btn').onclick = () => { this.exportCurrentSlideAsPDF(); menu.style.display = 'none'; }; setTimeout(() => document.addEventListener('click', function h(ev) { if (!menu.contains(ev.target) && !App.elements.exportBtn.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', h); } }, { once: true }), 10); },
            exportCurrentSlideAsImage() { html2canvas(this.elements.slideCanvas, { backgroundColor: "#fff", scale: 2 }).then(c => { const l = document.createElement('a'); l.download = `slide-${this.state.activeSlideId}.png`; l.href = c.toDataURL(); l.click(); }); },
            exportCurrentSlideAsPDF() {
                const node = this.elements.slideCanvas;
                const { settings } = this.state.presentation;
                const pdf = new window.jspdf.jsPDF({
                    orientation: settings.width > settings.height ? 'l' : 'p',
                    unit: 'px',
                    format: [settings.width, settings.height]
                });
                pdf.html(node, {
                    callback: function (pdf) {
                        pdf.save(`slide-${App.state.activeSlideId}.pdf`);
                    },
                    x: 0,
                    y: 0,
                    width: settings.width,
                    windowWidth: node.offsetWidth, // Ensure the HTML is rendered at its actual width
                    html2canvas: {
                        scale: 2, // 元のhtml2canvasのscaleを維持
                        backgroundColor: "#fff", // 元のhtml2canvasのbackgroundColorを維持
                        logging: true, // デバッグ用にログを出力
                        useCORS: true // クロスオリジン画像を許可
                    }
                });
            },
            moveSlide(fromId, toId) { const s = this.state.presentation.slides; const fromIdx = s.findIndex(s => s.id === fromId), toIdx = s.findIndex(s => s.id === toId); if (fromIdx === -1 || toIdx === -1) return; const [moved] = s.splice(fromIdx, 1); s.splice(toIdx, 0, moved); this.render(); this.saveState(); },
            duplicateSlide(slideId) { const s = this.state.presentation.slides; const idx = s.findIndex(s => s.id === slideId); if (idx === -1) return; const newSlide = JSON.parse(JSON.stringify(s[idx])); newSlide.id = this.generateId('slide'); newSlide.elements.forEach(el => el.id = this.generateId('el')); s.splice(idx + 1, 0, newSlide); this.state.activeSlideId = newSlide.id; this.state.selectedElementIds = []; this.render(); this.saveState(); },
            showContextMenu(e, id, content, handlers) { const oldMenu = document.getElementById(id); if (oldMenu) oldMenu.remove(); const menu = document.createElement('div'); menu.id = id; Object.assign(menu.style, { position: 'fixed', zIndex: 99999, left: e.clientX + 'px', top: e.clientY + 'px', background: '#fff', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', padding: '4px' }); menu.innerHTML = content; document.body.appendChild(menu); Object.entries(handlers).forEach(([btnId, handler]) => document.getElementById(btnId).onclick = () => { handler(); menu.remove(); }); setTimeout(() => document.addEventListener('click', function h(ev) { if (!menu.contains(ev.target) && !App.elements.exportBtn.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', h); } }, { once: true }), 10); },
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
                this.showContextMenu(
                    e,
                    'element-context-menu',
                    `<div style="padding:8px 12px;cursor:pointer;" id="el-copy-btn">コピー</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-paste-btn">ペースト</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-duplicate-btn">複製</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-front-btn">最前面へ</div>
                    <div style="padding:8px 12px;cursor:pointer;" id="el-back-btn">最背面へ</div>
                    <div style="padding:8px 12px;cursor:pointer;color:var(--danger-color);" id="el-delete-btn">削除</div>`,
                    {
                        'el-copy-btn': () => this.copyToClipboard(elId),
                        'el-paste-btn': () => this.pasteFromClipboard(),
                        'el-duplicate-btn': () => this.duplicateElement(elId),
                        'el-front-btn': () => { this.bringElementToFront(elId); },
                        'el-back-btn': () => { this.sendElementToBack(elId); },
                        'el-delete-btn': () => { this.state.selectedElementIds = [elId]; this.deleteSelectedElements(); }
                    }
                );
            },
            // 複製（現状のコピー機能）
            duplicateElement(elId) {
                const slide = this.getActiveSlide();
                if (!slide) return;
                const idx = slide.elements.findIndex(el => el.id === elId);
                if (idx === -1) return;
                const newEl = JSON.parse(JSON.stringify(slide.elements[idx]));
                newEl.id = this.generateId('el');
                newEl.style.left += 2;
                newEl.style.top += 2;
                newEl.style.zIndex = slide.elements.length + 1;
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
                const slide = this.getActiveSlide();
                if (!slide || !window._slideClipboard) return;
                const newEl = JSON.parse(JSON.stringify(window._slideClipboard));
                newEl.id = this.generateId('el');
                newEl.style.left += 4;
                newEl.style.top += 4;
                newEl.style.zIndex = slide.elements.length + 1;
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

            addIconElement(iconType, iconClass) {
                const slide = this.getActiveSlide();
                if (!slide) return;

                const newEl = {
                    id: this.generateId('el'),
                    type: 'icon',
                    iconType: iconType, // Store icon type (fa or mi)
                    content: iconClass, // Class string for FA, class name for MI
                    style: {
                        top: 20, left: 20, width: null, height: null,
                        zIndex: slide.elements.length + 1,
                        rotation: 0,
                        color: '#212529',
                        fontSize: 48,
                        animation: ''
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

        // 要素のzIndexを最大に
        bringElementToFront(elId) {
            const slide = this.getActiveSlide();
            if (!slide) return;
            const maxZ = Math.max(...slide.elements.map(el => el.style.zIndex || 1));
            const el = slide.elements.find(el => el.id === elId);
            if (el) {
                el.style.zIndex = maxZ + 1;
                this.saveState();
                this.render();
            }
        },
        // 要素のzIndexを最小に
        sendElementToBack(elId) {
            const slide = this.getActiveSlide();
            if (!slide) return;
            const minZ = Math.min(...slide.elements.map(el => el.style.zIndex || 1));
            const el = slide.elements.find(el => el.id === elId);
            if (el) {
                el.style.zIndex = minZ - 1;
                this.saveState();
                this.render();
            }
        },
        
        async initGlobalCssEditor() {
            if (this.cmInstances.globalCssEditor) return;
            const container = document.getElementById('global-css-input');
            if (!container || !window.codemirror) return;
            const cssLang = window.codemirror.langs.css();
            this.cmInstances.globalCssEditor = new window.codemirror.EditorView({
                doc: this.state.presentation.settings.globalCss || '',
                extensions: [
                    cssLang,
                    window.codemirror.basicSetup,
                    window.codemirror.lint.linter(window.codemirror.langs.cssLinter),
                    window.codemirror.lint.lintGutter()
                ],
                parent: container
            });
        },

        async initElementCssEditor(initialContent) {
            if (this.cmInstances.elementCssEditor) {
                this.cmInstances.elementCssEditor.destroy();
            }
            const container = document.getElementById('element-css-editor-container');
            if (!container || !window.codemirror) return;
            const cssLang = window.codemirror.langs.css();
            const updateListener = window.codemirror.EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    const el = this.getSelectedElement();
                    if (el) {
                        // Lint結果を取得
                        let diagnostics = [];
                        if (window.codemirror.langs && window.codemirror.langs.cssLinter) {
                            try {
                                diagnostics = window.codemirror.langs.cssLinter(update.state);
                            } catch (e) {
                                diagnostics = [];
                            }
                        }
                        const hasError = diagnostics && diagnostics.some(d => d.severity === "error");
                        if (hasError) {
                            alert('カスタムCSSに構文エラーがあります。修正してください。');
                            return;
                        }
                        el.style.customCss = update.state.doc.toString();
                        this.applyCustomCss();
                        this.saveState();
                    }
                }
            });

            this.cmInstances.elementCssEditor = new window.codemirror.EditorView({
                doc: initialContent,
                extensions: [
                    cssLang,
                    window.codemirror.basicSetup,
                    updateListener,
                    window.codemirror.lint.linter(window.codemirror.langs.cssLinter),
                    window.codemirror.lint.lintGutter()
                ],
                parent: container
            });
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
                                                <button type="button" class="qr-style-btn" data-style="square" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">四角</button>
                                                <button type="button" class="qr-style-btn" data-style="dots" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">丸</button>
                                                <button type="button" class="qr-style-btn" data-style="rounded" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">角丸</button>
                                                <button type="button" class="qr-style-btn" data-style="classy" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">クラッシー</button>
                                                <button type="button" class="qr-style-btn" data-style="classy-rounded" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">クラッシー丸</button>
                                                <button type="button" class="qr-style-btn" data-style="extra-rounded" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">超丸</button>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #6c757d; font-weight: 500;">枠線形状</label>
                                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                                                <button type="button" class="qr-corner-btn" data-corner="square" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">四角</button>
                                                <button type="button" class="qr-corner-btn" data-corner="dot" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">丸</button>
                                                <button type="button" class="qr-corner-btn" data-corner="extra-rounded" style="padding: 12px; border: 2px solid #dee2e6; border-radius: 8px; background: white; cursor: pointer; text-align: center; font-size: 12px; transition: all 0.2s;">超丸</button>
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
        const selectedBtn = document.querySelector('.chart-type-btn.selected');
        let chartType = selectedBtn ? selectedBtn.dataset.type : (document.getElementById('chart-type')?.value || 'bar');
        const labels = document.getElementById('chart-labels').value.split(',').map(s => s.trim());
        const datasetLabel = document.getElementById('chart-dataset-label').value;
        const dataValues = document.getElementById('chart-data').value.split(',').map(s => Number(s.trim()));
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

    const chartInputs = ['chart-type', 'chart-labels', 'chart-dataset-label', 'chart-data', 'chart-colors', 'chart-line-width', 'chart-show-legend', 'chart-title', 'chart-show-grid'];
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

    const chartForm = document.getElementById('chart-create-form');
    if (chartForm) {
        chartForm.onsubmit = function(ev) {
            ev.preventDefault();
            if (!chartInstance) return;
            const slide = window.App?.getActiveSlide();
            if (!slide) return;
            const newEl = {
                id: App.generateId('el'), type: 'chart', content: chartInstance.config,
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

    // 3. CodeMirrorの動的インポート
    const { EditorView } = await import('https://esm.sh/@codemirror/view');
    const { basicSetup } = await import('https://esm.sh/codemirror');
    const { css, cssLinter } = await import('https://esm.sh/@codemirror/lang-css');
    const { linter, lintGutter } = await import('https://esm.sh/@codemirror/lint');
    
    window.codemirror = {
        EditorView, basicSetup,
        langs: { css, cssLinter },
        lint: { linter, lintGutter }
    };

    // 4. カスタムCSS適用用のstyleタグをheadに準備
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'global-custom-styles' }));
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'elements-custom-styles' }));

    // 5. MicroModalの初期化
    if (typeof MicroModal !== "undefined") {
        MicroModal.init({
            awaitCloseAnimation: true,
            disableScroll: true,
            onShow: modal => {
                if (modal.id === 'chart-modal') {
                    if (!document.querySelector('.chart-type-btn.selected') && chartTypeBtns.length > 0) {
                        chartTypeBtns[0].classList.add('selected');
                    }
                    updateChartPreview();
                }
            }
        });
    }

    // 6. Appの初期化
    await App.loadIconData();
    App.aiHandler = new AIHandler(App);
    App.init();

    // 7. App初期化後のイベントリスナー設定
    const bottomPane = document.getElementById('bottom-pane');
    if (bottomPane) {
        bottomPane.addEventListener('wheel', function(e) {
            if (Math.abs(e.deltaY) > 30) {
                e.preventDefault();
                App.changeSlide(e.deltaY > 0 ? 1 : -1);
            }
        }, { passive: false });
    }
});