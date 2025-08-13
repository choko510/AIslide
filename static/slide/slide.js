import * as Automerge from "https://esm.sh/@automerge/automerge@3.1.1/slim?bundle-deps";
import { ColorPicker } from './ColorPicker.js';

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
        window.CANVAS_WIDTH = CANVAS_WIDTH;
        window.CANVAS_HEIGHT = CANVAS_HEIGHT;

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
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 3000);
            }
        }
        window.ErrorHandler = ErrorHandler; // ErrorHandlerクラスをグローバルに公開

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

            addGuide(orientation, position, options = {}) {
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

                    if (options.label) {
                        const label = document.createElement('span');
                        label.className = 'guide-label';
                        label.textContent = options.label;
                        guide.appendChild(label);
                    }
                    
                    this.container.appendChild(guide);
                } catch (error) {
                    ErrorHandler.handle(error, 'guide_add');
                }
            }

            calculateSnapGuides(draggingBounds, staticElementsBounds, canvasBounds) {
                try {
                    let snapOffset = { x: 0, y: 0 };
                    const guidesToShow = new Set();
            
                    // 1. 辺と中心線のスナップ（既存ロジック）
                    const verticalSnapLines = [canvasBounds.left, canvasBounds.centerX, canvasBounds.right];
                    const horizontalSnapLines = [canvasBounds.top, canvasBounds.centerY, canvasBounds.bottom];
                    staticElementsBounds.forEach(bounds => {
                        verticalSnapLines.push(bounds.left, bounds.centerX, bounds.right);
                        horizontalSnapLines.push(bounds.top, bounds.centerY, bounds.bottom);
                    });
            
                    const verticalSnap = this._calculateDirectionalSnap([draggingBounds.left, draggingBounds.centerX, draggingBounds.right], verticalSnapLines);
                    if (verticalSnap.hasSnap) {
                        snapOffset.x = verticalSnap.offset;
                    }
            
                    const horizontalSnap = this._calculateDirectionalSnap([draggingBounds.top, draggingBounds.centerY, draggingBounds.bottom], horizontalSnapLines);
                    if (horizontalSnap.hasSnap) {
                        snapOffset.y = horizontalSnap.offset;
                    }
            
                    // 2. 等間隔ガイドのスナップ（修正後ロジック）
                    if (staticElementsBounds.length >= 2) {
                        const distributionSnap = this._calculateDistributionSnapV2(draggingBounds, staticElementsBounds, snapOffset);
                        if (distributionSnap.x.hasSnap) {
                            snapOffset.x = distributionSnap.x.offset;
                            distributionSnap.x.guides.forEach(g => guidesToShow.add(`dist-v-${g.pos1}-${g.pos2}-${g.gap}`));
                        }
                        if (distributionSnap.y.hasSnap) {
                            snapOffset.y = distributionSnap.y.offset;
                            distributionSnap.y.guides.forEach(g => guidesToShow.add(`dist-h-${g.pos1}-${g.pos2}-${g.gap}`));
                        }
                    }
            
                    // ガイドの描画
                    this.clear();
                    if(verticalSnap.hasSnap) verticalSnap.lines.forEach(l => this.addGuide('vertical', l));
                    if(horizontalSnap.hasSnap) horizontalSnap.lines.forEach(l => this.addGuide('horizontal', l));
                    
                    guidesToShow.forEach(gStr => {
                        const [type, orientation, pos1, pos2, gap] = gStr.split('-');
                        if (type === 'dist') {
                            this.addGuide(orientation === 'v' ? 'vertical' : 'horizontal', parseFloat(pos1), {label: `${Math.round(gap)}px`});
                            this.addGuide(orientation === 'v' ? 'vertical' : 'horizontal', parseFloat(pos2), {label: `${Math.round(gap)}px`});
                        }
                    });
            
                    return { snapOffset, guides: [] };
                } catch (error) {
                    ErrorHandler.handle(error, 'snap_calculation');
                    return { snapOffset: { x: 0, y: 0 }, guides: [] };
                }
            }
            
            _calculateDistributionSnapV2(draggingBounds, staticElementsBounds, currentOffset) {
                // 静的要素間のギャップを計算
                const hGaps = new Set();
                const vGaps = new Set();
                const sortedX = [...staticElementsBounds].sort((a, b) => a.left - b.left);
                const sortedY = [...staticElementsBounds].sort((a, b) => a.top - b.top);
            
                for (let i = 0; i < sortedX.length - 1; i++) {
                    hGaps.add(sortedX[i+1].left - sortedX[i].right);
                }
                for (let i = 0; i < sortedY.length - 1; i++) {
                    vGaps.add(sortedY[i+1].top - sortedY[i].bottom);
                }
            
                // ドラッグ中要素と静的要素のギャップを比較
                let bestSnapX = { hasSnap: false, dist: Infinity };
                let bestSnapY = { hasSnap: false, dist: Infinity };
            
                for (const staticBound of staticElementsBounds) {
                    // 水平ギャップ
                    for (const targetGap of hGaps) {
                        // Case 1: Dragging element is to the right of static element
                        let currentGap = draggingBounds.left - staticBound.right;
                        let diff = targetGap - currentGap;
                        if (Math.abs(diff) < this.SNAP_THRESHOLD && Math.abs(diff) < bestSnapX.dist) {
                            bestSnapX = { hasSnap: true, dist: Math.abs(diff), offset: currentOffset.x + diff, guides: [{pos1: staticBound.right, pos2: draggingBounds.left + diff, gap: targetGap}] };
                        }
            
                        // Case 2: Dragging element is to the left of static element
                        currentGap = staticBound.left - draggingBounds.right;
                        diff = targetGap - currentGap;
                        if (Math.abs(diff) < this.SNAP_THRESHOLD && Math.abs(diff) < bestSnapX.dist) {
                            bestSnapX = { hasSnap: true, dist: Math.abs(diff), offset: currentOffset.x - diff, guides: [{pos1: draggingBounds.right-diff, pos2: staticBound.left, gap: targetGap}] };
                        }
                    }
            
                    // 垂直ギャップ
                    for (const targetGap of vGaps) {
                        // Case 1: Dragging element is below static element
                        let currentGap = draggingBounds.top - staticBound.bottom;
                        let diff = targetGap - currentGap;
                        if (Math.abs(diff) < this.SNAP_THRESHOLD && Math.abs(diff) < bestSnapY.dist) {
                            bestSnapY = { hasSnap: true, dist: Math.abs(diff), offset: currentOffset.y + diff, guides: [{pos1: staticBound.bottom, pos2: draggingBounds.top + diff, gap: targetGap}] };
                        }
            
                        // Case 2: Dragging element is above static element
                        currentGap = staticBound.top - draggingBounds.bottom;
                        diff = targetGap - currentGap;
                        if (Math.abs(diff) < this.SNAP_THRESHOLD && Math.abs(diff) < bestSnapY.dist) {
                            bestSnapY = { hasSnap: true, dist: Math.abs(diff), offset: currentOffset.y - diff, guides: [{pos1: draggingBounds.bottom - diff, pos2: staticBound.top, gap: targetGap}] };
                        }
                    }
                }
                return { x: bestSnapX, y: bestSnapY };
            }

            drawSizeMatchGuide(guideInfo, scale = 1) {
                try {
                    const { type, elementAId, elementBId, handle } = guideInfo;
                    const elA = this.container.querySelector(`[data-id="${elementAId}"]`);
                    const elB = this.container.querySelector(`[data-id="${elementBId}"]`);

                    if (!elA || !elB) return;

                    const canvasRect = this.container.getBoundingClientRect();
                    const rectA = elA.getBoundingClientRect();
                    const rectB = elB.getBoundingClientRect();

                    const relativeA = {
                        left: (rectA.left - canvasRect.left) / scale,
                        top: (rectA.top - canvasRect.top) / scale,
                        right: (rectA.right - canvasRect.left) / scale,
                        bottom: (rectA.bottom - canvasRect.top) / scale,
                    };
                    const relativeB = {
                        left: (rectB.left - canvasRect.left) / scale,
                        top: (rectB.top - canvasRect.top) / scale,
                        right: (rectB.right - canvasRect.left) / scale,
                        bottom: (rectB.bottom - canvasRect.top) / scale,
                    };

                    const top = Math.min(relativeA.top, relativeB.top);
                    const bottom = Math.max(relativeA.bottom, relativeB.bottom);
                    const left = Math.min(relativeA.left, relativeB.left);
                    const right = Math.max(relativeA.right, relativeB.right);

                    if (type === 'width') {
                        const posA = handle.includes('w') ? relativeA.left : relativeA.right;
                        const posB = handle.includes('w') ? relativeB.left : relativeB.right;
                        this._addDynamicGuide('vertical', posA, top, bottom);
                        this._addDynamicGuide('vertical', posB, top, bottom);
                    } else if (type === 'height') {
                        const posA = handle.includes('n') ? relativeA.top : relativeA.bottom;
                        const posB = handle.includes('n') ? relativeB.top : relativeB.bottom;
                        this._addDynamicGuide('horizontal', posA, left, right);
                        this._addDynamicGuide('horizontal', posB, left, right);
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'guide_draw_size_match');
                }
            }

            _addDynamicGuide(orientation, position, start, end) {
                const guide = document.createElement('div');
                guide.className = `guide-line size-match ${orientation}`;
                
                if (orientation === 'vertical') {
                    guide.style.left = `${position}px`;
                    guide.style.top = `${start}px`;
                    guide.style.height = `${end - start}px`;
                } else { // horizontal
                    guide.style.top = `${position}px`;
                    guide.style.left = `${start}px`;
                    guide.style.width = `${end - start}px`;
                }
                
                this.container.appendChild(guide);
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
        // 状態管理 (Automerge版)
        // =================================================================
        class StateManager {
                    constructor() {
                        this.slideId = null; // WebSocket連携用にSlide IDを保持
                        // Automerge の初期化（fromは使わず init + change）
                        this.doc = Automerge.init();
                        this.doc = Automerge.change(this.doc, d => {
                            d.presentation = null;
                            d.activeSlideId = null;
                            d.selectedElementIds = [];
                            d.selectedGroupIds = [];
                            d.isEditingText = false;
                        });
        
                        this.listeners = new Map();
                        this.onChangeCallback = null;
                    }
        
                    // 初期状態のドキュメントを生成（通知のみ、送信しない）
                    createInitialDoc() {
                        const firstSlideId = Utils.generateId('slide');
                        this.doc = Automerge.change(this.doc, d => {
                            d.presentation = {
                                settings: {
                                    width: CANVAS_WIDTH,
                                    height: CANVAS_HEIGHT,
                                    globalCss: '',
                                    backgroundType: 'solid',
                                    backgroundColor: '#ffffff',
                                    gradientStart: '#ffffff',
                                    gradientEnd: '#007bff',
                                    gradientAngle: 90
                                },
                                slides: [{
                                    id: firstSlideId,
                                    elements: [{
                                        id: Utils.generateId('el'),
                                        type: 'text',
                                        content: 'タイトル',
                                        style: {
                                            top: 20, left: 10, width: 80, height: null,
                                            zIndex: 1, rotation: 0, color: '#212529',
                                            fontSize: 60, fontFamily: 'sans-serif', animation: ''
                                        }
                                    }]
                                }],
                                groups: {}
                            };
                            d.activeSlideId = firstSlideId;
                            d.selectedElementIds = [];
                            d.selectedGroupIds = [];
                            d.isEditingText = false;
                        });
                        this._notifyListeners('*', this.doc);
                    }
        
                    // バイナリから完全置換でロード
                    loadDoc(binary) {
                        try {
                            if (!binary || binary.length === 0) {
                                console.log("Received empty document from server, creating a new initial document.");
                                this.createInitialDoc();
                                // 新規作成後、サーバーに保存して状態を同期する
                                if (this.slideId) {
                                    this.save(this.slideId);
                                }
                                return true;
                            }
                            const newDoc = Automerge.load(binary);
                            this.doc = newDoc;
                            this._notifyListeners('*', this.doc);
                            return true;
                        } catch (error) {
                            ErrorHandler.handle(error, 'automerge_load');
                            // ロードに失敗した場合、回復を試みずに新しいドキュメントを作成する
                            console.warn("Automerge load failed. Discarding received data and creating a new initial document.");
                            this.createInitialDoc();
                             // 新規作成後、サーバーに保存して状態を同期する
                            if (this.slideId) {
                                this.save(this.slideId);
                            }
                            return false; // 失敗したことを示す
                        }
                    }
        
                    // Base64 -> Uint8Array（安全ループ）
                    _base64ToBytes(b64) {
                        const bin = atob(b64);
                        const len = bin.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
                        return bytes;
                    }
        
                    // Uint8Array -> Base64（安全ループ）
                    _bytesToBase64(bytes) {
                        let bin = '';
                        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                        return btoa(bin);
                    }
        
                    // サーバーからスライドをロード、または新規作成
                    async load(slideId) {
                        try {
                            const response = await fetch(`/api/slides/${slideId}`);
                            if (response.ok) {
                                const payload = await response.json();
                                const binary = this._base64ToBytes(payload.data);
                                this.doc = Automerge.load(binary);
                                console.log(`Successfully loaded document for slide ${slideId}`);
                            } else if (response.status === 404) {
                                console.log(`No data for slide ${slideId}, creating new document.`);
                                this.createInitialDoc();
                                await this.save(slideId);
                            } else {
                                throw new Error(`Failed to load slide data: ${response.statusText}`);
                            }
                        } catch (error) {
                            console.warn('Automerge load failed, recreating new doc:', error);
                            this.doc = Automerge.init();
                            this.createInitialDoc();
                            await this.save(slideId);
                        }
                        this._notifyListeners('*', this.doc);
                    }
        
                    // 現在のドキュメントをサーバーに保存
                    async save(slideId) {
                        try {
                            const bytes = Automerge.save(this.doc);
                            const base64Data = this._bytesToBase64(bytes);
                            const response = await fetch(`/api/slides/${slideId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ data: base64Data }),
                            });
                            if (!response.ok) {
                                throw new Error(`Failed to save slide data: ${response.statusText}`);
                            }
                            console.log(`Successfully saved document for slide ${slideId}`);
                        } catch (error) {
                            ErrorHandler.handle(error, 'save_state');
                        }
                    }



            // 変更を適用
            applyChanges(changes) {
                try {
                    // v3では、applyChangesはパッチを返さない
                    const newDoc = Automerge.applyChanges(this.doc, changes);
                    this.doc = newDoc;
                    // 今回はシンプルに全体通知
                    this._notifyListeners('*', this.doc);
                } catch (error) {
                    ErrorHandler.handle(error, 'automerge_apply_changes');
                    console.error("Failed to apply changes, forcing a reload to resync.");
                    // 無限リロードを防ぐために、セッションストレージで一度だけリロードする
                    if (!sessionStorage.getItem('automerge_reload_triggered')) {
                        sessionStorage.setItem('automerge_reload_triggered', 'true');
                        window.location.reload();
                    }
                }
            }

            // 状態の取得
            get(path) {
                if (!path) return this.doc;
                const keys = path.split('.');
                let current = this.doc;
                for (const key of keys) {
                    if (current === null || current === undefined) return undefined;
                    current = current[key];
                }
                return current;
            }

            // 状態の更新（Automerge.changeを使用）
            change(callback, options = {}) {
                const oldDoc = this.doc;
                const newDoc = Automerge.change(this.doc, (docProxy) => {
                    callback(docProxy);
                });
                
                this.doc = newDoc;

                const changes = Automerge.getChanges(oldDoc, newDoc);

                // 変更があった場合、かつ silent オプションが指定されていない場合に通知する
                if (changes.length > 0 && !options.silent) {
                    if (this.onChangeCallback) {
                        this.onChangeCallback(changes);
                    }
                }
                
                // 変更をリスナーに通知 (こちらも silent オプションを尊重)
                if (!options.silent) {
                    this._notifyListeners('*', this.doc);
                }
            }

            // リスナーの登録
            subscribe(path, callback) {
                if (!this.listeners.has(path)) {
                    this.listeners.set(path, new Set());
                }
                this.listeners.get(path).add(callback);
                
                return () => {
                    const pathListeners = this.listeners.get(path);
                    if (pathListeners) {
                        pathListeners.delete(callback);
                    }
                };
            }

            _notifyListeners(path, newValue) {
                 // 全体リスナーに通知
                 const allListeners = this.listeners.get('*');
                 if (allListeners) {
                     allListeners.forEach(callback => {
                         try {
                             callback(newValue);
                         } catch (error) {
                             ErrorHandler.handle(error, 'state_listener');
                         }
                     });
                 }
                // パス指定のリスナーにも通知（簡易版）
                const exactListeners = this.listeners.get(path);
                if (exactListeners) {
                    exactListeners.forEach(callback => {
                        try {
                            callback(this.get(path));
                        } catch (error) {
                            ErrorHandler.handle(error, 'state_listener');
                        }
                    });
                }
            }
            
            // 変更通知コールバックの設定
            setOnChange(callback) {
                this.onChangeCallback = callback;
            }

            undo() {
                console.warn("Undo is not supported in this version of Automerge.");
                return false;
            }

            redo() {
                console.warn("Redo is not supported in this version of Automerge.");
                return false;
            }

            canUndo() {
                return false;
            }

            canRedo() {
                return false;
            }
        }
        window.StateManager = StateManager;

        // =================================================================
        // WebSocketクライアント
        // =================================================================
        class WebSocketClient {
            constructor(url, stateManager) {
                this.url = url;
                this.stateManager = stateManager;
                this.ws = null;
                this.reconnectAttempts = 0;
                this.maxReconnectAttempts = 10;
                this.sendQueue = []; // メッセージキュー
                this.clientId = Utils.generateId('client');
                this.connect();
            }

            async _ensureSlideExists() {
                // slideId は URL もしくは stateManager から取得
                const slideId = this.stateManager?.slideId || window.SLIDE_ID || null;
                if (!slideId) return;

                try {
                    const res = await fetch(`/api/slides/${slideId}`);
                    if (res.status === 404) {
                        // 空ドキュメントを作成
                        const payload = { data: btoa(String.fromCharCode(...(new Uint8Array(0)))) };
                        const putRes = await fetch(`/api/slides/${slideId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        });
                        if (!putRes.ok) {
                            console.warn('Failed to create slide on server:', await putRes.text());
                        }
                    }
                } catch (e) {
                    console.warn('ensureSlideExists failed', e);
                }
            }

            _buildWsUrl() {
                // 認証トークンがあるならクエリに付与
                try {
                    const token = localStorage.getItem('access_token');
                    const url = new URL(this.url, window.location.origin);
                    if (token) {
                        url.searchParams.set('token', token);
                    }
                    return url.toString().replace(/^http/, 'ws');
                } catch {
                    return this.url;
                }
            }

            connect() {
                try {
                    this.ws = new WebSocket(this._buildWsUrl());
                    this.ws.binaryType = 'arraybuffer';

                    this.ws.onopen = async () => {
                        console.log('WebSocket connection established');
                        this.reconnectAttempts = 0;
                        // 接続直後も保険で存在確認（APIとWSの競合を避けるためにawait）
                        await this._ensureSlideExists();
                        this.flushQueue(); // 接続時にキューを処理
                    };

                    this.ws.onmessage = (event) => {
                        try {
                            if (event.data instanceof ArrayBuffer) {
                                // バイナリデータ（ドキュメント全体）を受信した場合
                                const binary = new Uint8Array(event.data);
                                console.log('Received full document from server, loading.');
                                this.stateManager.loadDoc(binary);
                                return;
                            }

                            // JSONメッセージ（差分）を受信した場合
                            const message = JSON.parse(event.data);
                            if (message.clientId === this.clientId) {
                                console.log('Ignoring own changes received from server.');
                                return;
                            }
                            
                            // changesはBase64エンコードされた文字列の配列
                            const changes = message.changes.map(this.stateManager._base64ToBytes);
                            console.log('Received changes from another client, applying them.');
                            this.stateManager.applyChanges(changes);
                        } catch (error) {
                            ErrorHandler.handle(error, 'ws_message_processing');
                        }
                    };

                    this.ws.onerror = (error) => {
                        ErrorHandler.handle(error, 'ws_error');
                    };

                    this.ws.onclose = async (ev) => {
                        console.log('WebSocket connection closed.', ev && ev.reason);
                        // 1008 + 認証/未存在理由は再接続しない
                        const reason = (ev && ev.reason) || '';
                        if (reason.includes('Authentication Failed') || reason.includes('Slide not found')) {
                            console.warn('WS close due to auth/slide not found. Stop reconnecting.');
                            return;
                        }

                        if (this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            const delay = Math.min(30000, (2 ** this.reconnectAttempts) * 1000);
                            console.log(`Attempting to reconnect in ${delay / 1000}s...`);
                            // 再接続前に存在確認（404なら作成）
                            await this._ensureSlideExists();
                            setTimeout(() => this.connect(), delay);
                        } else {
                            ErrorHandler.showNotification('サーバーとの接続が切れました。リロードしてください。', 'error');
                        }
                    };
                } catch (error) {
                    ErrorHandler.handle(error, 'ws_connection');
                }
            }

            flushQueue() {
                while (this.sendQueue.length > 0) {
                    const change = this.sendQueue.shift();
                    try {
                        this.ws.send(change);
                    } catch (error) {
                        ErrorHandler.handle(error, 'ws_send_queued');
                    }
                }
            }

            send(changes) {
                if (!changes || changes.length === 0) return;

                const message = {
                    clientId: this.clientId,
                    // changes は Uint8Array の配列なので、Base64文字列に変換して送信
                    changes: changes.map(this.stateManager._bytesToBase64)
                };
                const messageString = JSON.stringify(message);

                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(messageString);
                        console.log('Sent changes to server:', changes.length);
                    } catch (error) {
                        ErrorHandler.handle(error, 'ws_send');
                        this.sendQueue.push(messageString); // エラー時はキューに入れる
                    }
                } else {
                    console.warn('WebSocket is not open. Queuing message. Ready state:', this.ws?.readyState);
                    this.sendQueue.push(messageString);
                }
            }
        }

        // =================================================================
        // ユーティリティ関数群
        // =================================================================
        const Utils = window.Utils = { // Utilsオブジェクトをグローバルに公開
            generateId: (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            
            // URL安全性チェック（サーバーの /api/url/safe-check を利用）
            checkUrlSafety: async (url, { signal } = {}) => {
                if (!url || typeof url !== 'string') {
                    return { safe: false, reason: 'invalid_url' };
                }
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000);
                    const res = await fetch('/api/url/safe-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }),
                        signal: signal ?? controller.signal
                    });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        return { safe: false, reason: 'error' };
                    }
                    const data = await res.json();
                    // 期待返却: { safe, reason, matched_domain?, source? }
                    return data;
                } catch (e) {
                    return { safe: false, reason: 'error' };
                }
            },
            
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

                // フォールバックとしての再帰的なディープコピー処理（循環参照対応）
                const recursiveClone = (current, memo = new WeakMap()) => {
                    // プリミティブ値やnullはそのまま返す
                    if (current === null || typeof current !== 'object') {
                        return current;
                    }

                    // 既にクローン済みのオブジェクトはメモから返す
                    if (memo.has(current)) {
                        return memo.get(current);
                    }

                    // Dateオブジェクトのコピー
                    if (current instanceof Date) {
                        const newDate = new Date(current.getTime());
                        memo.set(current, newDate);
                        return newDate;
                    }

                    // 配列のコピー
                    if (Array.isArray(current)) {
                        const newArr = [];
                        memo.set(current, newArr);
                        for (let i = 0; i < current.length; i++) {
                            newArr[i] = recursiveClone(current[i], memo);
                        }
                        return newArr;
                    }

                    // 一般的なオブジェクトのコピー
                    const newObj = {};
                    memo.set(current, newObj);
                    for (const key in current) {
                        if (Object.prototype.hasOwnProperty.call(current, key)) {
                            newObj[key] = recursiveClone(current[key], memo);
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
            },
            
            objectHash: (obj) => {
                const str = JSON.stringify(obj);
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash |= 0; // 32bit整数に変換
                }
                return String(hash);
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
                video.autoplay = false; // 事前読み込みのため自動再生は無効化
                video.loop = !!content.loop;
                video.controls = content.controls !== false;
                video.playsInline = true;
                video.preload = 'auto'; // 事前読み込みを有効化
                
                // 動画読み込みエラーハンドリング
                video.onerror = () => {
                    ErrorHandler.handle(new Error('Video load failed'), 'video_load');
                };
                
                return video;
            }

            static _createChart(elData) {
                const canvas = document.createElement('canvas');
                canvas.id = `chart-${elData.id}`;
                canvas.width = 500; // 仮の幅
                canvas.height = 300; // 仮の高さ
                
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
    // サーバの安全リダイレクト経由で埋め込み
    if (content.url && typeof content.url === 'string') {
        try {
            const u = new URL(content.url, window.location.href);
            // /redirect?url=... に委譲（サーバ側でブロック／許可を判断）
            const redirectUrl = `/redirect?url=${encodeURIComponent(u.toString())}`;
            iframe.src = redirectUrl;
        } catch {
            // URLが不正なら空にする（後続のエラーハンドリングへ）
            iframe.src = '';
        }
    } else {
        iframe.src = '';
    }
    Object.assign(iframe.style, {
        width: '100%',
        height: '100%',
        border: 'none'
    });
    iframe.sandbox = content.sandbox || 'allow-scripts';

    // 読み込み失敗・ブロック時に簡易メッセージを表示（451/4xx想定）
    iframe.addEventListener('load', () => {
        try {
            // ブロック時のページは同一オリジンのため、titleなど取得できる可能性が高い
            const doc = iframe.contentDocument;
            if (!doc) return;
            const title = (doc.querySelector('title')?.textContent || '').toLowerCase();
            if (title.includes('ブロック') || title.includes('blocked')) {
                // 視覚的にわかるよう軽い枠線を付与
                iframe.style.outline = '2px solid #b00020';
            }
        } catch (_) {
            // クロスオリジン時はアクセス不可のため無視
        }
    });

    const overlay = this._createIframeOverlay();
    
    container.appendChild(iframe);
    container.appendChild(overlay);
    return container;
}

            static _createShape(elData) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '100%');
                svg.setAttribute('viewBox', '0 0 100 100'); // viewBoxを元に戻す
                svg.setAttribute('preserveAspectRatio', 'none'); // アスペクト比を維持しないように設定
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
                        if (style.borderRadius) {
                            const elWidthPx = window.Utils.percentToPixels(style.width, window.CANVAS_WIDTH);
                            const elHeightPx = window.Utils.percentToPixels(style.height, window.CANVAS_HEIGHT);
                            if (elWidthPx > 0 && elHeightPx > 0) {
                                const rx = (style.borderRadius / elWidthPx) * 100;
                                const ry = (style.borderRadius / elHeightPx) * 100;
                                const safeRx = Number.isFinite(rx) && rx >= 0 ? rx : 0;
                                const safeRy = Number.isFinite(ry) && ry >= 0 ? ry : 0;
                                shape.setAttribute('rx', safeRx);
                                shape.setAttribute('ry', safeRy);
                            } else {
                                shape.setAttribute('rx', 0);
                                shape.setAttribute('ry', 0);
                            }
                        }
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
                
                const icon = editButton.querySelector('i');
                if (icon) {
                    icon.style.pointerEvents = 'none';
                }
                
                return editButton;
            }

            static _createFontAwesomeIcon(elData) {
                const iTag = document.createElement('i');
                iTag.className = `${elData.content} icon-element`;
                
                Object.assign(iTag.style, {
                    color: elData.style?.color || 'inherit',
                    fontSize: elData.style?.fontSize ? `${elData.style.fontSize}px` : 'inherit',
                });
                
                return iTag;
            }

            static _createMaterialIcon(elData) {
                const spanTag = document.createElement('span');
                spanTag.className = `${elData.content} icon-element`;
                spanTag.textContent = elData.miContent || '';
                
                Object.assign(spanTag.style, {
                    color: elData.style?.color || 'inherit',
                    fontSize: elData.style?.fontSize ? `${elData.style.fontSize}px` : 'inherit',
                });
                
                return spanTag;
            }

            static _createIframeOverlay() {
                const overlay = document.createElement('div');
                overlay.className = 'iframe-overlay';
                
                // イベントハンドラーは後でAppクラスから設定
                return overlay;
            }

            static _initializeChart(canvas, config) {
                // Chart.jsの遅延初期化
                try {
                    if (canvas && window.Chart && config) {
                        // Chart.jsに渡す前にconfigを再度ディープクローンする
                        const chartConfig = Utils.deepClone(config);
                        new Chart(canvas.getContext('2d'), chartConfig);
                    }
                } catch (error) {
                    ErrorHandler.handle(error, 'chart_initialization');
                }
            }

            static _createErrorPlaceholder(type) {
                const div = document.createElement('div');
                div.className = 'element-error-placeholder';
                div.textContent = `エラー: ${type}要素を作成できませんでした`;
                
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
                    border: styles.border || 'none',
                    opacity: styles.opacity ?? 1,
                    borderRadius: styles.borderRadius ? `${styles.borderRadius}px` : '0px',
                    boxShadow: styles.boxShadow || 'none',
                    textAlign: styles.textAlign || 'left'
                });

                const img = element.querySelector('img');
                if (img) {
                    img.style.borderRadius = styles.borderRadius ? `${styles.borderRadius}px` : '0px';
                }

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
        // InteractionManager: ユーザー操作の管理
        // =================================================================
        class InteractionManager {
            constructor(app) {
                this.app = app;
                this.stateManager = app.stateManager;
                this._animationFrameId = null;
                this._boundHandleMouseMove = null;
                this._boundHandleMouseUp = null;
            }

            get state() {
                return this.stateManager.get();
            }

            bindEvents() {
                 // マウス・タッチイベント統合ハンドラー
                 const pointerDownHandler = Utils.debounce(this._createPointerDownHandler(), 50);
                 this.app.elements.slideCanvas.addEventListener('mousedown', pointerDownHandler);
                 this.app.elements.slideCanvas.addEventListener('touchstart', pointerDownHandler, { passive: false });
 
                 // ダブルクリック・ダブルタップ
                 this.app.elements.slideCanvas.addEventListener('dblclick', e => this.handleCanvasDblClick(e));
                 this._bindTouchDoubleTap();
            }

            _createPointerDownHandler() {
                return (e) => {
                    try {
                        if (!e.target || e.target.closest('select, option')) {
                            return;
                        }

                        const isTouch = e.type.startsWith('touch');
                        if (isTouch && (!e.touches || e.touches.length === 0)) return;

                        const point = isTouch ? e.touches[0] : e;
                        if (!point || !point.target) return;

                        const element = point.target.closest('.slide-element');
                        if (element) {
                            this.handleCanvasMouseDown(e);
                        } else {
                            this.app.handleSelectionBoxStart(e);
                        }
                    } catch (error) {
                        ErrorHandler.handle(error, 'pointer_down');
                    }
                };
            }

            _bindTouchDoubleTap() {
                this.app.elements.slideCanvas.addEventListener('touchend', e => {
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
            }

            handleCanvasMouseDown(e) {
                if (!e.type.startsWith('touch') && e.button === 2) return;

                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const target = point.target;

                if (this.state.isEditingText) {
                    const clickedElement = target.closest('.slide-element');
                    if (!clickedElement || !this.state.selectedElementIds.includes(clickedElement.dataset.id)) {
                        this.app.stopTextEditing(true);
                    }
                    return;
                }

                const element = target.closest('.slide-element');
                const elementId = element ? element.dataset.id : null;
                const clickedGroup = elementId ? this.app._findGroupForElement(elementId) : null;

                let shouldStartInteraction = false;

                this.stateManager.change(doc => {
                    if (!doc.interaction) doc.interaction = {};
                    doc.interaction.isCtrlPressed = e.ctrlKey || e.metaKey;

                    if (clickedGroup) {
                        doc.selectedElementIds = [];
                        doc.selectedGroupIds = [clickedGroup.id];
                        doc.interaction.isDragging = true;
                        shouldStartInteraction = true;
                    } else if (elementId) {
                        const isSelected = doc.selectedElementIds.includes(elementId);
                        if (doc.interaction.isCtrlPressed) {
                            if (isSelected) {
                                doc.selectedElementIds = doc.selectedElementIds.filter(id => id !== elementId);
                            } else {
                                doc.selectedElementIds.push(elementId);
                            }
                        } else {
                            if (!isSelected) {
                                doc.selectedElementIds = [elementId];
                                this.app.switchToTab('inspector');
                            }
                        }
                        doc.selectedGroupIds = [];

                        if (target.classList.contains('resize-handle')) {
                            doc.interaction.isResizing = true;
                            doc.interaction.handle = target.dataset.handle;
                        } else {
                            doc.interaction.isDragging = true;
                        }
                        shouldStartInteraction = true;
                    } else {
                        doc.selectedElementIds = [];
                        doc.selectedGroupIds = [];
                    }
                });

                if (shouldStartInteraction) {
                    this.startInteraction(e);
                }
            }

            startInteraction(e) {
                this._boundHandleMouseMove = this.handleMouseMove.bind(this);
                this._boundHandleMouseUp = this.handleMouseUp.bind(this);
                window.addEventListener('mousemove', this._boundHandleMouseMove);
                window.addEventListener('touchmove', this._boundHandleMouseMove, { passive: false });
                window.addEventListener('mouseup', this._boundHandleMouseUp);
                window.addEventListener('touchend', this._boundHandleMouseUp);

                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const canvasRect = this.app.elements.slideCanvas.getBoundingClientRect();

                this.stateManager.change(doc => {
                    if (!doc.canvas) doc.canvas = {};
                    doc.canvas.rect = { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height, right: canvasRect.right, bottom: canvasRect.bottom, x: canvasRect.x, y: canvasRect.y };
                    if (!doc.interaction) doc.interaction = {};
                    doc.interaction.startX = point.clientX;
                    doc.interaction.startY = point.clientY;

                    let elementsToTrack = [];
                    if (doc.selectedGroupIds.length > 0) {
                        const slideGroups = doc.presentation.groups[doc.activeSlideId] || [];
                        doc.selectedGroupIds.forEach(groupId => {
                            const group = slideGroups.find(g => g.id === groupId);
                            if (group) {
                                elementsToTrack.push(...doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.filter(el => group.elementIds.includes(el.id)));
                            }
                        });
                    } else {
                        elementsToTrack = doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.filter(el => doc.selectedElementIds.includes(el.id));
                    }
                    
                    const allElementsPixelRects = doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.map(elData => {
                        const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (!domEl) {
                            return { id: elData.id, rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, centerX: 0, centerY: 0 } };
                        }
                        const rect = { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight };
                        rect.right = rect.left + rect.width;
                        rect.bottom = rect.top + rect.height;
                        rect.centerX = rect.left + rect.width / 2;
                        rect.centerY = rect.top + rect.height / 2;
                        return { id: elData.id, rect };
                    });

                    doc.interaction.initialStates = elementsToTrack.map(elData => {
                        const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (!domEl) return null;
                        
                        domEl.style.willChange = 'transform, width, height';
                        
                        if (elData.type === 'iframe') {
                            const iframeEl = domEl.querySelector('iframe');
                            if (iframeEl) iframeEl.style.pointerEvents = 'none';
                        }
                        
                        const foundRect = allElementsPixelRects.find(r => r.id === elData.id);
                        return {
                            id: elData.id,
                            startX: elData.style.left ?? 0,
                            startY: elData.style.top ?? 0,
                            startW: elData.style.width ?? 0,
                            startH: elData.style.height ?? (domEl.offsetHeight / canvasRect.height * 100),
                            initialRect: foundRect ? foundRect.rect : { left: 0, top: 0, width: 0, height: 0 },
                            _initialFontSize: elData.style.fontSize ?? null
                        };
                    }).filter(Boolean);

                    const selectedIds = new Set(doc.selectedElementIds);
                    doc.interaction.staticElementsBounds = allElementsPixelRects
                        .filter(el => !selectedIds.has(el.id))
                        .map(el => el.rect);
                }, { silent: true });
            }

            handleMouseMove(e) {
                const interaction = this.state.interaction;
                if (!interaction.isDragging && !interaction.isResizing) return;
                e.preventDefault();

                if (this._animationFrameId) return;

                this._animationFrameId = requestAnimationFrame(() => {
                    const isTouch = e.type.startsWith('touch');
                    if (isTouch && e.touches.length === 0) {
                        this._animationFrameId = null;
                        return;
                    }
                    const point = isTouch ? e.touches[0] : e;
                    const dx = point.clientX - interaction.startX;
                    const dy = point.clientY - interaction.startY;

                    this.stateManager.change(doc => {
                        doc.interaction.lastDx = dx;
                        doc.interaction.lastDy = dy;
                    }, { silent: true });

                    if (interaction.isDragging) {
                        this.handleDragMove(dx, dy);
                    } else if (interaction.isResizing) {
                        const scale = this.state.canvas.actualScale || 1;
                        const dxPercent = (dx / scale) / CANVAS_WIDTH * 100;
                        const dyPercent = (dy / scale) / CANVAS_HEIGHT * 100;
                        this.performResize(dxPercent, dyPercent);
                    }
                    this._animationFrameId = null;
                });
            }

            handleDragMove(dx, dy) {
                this.app.guideLineManager.clear();
                const interaction = this.state.interaction;
                const draggingElementsInitialStates = interaction.initialStates;
                const scale = this.state.canvas.actualScale || 1;
                const canvasWidth = CANVAS_WIDTH;
                const canvasHeight = CANVAS_HEIGHT;
                let snapOffset = { x: 0, y: 0 };
                let guides = [];
                const scaledDx = dx / scale;
                const scaledDy = dy / scale;

                if (this.app.isSnapEnabled()) {
                    const combinedBounds = draggingElementsInitialStates.reduce((acc, state) => {
                        const currentLeft = state.initialRect.left + scaledDx;
                        const currentTop = state.initialRect.top + scaledDy;
                        acc.left = Math.min(acc.left, currentLeft);
                        acc.top = Math.min(acc.top, currentTop);
                        acc.right = Math.max(acc.right, currentLeft + state.initialRect.width);
                        acc.bottom = Math.max(acc.bottom, currentTop + state.initialRect.height);
                        return acc;
                    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
                    combinedBounds.centerX = combinedBounds.left + (combinedBounds.right - combinedBounds.left) / 2;
                    combinedBounds.centerY = combinedBounds.top + (combinedBounds.bottom - combinedBounds.top) / 2;
                    
                    const staticElementsBounds = interaction.staticElementsBounds || [];
                    const canvasBounds = { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight, centerX: canvasWidth / 2, centerY: canvasHeight / 2 };
                    const snapResult = this.app.guideLineManager.calculateSnapGuides(combinedBounds, staticElementsBounds, canvasBounds);
                    snapOffset = snapResult.snapOffset;
                    guides = snapResult.guides;
                }

                this.stateManager.change(doc => { doc.interaction.lastSnapOffset = snapOffset; }, { silent: true });
                const elementsToUpdate = this.app.getSelectedElementsData();
                draggingElementsInitialStates.forEach(initialState => {
                    const elData = elementsToUpdate.find(el => el.id === initialState.id);
                    if (elData) {
                        const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (domEl) {
                            const finalDx = scaledDx + snapOffset.x;
                            const finalDy = scaledDy + snapOffset.y;
                            const rotation = elData.style.rotation || 0;
                            domEl.style.transform = `translate(${finalDx}px, ${finalDy}px) rotate(${rotation}deg)`;
                        }
                    }
                });

                this.app.renderSelectionBoundingBox();
                if (this.app.isSnapEnabled()) {
                    guides.forEach(g => { const [o, p] = g.split('-'); this.app.guideLineManager.addGuide(o, p); });
                }
            }

            handleMouseUp() {
                if (this._boundHandleMouseMove) {
                    window.removeEventListener('mousemove', this._boundHandleMouseMove);
                    window.removeEventListener('touchmove', this._boundHandleMouseMove);
                    this._boundHandleMouseMove = null;
                }
                if (this._boundHandleMouseUp) {
                    window.removeEventListener('mouseup', this._boundHandleMouseUp);
                    window.removeEventListener('touchend', this._boundHandleMouseUp);
                    this._boundHandleMouseUp = null;
                }

                const interaction = this.state.interaction;
                if (!interaction || (!interaction.isDragging && !interaction.isResizing)) return;

                this.stateManager.change(doc => {
                    const activeSlide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!activeSlide) return;

                    if (doc.isEditingText) {
                        doc.interaction.isDragging = false;
                        doc.interaction.isResizing = false;
                        return;
                    }

                    if (interaction.isDragging) {
                        const { lastDx, lastDy, lastSnapOffset, initialStates } = interaction;
                        const currentActualScale = doc.canvas?.actualScale || 1;
                        const finalDx = (lastDx / currentActualScale) + (lastSnapOffset?.x || 0);
                        const finalDy = (lastDy / currentActualScale) + (lastSnapOffset?.y || 0);

                        initialStates.forEach(initialState => {
                            const element = activeSlide.elements.find(el => el.id === initialState.id);
                            if (element) {
                                const newLeft = (initialState.startX || 0) + (finalDx / CANVAS_WIDTH * 100);
                                const newTop = (initialState.startY || 0) + (finalDy / CANVAS_HEIGHT * 100);
                                if (!isNaN(newLeft)) element.style.left = parseFloat(newLeft.toFixed(2));
                                if (!isNaN(newTop)) element.style.top = parseFloat(newTop.toFixed(2));
                            }
                        });
                    }

                    if (interaction.isResizing) {
                        const { handle, initialStates, lastDx, lastDy } = interaction;
                        const elId = doc.selectedElementIds[0];
                        const initialState = initialStates[0];
                        const element = activeSlide.elements.find(el => el.id === elId);

                        if (element && initialState) {
                            const scale = doc.canvas?.actualScale || 1;
                            const dxPercent = (lastDx / scale) / CANVAS_WIDTH * 100;
                            const dyPercent = (lastDy / scale) / CANVAS_HEIGHT * 100;
                            const finalStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent, interaction);

                            if (!isNaN(finalStyles.newLeft)) element.style.left = finalStyles.newLeft;
                            if (!isNaN(finalStyles.newTop)) element.style.top = finalStyles.newTop;
                            if (!isNaN(finalStyles.newWidth)) element.style.width = finalStyles.newWidth;
                            if (finalStyles.newHeight != null && !isNaN(finalStyles.newHeight)) element.style.height = finalStyles.newHeight;
                            if (finalStyles.newFontSize && !isNaN(finalStyles.newFontSize)) element.style.fontSize = finalStyles.newFontSize;
                        }
                    }

                    this.app.guideLineManager.clear();
                    doc.interaction.isDragging = false;
                    doc.interaction.isResizing = false;
                    doc.interaction.initialStates = [];
                    doc.interaction.staticElementsBounds = [];
                    doc.interaction.lastDx = 0;
                    doc.interaction.lastDy = 0;
                    doc.interaction.lastSnapOffset = { x: 0, y: 0 };
                });

                this.state.selectedElementIds.forEach(id => {
                    const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${id}"]`);
                    if (domEl) {
                        domEl.style.willChange = 'auto';
                        const elData = this.app.getActiveSlide().elements.find(el => el.id === id);
                        if (elData && elData.type === 'iframe') {
                            const iframeEl = domEl.querySelector('iframe');
                            if (iframeEl) iframeEl.style.pointerEvents = 'auto';
                        }
                    }
                });
            }

            performResize(dxPercent, dyPercent) {
                const interaction = this.state.interaction;
                const { handle, initialStates } = interaction;
                const elData = this.app.getSelectedElement();
                const initialState = initialStates[0];
                if (!elData || !initialState) return;

                this.app.guideLineManager.clear();
                const newStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent, interaction);

                if (newStyles.snapResult.snapped) {
                    const scale = this.state.canvas.actualScale || 1;
                    newStyles.snapResult.guides.forEach(guideInfo => {
                        this.app.guideLineManager.drawSizeMatchGuide(guideInfo, scale);
                    });
                }

                const domEl = this.app.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                if (domEl) {
                    const rotation = elData.style.rotation || 0;
                    domEl.style.width = `${newStyles.newWidth}%`;
                    if (newStyles.newHeight != null) domEl.style.height = `${newStyles.newHeight}%`;
                    const finalDxPercent = newStyles.newLeft - initialState.startX;
                    const finalDyPercent = newStyles.newTop - initialState.startY;
                    const translateXPx = Utils.percentToPixels(finalDxPercent, CANVAS_WIDTH);
                    const translateYPx = Utils.percentToPixels(finalDyPercent, CANVAS_HEIGHT);
                    domEl.style.transform = `translate(${translateXPx}px, ${translateYPx}px) rotate(${rotation}deg)`;
                    if (newStyles.newFontSize) {
                        const fontSizer = domEl.querySelector('i, span, div');
                        if(fontSizer) fontSizer.style.fontSize = `${newStyles.newFontSize}px`;
                    }
                }
                this.app.renderSelectionBoundingBox();
            }

            _calculateResize(handle, initialState, dxPercent, dyPercent, interaction) {
                const { startX, startY, startW, startH } = initialState;
                let newLeft = startX, newTop = startY, newWidth = startW, newHeight = startH;

                if (handle.includes('e')) newWidth = Math.max(2, startW + dxPercent);
                if (handle.includes('w')) { newWidth = Math.max(2, startW - dxPercent); newLeft = startX + dxPercent; }
                if (handle.includes('s')) newHeight = startH != null ? Math.max(2, startH + dyPercent) : null;
                if (handle.includes('n')) { newHeight = startH != null ? Math.max(2, startH - dyPercent) : null; newTop = startY + dyPercent; }

                if (isNaN(newLeft)) newLeft = startX;
                if (isNaN(newTop)) newTop = startY;
                if (isNaN(newWidth)) newWidth = startW;
                if (isNaN(newHeight)) newHeight = startH;

                const elData = this.app.getSelectedElement();
                if (elData.type === 'icon' && startW > 0.001 && startH > 0.001) {
                    const ratio = startH / startW;
                    if (newWidth !== startW) newHeight = newWidth * ratio;
                    else if (newHeight !== startH && ratio > 0.001) newWidth = newHeight / ratio;
                }

                let newFontSize = null;
                if ((elData.type === 'text' || elData.type === 'icon') && startW > 0 && newWidth !== startW) {
                    const initialFontSize = initialState._initialFontSize ?? elData.style.fontSize;
                    if (typeof initialFontSize === 'number') {
                        newFontSize = Math.max(8, Math.round(initialFontSize * (newWidth / startW)));
                    }
                }

                const snapResult = { snapped: false, guides: [] };
                if (this.app.isSnapEnabled() && interaction) {
                    const newWidthLogicalPx = Utils.percentToPixels(newWidth, CANVAS_WIDTH);
                    const newHeightLogicalPx = newHeight != null ? Utils.percentToPixels(newHeight, CANVAS_HEIGHT) : null;
                    const staticElementsRects = interaction.staticElementsBounds;

                    for (const staticElRect of staticElementsRects) {
                        const staticWidthLogicalPx = staticElRect.width;
                        const staticHeightLogicalPx = staticElRect.height;

                        if (Math.abs(newWidthLogicalPx - staticWidthLogicalPx) < CONFIG.SNAP_THRESHOLD) {
                            const snappedWidthPercent = Utils.pixelsToPercent(staticWidthLogicalPx, CANVAS_WIDTH);
                            if (handle.includes('w')) newLeft = startX + (startW - snappedWidthPercent);
                            newWidth = snappedWidthPercent;
                            snapResult.guides.push({ type: 'width', elementAId: elData.id, elementBId: staticElRect.id, handle });
                            snapResult.snapped = true;
                        }

                        if (newHeightLogicalPx != null && Math.abs(newHeightLogicalPx - staticHeightLogicalPx) < CONFIG.SNAP_THRESHOLD) {
                            const snappedHeightPercent = Utils.pixelsToPercent(staticHeightLogicalPx, CANVAS_HEIGHT);
                            if (handle.includes('n')) newTop = startY + (startH - snappedHeightPercent);
                            newHeight = snappedHeightPercent;
                            snapResult.guides.push({ type: 'height', elementAId: elData.id, elementBId: staticElRect.id, handle });
                            snapResult.snapped = true;
                        }
                        if (snapResult.snapped) break;
                    }
                }
                return { newLeft, newTop, newWidth, newHeight, newFontSize, snapResult };
            }

            handleCanvasDblClick(e) {
                const event = (typeof e.preventDefault === "function") ? e : null;
                const target = e.target || e;
                const element = target.closest('.slide-element.text');
                if (!element) return;
                
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                
                this.app.stopTextEditing(true);
                
                this.stateManager.change(doc => {
                    doc.selectedElementIds = [element.dataset.id];
                    doc.isEditingText = true;
                });
                
                this.app.elements.slideCanvas.querySelectorAll('.slide-element[contenteditable="true"]').forEach(el => el.setAttribute('contenteditable', 'false'));
                element.setAttribute('contenteditable', 'true');
                element.style.cursor = 'text';
                
                requestAnimationFrame(() => {
                    element.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    if (this.state.selectedElementIds.length > 0) {
                        this.app.switchToTab('inspector');
                        this.app.renderInspector();
                    }
                });
            }
        }

        // =================================================================
        // App: メインアプリケーション（リファクタリング版）
        // =================================================================
        const App = window.App = { // Appオブジェクトをグローバルに公開
            stateManager: null,
            slideId: null,
            
            get state() {
                return this.stateManager ? this.stateManager.get() : {};
            },
            
            elements: {},
            config: {},
            guideLineManager: null,
            domElementCache: new Map(),
            thumbnailCache: new Map(),
            _animationFrameId: null,
            _sidebarCloseHandler: null,
            interactionManager: null,

            applyStyles(element, styles) {
                StyleManager.applyStyles(element, styles);
            },

            async init() {
                try {
                    // Automerge WASMの初期化
                    await Automerge.initializeWasm(
                        fetch("https://esm.sh/@automerge/automerge@3.1.1/dist/automerge.wasm")
                    );

                    this.interactionManager = new InteractionManager(this);

                    const pathParts = window.location.pathname.split('/');
                    this.slideId = pathParts.pop() || pathParts.pop(); // 末尾が空文字列の場合を考慮
                    if (!this.slideId) {
                        console.error("Slide ID not found in URL, defaulting to 1");
                        this.slideId = '1';
                    }

                    this.stateManager = new StateManager();
                    
                    // スライドIDが不正(例: 'slide')のときもそのまま接続を試みると404/再接続ループになる。
                    // ここではフェールセーフとして、存在しない/短いIDには新規IDを払い出して使用する。
                    let safeSlideId = this.slideId;
                    if (!safeSlideId || safeSlideId.length < 8) {
                        safeSlideId = `s-${Date.now().toString(16)}${Math.random().toString(36).slice(2,10)}`;
                        const newUrl = `/slide/${safeSlideId}${window.location.search}${window.location.hash}`;
                        window.location.href = newUrl; // ハードリロード
                        return; // リロードするので、以降の処理は中断
                    }

                    // 1. Load state from server or create a new one
                    await this.stateManager.load(safeSlideId);

                    // 2. Now that the slide is guaranteed to exist on the server, connect WebSocket
                    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    const wsUrl = `${wsProtocol}//${window.location.host}/ws/collaborate/${safeSlideId}`;
                    // WebSocketClient から ensure 用に参照できるよう、slideId を保持
                    this.stateManager.slideId = safeSlideId;
                    this.webSocketClient = new WebSocketClient(wsUrl, this.stateManager);
                    
                    // 3. Set up the change listener to send updates via WebSocket
                    this.stateManager.setOnChange((changes) => {
                        this.webSocketClient.send(changes);
                    });

                    // 4. Initialize UI and other components
                    this._initializeStateListeners();
                    
                    this.cacheElements();
                    this.guideLineManager = new GuideLineManager(this.elements.slideCanvas);
                    this.presentationManager = new PresentationManager(this);
                    this.iconManager = new IconManager(this);
                    this.inspectorManager = new InspectorManager(this);
                    
                    // 並列実行で初期化を高速化
                    await Promise.all([
                        this.iconManager.loadIconData(),
                        this.loadCssProperties()
                    ]);
                    
                    this._bindQrModalUrlSafety();
                    this._bindEmbedModalUrlSafety();

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
                    
                    this.bindEvents();
                    this._initPresentMenu();
                    this._autoStartIfPopup();
                    this.render();
                    this.initZoomControl();
                    
                    if (window.developmentMode) {
                        console.log('App initialized successfully');
                    }
                    
                    // 初期化完了イベントを発火
                    window.dispatchEvent(new CustomEvent('app-initialized'));
                } catch (error) {
                    ErrorHandler.handle(error, 'app_initialization');
                }
            },

            _initializeStateListeners() {
                // Automergeでは、ドキュメント全体が変更されたときに通知が来る
                this.stateManager.subscribe('*', (newDoc) => {
                    this.render();
                });
            },

            // StateManagerを使った状態更新メソッド
            updateState(callbackOrPath, maybeValueOrOpts = undefined, maybeOpts = undefined) {
                // オーバーロード:
                // 1) updateState(doc => { ... }, { message? })
                // 2) updateState('a.b.c', value, { message? })
                if (typeof callbackOrPath === 'function') {
                    const opts = (maybeValueOrOpts && typeof maybeValueOrOpts === 'object' && !Array.isArray(maybeValueOrOpts)) ? maybeValueOrOpts : {};
                    if (!this.stateManager) {
                        console.warn('StateManager is not initialized yet');
                        return;
                    }
                    this.stateManager.change(callbackOrPath, opts);
                    return;
                }
                if (typeof callbackOrPath === 'string') {
                    const path = callbackOrPath;
                    const value = maybeValueOrOpts;
                    const opts = (maybeOpts && typeof maybeOpts === 'object') ? maybeOpts : {};
                    if (!this.stateManager) {
                        console.warn('StateManager is not initialized yet');
                        return;
                    }
                    this.stateManager.change(doc => {
                        const keys = path.split('.');
                        let cur = doc;
                        const last = keys.pop();
                        for (const k of keys) {
                            if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
                            cur = cur[k];
                        }
                        cur[last] = value;
                    }, opts);
                    return;
                }
                console.warn('updateState called with unsupported arguments', arguments);
            },

            getState(path) {
                if (!this.stateManager) {
                    console.warn(`StateManager not ready, cannot get path: ${path}`);
                    return undefined;
                }
                return this.stateManager.get(path);
            },

            // batchUpdateStateはupdateStateに統合
            batchUpdateState(updates, options = {}) {
                this.updateState(doc => {
                    for (const [path, value] of Object.entries(updates)) {
                        const keys = path.split('.');
                        let current = doc;
                        const lastKey = keys.pop();
                        for (const key of keys) {
                            if(!current[key]) current[key] = {};
                            current = current[key];
                        }
                        current[lastKey] = value;
                    }
                });
            },


            // DOM要素のキャッシュ - 整理版
            cacheElements() {
                this.elements = {
                    // メインコンテナ
                    appContainer: document.getElementById('app-container'),
                    toolbar: document.getElementById('toolbar'),
                    appBody: document.getElementById('app-body'),
                    leftSidebar: document.getElementById('left-sidebar'),
                    mobileNavBar: document.getElementById('mobile-nav-bar'),
                    rightSidebar: document.getElementById('right-sidebar'),
                    mainCanvasArea: document.getElementById('main-canvas-area'),
                    
                    // サイドバー関連
                    sidebarTabs: document.getElementById('sidebar-tabs'),
                    sidebarContent: document.getElementById('sidebar-content'),
                    inspector: document.getElementById('inspector'),
                    noSelectionMessage: document.getElementById('no-selection-message'),
                    chatPanel: document.getElementById('chat-panel'),

                    // モバイルナビゲーションバーのボタンをキャッシュ
                    mobileNavInspectorBtn: document.querySelector('#mobile-nav-bar button[data-tab="inspector"]'),
                    mobileNavElementsBtn: document.querySelector('#mobile-nav-bar button[data-tab="elements"]'),
                    mobileNavIconsBtn: document.querySelector('#mobile-nav-bar button[data-tab="icons"]'),
                    mobileNavChatBtn: document.querySelector('#mobile-nav-bar button[data-tab="chat"]'),
                    mobileNavPageSettingsBtn: document.querySelector('#mobile-nav-bar button[data-tab="page-settings"]'),
                    mobileNavSettingsBtn: document.querySelector('#mobile-nav-bar button[data-tab="settings"]'),
                    // ツールバーボタン
                    addSlideBtn: document.getElementById('add-slide-btn'),
                    deleteSlideBtn: document.getElementById('delete-slide-btn'),
                    undoBtn: document.getElementById('undo-btn'),
                    redoBtn: document.getElementById('redo-btn'),
                    saveBtn: document.getElementById('save-btn'),
                    presentBtn: document.getElementById('present-btn'),
                    exportBtn: document.getElementById('export-btn'),
                    exportMenu: document.getElementById('export-menu'),
                    presentMenu: document.getElementById('present-menu'),
                    
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
                    tidyUpBtn: document.getElementById('tidy-up-btn'),
                    tidyUpBtn: document.getElementById('tidy-up-btn'),
                    
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

                    // ページ設定
                    pageBgColorInput: document.getElementById('page-bg-color-input'),
                    backgroundTypeSelector: document.getElementById('background-type-selector'),
                    solidColorSettings: document.getElementById('solid-color-settings'),
                    gradientSettings: document.getElementById('gradient-settings'),
                    gradientStartColor: document.getElementById('gradient-start-color'),
                    gradientEndColor: document.getElementById('gradient-end-color'),
                    gradientAngle: document.getElementById('gradient-angle'),
                    gradientAngleValue: document.getElementById('gradient-angle-value'),
                    pageBgColorPickerContainer: document.getElementById('page-bg-color-picker-container'),

                    // Wikipedia Image Search
                    wikiImageSearchInput: document.getElementById('wiki-image-search-input'),
                    wikiImageSearchBtn: document.getElementById('wiki-image-search-btn'),
                    wikiImageResultsContainer: document.getElementById('wiki-image-results-container'),
                    wikiImageLoading: document.getElementById('wiki-image-loading'),
                };
            },


            saveState() {
                // AutomergeとWebSocketによるリアルタイム同期アーキテクチャでは、
                // 変更は即座に送信・永続化されるため、この手動保存メソッドは不要です。
                // UIからの呼び出しは削除されています。
                console.log("Manual save is deprecated. Changes are sent automatically.");
            },

            createNewPresentation() {
                this.stateManager.createInitialDoc();
            },

            render() {
                if (!this.state.presentation) return;
                
                requestAnimationFrame(() => {
                    try {
                        this.renderThumbnails();
                        this.renderSlideCanvas();

                        const inspectorHasFocus = document.activeElement && this.elements.inspector.contains(document.activeElement);

                        if (!inspectorHasFocus) {
                            if (this.state.selectedElementIds.length === 0) {
                                // 要素が選択されていない場合、もし「設定」タブが開いていたらインスペクターをクリア表示
                                const inspectorTabButton = this.elements.sidebarTabs.querySelector('.sidebar-tab-button[data-tab="inspector"]');
                                if (inspectorTabButton && inspectorTabButton.classList.contains('active')) {
                                    this.renderInspector();
                                }
                            }
                        }
                        this.updateToolbarState();
                        this.applyCustomCss();
                        this.applyPageBackground();
                    } catch (error) {
                        ErrorHandler.handle(error, 'render');
                    }
                });
            },

            // Helper function to switch sidebar tabs programmatically
            switchToTab(tabName) {
                if (!this.elements.sidebarContent) return;

                // 既存のクローズハンドラを常に削除
                if (this._sidebarCloseHandler) {
                    document.removeEventListener('click', this._sidebarCloseHandler);
                    this._sidebarCloseHandler = null;
                }

                const sidebarContent = this.elements.sidebarContent;
                const targetContent = sidebarContent.querySelector(`.sidebar-tab-content[data-tab-content="${tabName}"]`);
                const isAlreadyActive = targetContent && targetContent.classList.contains('active');
                
                // 一旦すべて非表示
                sidebarContent.querySelectorAll('.sidebar-tab-content').forEach(c => c.classList.remove('active'));
                this.elements.sidebarTabs.querySelectorAll('.sidebar-tab-button').forEach(b => b.classList.remove('active'));
                this.elements.mobileNavBar.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));

                if (isAlreadyActive) {
                    // 同じタブを再度クリックした場合 -> 閉じる
                    sidebarContent.classList.remove('active');
                } else {
                    // 新しいタブを開く
                    if (targetContent) {
                        targetContent.classList.add('active');
                        sidebarContent.classList.add('active');
                        
                        const desktopBtn = this.elements.sidebarTabs.querySelector(`[data-tab="${tabName}"]`);
                        if (desktopBtn) desktopBtn.classList.add('active');
                        
                        const mobileBtn = this.elements.mobileNavBar.querySelector(`[data-tab="${tabName}"]`);
                        if (mobileBtn) mobileBtn.classList.add('active');

                        // --- 新しいクローズハンドラを登録 ---
                        this._sidebarCloseHandler = (e) => {
                            // クリックがサイドバーコンテンツ、またはモバイルナビバー自身でなければ閉じる
                            if (!sidebarContent.contains(e.target) && !this.elements.mobileNavBar.contains(e.target)) {
                                sidebarContent.classList.remove('active');
                                if(mobileBtn) mobileBtn.classList.remove('active');
                                if(desktopBtn) desktopBtn.classList.remove('active');

                                document.removeEventListener('click', this._sidebarCloseHandler);
                                this._sidebarCloseHandler = null;
                            }
                        };
                        setTimeout(() => document.addEventListener('click', this._sidebarCloseHandler), 0);
                        
                        // --- コンテンツの初期化 ---
                        if (tabName === 'inspector') {
                            this.renderInspector();
                        } else if (tabName === 'page-settings') {
                            this.initGlobalCssEditor();
                        }
                    }
                }
            },

            // --- URL安全チェック: QRモーダル/埋め込みモーダル連携 ---
            _bindQrModalUrlSafety() {
                const input = document.getElementById('qr-text');
                const warning = document.getElementById('qr-warning');
                const form = document.getElementById('qr-create-form');
                if (!input || !warning || !form) return;
                
                let lastChecked = '';
                let controller = null;
                
                const setState = (status, detail) => {
                    // status: 'safe' | 'blocked' | 'invalid' | 'error'
                    const color = status === 'safe' ? '#155724'
                                : status === 'blocked' ? '#721c24'
                                : status === 'invalid' ? '#721c24'
                                : '#856404';
                    const bg = status === 'safe' ? '#d4edda'
                                : status === 'blocked' ? '#f8d7da'
                                : status === 'invalid' ? '#f8d7da'
                                : '#fff3cd';
                    warning.style.padding = '8px 10px';
                    warning.style.borderRadius = '6px';
                    warning.style.border = '1px solid rgba(0,0,0,0.08)';
                    warning.style.background = bg;
                    warning.style.color = color;
                    warning.innerHTML = detail || '';
                    const submitBtn = form.querySelector('.qr-submit-btn');
                    if (submitBtn) {
                        submitBtn.disabled = (status !== 'safe') && input.value.trim().startsWith('http');
                    }
                };
                
                const evaluate = Utils.debounce(async () => {
                    const val = input.value.trim();
                    if (!val) { warning.innerHTML = ''; return; }
                    // URLでない任意文字列はQR生成OK（安全チェック対象はURLのみ）
                    let urlCandidate = null;
                    try {
                        if (/^https?:/i.test(val)) {
                            urlCandidate = new URL(val).toString();
                        }
                    } catch (_) {}
                    
                    if (!urlCandidate) {
                        setState('safe', 'テキストとしてQRを生成します。');
                        return;
                    }
                    
                    // キャンセル制御
                    if (controller) controller.abort();
                    controller = new AbortController();
                    lastChecked = urlCandidate;
                    
                    setState('error', '安全性を確認しています...');
                    const result = await Utils.checkUrlSafety(urlCandidate, { signal: controller.signal });
                    if (lastChecked !== urlCandidate) return; // outdated
                    
                    if (result.safe) {
                        setState('safe', '安全なURLです。');
                    } else if (result.reason === 'invalid_url') {
                        setState('invalid', '無効なURLです。');
                    } else if (result.reason === 'matched') {
                        const md = result.matched_domain ? `（${result.matched_domain} / ${result.source}）` : '';
                        setState('blocked', `危険なURLとしてブロックリストに一致しました ${md}`);
                    } else {
                        setState('error', '安全性の確認に失敗しました。時間をおいて再試行してください。');
                    }
                }, 400);
                
                input.addEventListener('input', evaluate);
                
                form.addEventListener('submit', async (e) => {
                    const val = input.value.trim();
                    let urlCandidate = null;
                    try { if (/^https?:/i.test(val)) urlCandidate = new URL(val).toString(); } catch(_){}
                    if (!urlCandidate) return; // テキストQRは許可
                    
                    const submitBtn = form.querySelector('.qr-submit-btn');
                    if (submitBtn) submitBtn.disabled = true;
                    const result = await Utils.checkUrlSafety(urlCandidate);
                    if (!result.safe) {
                        e.preventDefault();
                        if (result.reason === 'matched') {
                            const md = result.matched_domain ? `（${result.matched_domain} / ${result.source}）` : '';
                            setState('blocked', `危険なURLとしてブロックリストに一致しました ${md}`);
                        } else if (result.reason === 'invalid_url') {
                            setState('invalid', '無効なURLです。');
                        } else {
                            setState('error', '安全性の確認に失敗しました。');
                        }
                        if (submitBtn) submitBtn.disabled = false;
                    } else {
                        if (submitBtn) submitBtn.disabled = false;
                    }
                });
            },
            
            _bindEmbedModalUrlSafety() {
                // 簡易版
                const simple = {
                    input: document.getElementById('embed-url-input-simple'),
                    preview: document.getElementById('embed-preview-simple'),
                    insertBtn: document.getElementById('embed-insert-btn-simple')
                };
                // 上級版
                const adv = {
                    input: document.getElementById('embed-url-input-advanced'),
                    preview: document.getElementById('embed-preview-advanced'),
                    insertBtn: document.getElementById('embed-insert-btn-advanced')
                };
                
                const bind = ({ input, preview, insertBtn }) => {
                    if (!input || !preview || !insertBtn) return;
                    let lastChecked = '';
                    let controller = null;
                    const msgId = input.id + '-safety-msg';
                    let msg = document.getElementById(msgId);
                    if (!msg) {
                        msg = document.createElement('div');
                        msg.id = msgId;
                        msg.style.marginTop = '6px';
                        msg.style.fontSize = '13px';
                        input.insertAdjacentElement('afterend', msg);
                    }
                    
                    const setMsg = (status, text) => {
                        const color = status === 'safe' ? '#155724'
                                    : status === 'blocked' ? '#721c24'
                                    : status === 'invalid' ? '#721c24'
                                    : '#856404';
                        const bg = status === 'safe' ? '#d4edda'
                                    : status === 'blocked' ? '#f8d7da'
                                    : status === 'invalid' ? '#f8d7da'
                                    : '#fff3cd';
                        msg.style.padding = '6px 8px';
                        msg.style.borderRadius = '6px';
                        msg.style.border = '1px solid rgba(0,0,0,0.08)';
                        msg.style.background = bg;
                        msg.style.color = color;
                        msg.textContent = text;
                    };
                    
                    const setPreviewSrc = (url) => {
                        try {
                            const u = new URL(url, window.location.href);
                            const redirectUrl = `/redirect?url=${encodeURIComponent(u.toString())}`;
                            preview.src = redirectUrl;
                        } catch {
                            preview.src = '';
                        }
                    };
                    
                    const evaluate = Utils.debounce(async () => {
                        const val = input.value.trim();
                        if (!val) { msg.textContent = ''; preview.src=''; insertBtn.disabled = true; return; }
                        let urlCandidate = null;
                        try { if (/^https?:/i.test(val)) urlCandidate = new URL(val).toString(); } catch(_){}
                        if (!urlCandidate) {
                            setMsg('invalid', '有効なURLを入力してください。');
                            preview.src = '';
                            insertBtn.disabled = true;
                            return;
                        }
                        
                        if (controller) controller.abort();
                        controller = new AbortController();
                        lastChecked = urlCandidate;
                        setMsg('error', '安全性を確認しています...');
                        
                        const result = await Utils.checkUrlSafety(urlCandidate, { signal: controller.signal });
                        if (lastChecked !== urlCandidate) return;
                        
                        if (result.safe) {
                            setMsg('safe', '安全なURLです。プレビューを表示します。');
                            setPreviewSrc(urlCandidate);
                            insertBtn.disabled = false;
                        } else if (result.reason === 'invalid_url') {
                            setMsg('invalid', '無効なURLです。');
                            preview.src = '';
                            insertBtn.disabled = true;
                        } else if (result.reason === 'matched') {
                            const md = result.matched_domain ? `（${result.matched_domain} / ${result.source}）` : '';
                            setMsg('blocked', `危険なURLとしてブロックリストに一致しました ${md}`);
                            preview.src = '';
                            insertBtn.disabled = true;
                        } else {
                            setMsg('error', '安全性の確認に失敗しました。時間をおいて再試行してください。');
                            preview.src = '';
                            insertBtn.disabled = true;
                        }
                    }, 400);
                    
                    input.addEventListener('input', evaluate);
                    
                    insertBtn.addEventListener('click', async (e) => {
                        const val = input.value.trim();
                        let urlCandidate = null;
                        try { if (/^https?:/i.test(val)) urlCandidate = new URL(val).toString(); } catch(_){}
                        if (!urlCandidate) {
                            e.preventDefault();
                            setMsg('invalid', '無効なURLです。');
                            return;
                        }
                        insertBtn.disabled = true;
                        const result = await Utils.checkUrlSafety(urlCandidate);
                        if (!result.safe) {
                            e.preventDefault();
                            if (result.reason === 'matched') {
                                const md = result.matched_domain ? `（${result.matched_domain} / ${result.source}）` : '';
                                setMsg('blocked', `危険なURLとしてブロックリストに一致しました ${md}`);
                            } else if (result.reason === 'invalid_url') {
                                setMsg('invalid', '無効なURLです。');
                            } else {
                                setMsg('error', '安全性の確認に失敗しました。');
                            }
                            insertBtn.disabled = false;
                        } else {
                            insertBtn.disabled = false;
                        }
                    });
                };
                
                bind(simple);
                bind(adv);
            },
            
            _initPresentMenu() {
                const btn = this.elements.presentBtn;
                const menu = this.elements.presentMenu;
                if (!btn || !menu) return;

                // Presentation API 対応可否で項目表示を切替
                const hasPresentationApi = ('presentation' in navigator) &&
                    !!(navigator.presentation && (typeof navigator.presentation.requestStart === 'function' || typeof navigator.presentation.requestSession === 'function'));
                const apiItem = menu.querySelector('.present-api-only');
                if (apiItem) apiItem.style.display = hasPresentationApi ? '' : 'none';

                const toggleMenu = (e) => {
                    e.stopPropagation();
                    const rect = btn.getBoundingClientRect();
                    menu.style.left = `${rect.left}px`;
                    menu.style.top = `${rect.bottom + 6}px`;
                    menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
                };

                const hideMenu = () => { if (menu.style.display === 'block') menu.style.display = 'none'; };

                // 既存のpresentBtnに紐づく「即座にstartPresentationを呼ぶ」ハンドラがあれば抑止するため、既存clickは一旦無効化
                // addEventListenerで積まれている可能性はあるが、ここではデフォルト動作をpreventする専用ハンドラを先に登録
                btn.addEventListener('click', (ev) => {
                    // 既存のinline onClick等をブロック
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    toggleMenu(ev);
                }, { capture: true });

                // 通常の外側クリックで閉じる
                document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && e.target !== btn) hideMenu();
                });

                // メニュー項目クリック
                menu.addEventListener('click', async (e) => {
                    const item = e.target.closest('.present-menu-item');
                    if (!item) return;
                    hideMenu();
                    const mode = item.dataset.mode;
                    try {
                        if (mode === 'fullscreen') {
                            this.presentationManager.startPresentation();
                        } else if (mode === 'popup') {
                            // 新規ウィンドウを開き、子ウィンドウ側で自動開始（postMessage 併用で堅牢化）
                            const url = new URL(window.location.href);
                            url.hash = 'present';
                            const child = window.open(url.toString(), 'presentation', 'popup=1,width=1280,height=720');
                            if (!child) {
                                ErrorHandler.showNotification('ポップアップがブロックされました。ブラウザのポップアップ許可を有効にしてください。', 'error');
                                return;
                            }
                            // 子の ready を待って開始指示を送る（5秒タイムアウト）
                            const origin = window.location.origin;
                            let resolved = false;
                            const onReady = (ev) => {
                                try {
                                    if (ev.source === child && ev.data === 'PRESENT_WINDOW_READY') {
                                        resolved = true;
                                        window.removeEventListener('message', onReady);
                                        child.postMessage('START_PRESENTATION', origin);
                                    }
                                } catch(_) {}
                            };
                            window.addEventListener('message', onReady);
                            setTimeout(() => {
                                if (!resolved) {
                                    window.removeEventListener('message', onReady);
                                    ErrorHandler.showNotification('新しいウィンドウの起動に時間がかかっています。ウィンドウが表示されたら再試行してください。', 'warning');
                                }
                            }, 5000);
                        } else if (mode === 'external') {
                            if (!hasPresentationApi) {
                                ErrorHandler.showNotification('このブラウザはPresentation APIに対応していません', 'error');
                                return;
                            }
                            await this.presentationManager.startExternalDisplay();
                        }
                    } catch (err) {
                        ErrorHandler.handle(err, 'presentation_start');
                    }
                });

                // Presentation API セッション断のリカバリ監視（簡易）
                if (hasPresentationApi && navigator.presentation && navigator.presentation.defaultRequest) {
                    try {
                        navigator.presentation.defaultRequest.onconnectionavailable = (event) => {
                            // 接続が復帰した時のハンドリング（必要なら同期メッセージ）
                            if (window.developmentMode) console.log('Presentation connection available', event);
                        };
                    } catch (_) {}
                }
            },

            _autoStartIfPopup() {
                // 子ウィンドウ: 親へ READY 通知
                try {
                    window.opener && window.opener.postMessage('PRESENT_WINDOW_READY', window.location.origin);
                } catch(_) {}
                // ハッシュが付いていれば従来通り自動開始
                if (window.location.hash === '#present') {
                    try {
                        this.presentationManager.startPresentation();
                    } catch (err) {
                        ErrorHandler.handle(err, 'presentation_autostart');
                    }
                }
                // 親からの開始指示を待ち受け（postMessage 経由のフォールバック）
                window.addEventListener('message', (ev) => {
                    try {
                        if (ev.source === window.opener && ev.data === 'START_PRESENTATION') {
                            this.presentationManager.startPresentation();
                        }
                    } catch(_) {}
                });
            },

            updateToolbarState() {
                const selectedElementCount = this.state.selectedElementIds.length;
                const selectedGroupCount = this.state.selectedGroupIds.length;

                const singleSelectedElement = selectedElementCount === 1 ? this.getSelectedElement() : null;
                const isSingleText = singleSelectedElement && singleSelectedElement.type === 'text';

                // 水平方向の整列ボタン
                const hAlignButtons = [this.elements.alignLeftBtn, this.elements.alignCenterHBtn, this.elements.alignRightBtn];
                hAlignButtons.forEach(btn => {
                    btn.disabled = !(selectedElementCount >= 2 || isSingleText);
                });

                // 垂直方向の整列ボタン
                const vAlignButtons = [this.elements.alignTopBtn, this.elements.alignCenterVBtn, this.elements.alignBottomBtn];
                vAlignButtons.forEach(btn => {
                    btn.disabled = selectedElementCount < 2;
                });
                
                const distributeButtons = [this.elements.distributeHBtn, this.elements.distributeVBtn];
                distributeButtons.forEach(btn => btn.disabled = selectedElementCount < 3);

                // Group/Ungroup buttons
                this.elements.groupBtn.disabled = selectedElementCount < 2;
                this.elements.ungroupBtn.disabled = selectedGroupCount === 0;

                // Undo/Redo buttons
                this.elements.undoBtn.disabled = !this.stateManager.canUndo();
                this.elements.redoBtn.disabled = !this.stateManager.canRedo();
            },

            _createThumbnailElement(slide, settings) {
                const li = document.createElement('li');
                li.dataset.slideId = slide.id;
                li.dataset.id = slide.id; // for dblclick
                li.draggable = true;
                li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', slide.id); li.classList.add('dragging'); });
                li.addEventListener('dragend', () => li.classList.remove('dragging'));
                li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
                li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
                li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('drag-over'); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== slide.id) this.moveSlide(fromId, slide.id); });
                li.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showSlideContextMenu(e, slide.id); });

                const wrapper = document.createElement('div');
                wrapper.className = 'slide-thumbnail-wrapper';
                const content = document.createElement('div');
                content.className = 'slide-thumbnail-content';
                const indexSpan = document.createElement('span');
                indexSpan.className = 'thumbnail-index';

                const aspectRatio = settings.height / settings.width;
                wrapper.style.paddingTop = `${aspectRatio * 100}%`;

                wrapper.appendChild(content);
                li.appendChild(indexSpan);
                li.appendChild(wrapper);
                
                return li;
            },

            renderThumbnails() {
                const { slides, settings } = this.state.presentation;
                const slideList = this.elements.slideList;
                const activeSlideId = this.state.activeSlideId;

                // 1. 現在のDOM要素をIDをキーにしたMapとして取得
                const existingDoms = new Map();
                slideList.querySelectorAll('.slide-thumbnail[data-slide-id]').forEach(el => {
                    // 'add-slide' ボタンは除外
                    if (el.dataset.slideId) {
                        existingDoms.set(el.dataset.slideId, el);
                    }
                });

                const slideIdOrder = slides.map(s => s.id);
                const newSlideIds = new Set(slideIdOrder);

                // 2. 不要なDOMを削除
                for (const [id, dom] of existingDoms.entries()) {
                    if (!newSlideIds.has(id)) {
                        if (this.thumbnailObserver) {
                            this.thumbnailObserver.unobserve(dom);
                        }
                        dom.remove();
                        this.thumbnailCache.delete(id);
                    }
                }

                // 3. スライドの更新と順序の並び替え
                let lastElement = null;
                slides.forEach((slide, index) => {
                    let li = existingDoms.get(slide.id);

                    if (li) {
                        // --- 既存要素の更新 ---
                        li.className = `slide-thumbnail ${slide.id === activeSlideId ? 'active' : ''}`;
                        li.querySelector('.thumbnail-index').textContent = index + 1;

                        // アクティブなスライド、または内容が変更されたスライドのサムネイルを再描画
                        const newHash = Utils.objectHash(slide);
                        if (slide.id === activeSlideId || li.dataset.renderedHash !== newHash) {
                            this._renderSingleThumbnail(li);
                        }
                    } else {
                        // --- 新規作成 ---
                        li = this._createThumbnailElement(slide, settings);
                        this.thumbnailCache.set(slide.id, li);
                        if (this.thumbnailObserver) {
                            this.thumbnailObserver.observe(li);
                        }
                        li.className = `slide-thumbnail ${slide.id === activeSlideId ? 'active' : ''}`;
                        li.querySelector('.thumbnail-index').textContent = index + 1;
                    }
                    
                    // --- 順序の整合性をチェックし、必要ならDOMを移動 ---
                    if (lastElement) {
                        if (lastElement.nextSibling !== li) {
                            slideList.insertBefore(li, lastElement.nextSibling);
                        }
                    } else {
                        if (slideList.firstChild !== li) {
                            slideList.insertBefore(li, slideList.firstChild);
                        }
                    }
                    lastElement = li;
                });

                // 4. 「追加」ボタンの処理
                let addLi = slideList.querySelector('.add-slide');
                if (!addLi) {
                    addLi = document.createElement('li');
                    addLi.className = 'slide-thumbnail add-slide';
                    addLi.title = 'スライドを追加';
                    addLi.style.cursor = 'pointer';
                    addLi.innerHTML = `<div class="slide-thumbnail-wrapper"><div class="slide-thumbnail-content add-slide-content" style="width: ${settings.width}px; height: ${settings.height}px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-plus" style="font-size:48px;color:#aaa;"></i></div></div>`;
                    addLi.addEventListener('click', () => this.addSlide());
                }
                
                // 常に末尾に配置
                slideList.appendChild(addLi);

                // スケール調整
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
                
                // サムネイルにページ背景を適用
                this.applyPageBackground(content);

                // カスタムCSSを適用するための <style> タグを追加
                const styleTag = document.createElement('style');
                let cssText = settings.globalCss || '';

                slide.elements.forEach(elData => {
                    if (elData.style.customCss) {
                        const importantCss = elData.style.customCss.replace(/\/\*[\s\S]*?\*\//g, '').split(';')
                            .map(rule => {
                                if (rule.includes(':')) {
                                    const parts = rule.split(':');
                                    const property = parts.shift().trim();
                                    const value = parts.join(':').trim();
                                    if (property && value) {
                                        return `${property}: ${value} !important`;
                                    }
                                }
                                return null;
                            })
                            .filter(Boolean)
                            .join('; ');

                        if (importantCss) {
                            if (elData.type === 'shape') {
                                const shapeTags = ['rect', 'circle', 'polygon', 'line', 'path'];
                                const svgSelectors = shapeTags.map(tag => `[data-id="${elData.id}"] svg ${tag}`).join(', ');
                                cssText += `\n${svgSelectors} { ${importantCss} }`;
                                cssText += `\n[data-id="${elData.id}"] { ${importantCss} }`;
                            } else {
                                cssText += `\n[data-id="${elData.id}"] { ${importantCss} }`;
                            }
                        }
                    }
                });
                
                styleTag.textContent = cssText;
                content.appendChild(styleTag);

                slide.elements.forEach(elData => {
                    const el = this.createElementDOM(elData);
                    content.appendChild(el);
                });

                requestAnimationFrame(() => {
                    if (wrapper && wrapper.offsetWidth > 0) {
                        content.style.transform = `scale(${wrapper.offsetWidth / settings.width})`;
                    }
                });

                // 描画内容のハッシュを保存して、不要な再描画を防ぐ
                li.dataset.renderedHash = Utils.objectHash(slide);
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
                    const cacheEntry = this.domElementCache.get(elData.id);
                    let el = cacheEntry ? cacheEntry.dom : null;
                    const newHash = Utils.objectHash({ style: elData.style, content: elData.content });

                    if (!el) {
                        // --- 新規作成 ---
                        el = this.createElementDOM(elData);
                        el.dataset.id = elData.id;
                        canvas.appendChild(el);
                        this.domElementCache.set(elData.id, { dom: el, hash: newHash });
                    } else {
                        // --- 更新（ハッシュを比較して変更があった場合のみ） ---
                        if (cacheEntry.hash !== newHash) {
                            StyleManager.applyStyles(el, elData.style);
                            
                            const content = ElementFactory.createElement(elData);
                            el.textContent = ''; // 中身をクリア
                            if (content) {
                                if (content instanceof Node) {
                                    el.appendChild(content);
                                } else if (typeof content === 'string') {
                                    el.innerText = content;
                                }
                            }
                            this.domElementCache.set(elData.id, { dom: el, hash: newHash });
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
                
                // 状態管理システムに実際のスケールを保存 (再描画ループを防ぐためsilent)
                this.updateState(doc => {
                    if (!doc.canvas) doc.canvas = {};
                    doc.canvas.actualScale = finalScale;
                }, { silent: true });
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

                // 既存データからiframeが描画されるケースでも警告を出す
                if (elData.type === 'iframe' && elData.content && elData.content.url) {
                    App.showEmbedWarning(`スライドに埋め込みが含まれています: ${elData.content.url}
外部サイトのスクリプトが実行される可能性があります。信頼できる提供元か確認してください。`, { oncePerSession: true });
                }

                return el;
            },

            // フォールバック用の統合メソッド
            // （不要になったため削除）

            renderInspector() {
                this.inspectorManager.render();
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
                    this._bindWikiImageSearchEvents();
                } catch (error) {
                    ErrorHandler.handle(error, 'bind_events');
                }
            },

            _bindToolbarEvents() {
                // スライド操作ボタン
                this.elements.addSlideBtn.addEventListener('click', () => this.addSlide());
                this.elements.deleteSlideBtn.addEventListener('click', () => this.deleteSlide());
                this.elements.undoBtn.addEventListener('click', () => this.stateManager.undo());
                this.elements.redoBtn.addEventListener('click', () => this.stateManager.redo());
                
                // 要素追加ボタン
                this.elements.addTextBtn.addEventListener('click', () => this.addElement('text'));
                this.elements.addChartBtn.addEventListener('click', () => this.addChart());
                // iframeは専用モーダルを起動（URL追加前に警告＆プレビュー）
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

                // プレゼンテーション・エクスポートボタン
                this.elements.presentBtn.addEventListener('click', () => this.presentationManager.startPresentation());
                this.elements.exportBtn.addEventListener('click', (e) => this.showExportMenu(e));

                // 台本パネル表示/非表示ボタン
                const toggleScriptPanelBtn = document.getElementById('toggle-script-panel-btn');
                if (toggleScriptPanelBtn) {
                    toggleScriptPanelBtn.addEventListener('click', () => {
                        const rightSidebar = this.elements.rightSidebar;
                        const isDisplayed = rightSidebar.style.display === 'flex';
                        rightSidebar.style.display = isDisplayed ? 'none' : 'flex';
                    });
                }
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
                // モバイルナビゲーションバーのタブ切り替え
                if (this.elements.mobileNavBar) {
                    this.elements.mobileNavBar.addEventListener('click', e => {
                        const button = e.target.closest('.mobile-nav-item');
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
                
                // 背景タイプセレクタ
                if (this.elements.backgroundTypeSelector) {
                    this.elements.backgroundTypeSelector.addEventListener('click', (e) => {
                        const btn = e.target.closest('button');
                        if (btn) {
                            const type = btn.dataset.bgType;
                            this.updateState(doc => {
                                doc.presentation.settings.backgroundType = type;
                            });
                            // 単色モードに切り替わったらカラーピッカーの値を更新
                            if (type === 'solid' && this.pageBgColorPicker) {
                                this.pageBgColorPicker.setColor(this.state.presentation.settings.backgroundColor);
                            }
                        }
                    });
                }
                
                // グラデーション設定
                const gradientControls = [this.elements.gradientStartColor, this.elements.gradientEndColor, this.elements.gradientAngle];
                gradientControls.forEach(control => {
                    if (control) {
                        control.addEventListener('input', Utils.debounce(() => {
                            this.updateState(doc => {
                                doc.presentation.settings.gradientStart = this.elements.gradientStartColor.value;
                                doc.presentation.settings.gradientEnd = this.elements.gradientEndColor.value;
                                doc.presentation.settings.gradientAngle = parseInt(this.elements.gradientAngle.value);
                            });
                        }, 150));
                    }
                });
            },

            _bindIconEvents() {
                if (this.iconManager) {
                    this.iconManager.bindEvents();
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
                    'distributeVBtn': () => this.distributeElements('vertical'),
                    'tidyUpBtn': () => this.tidyUpElements()
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
                this.elements.inspector.addEventListener('input', e => {
                    if (this.inspectorManager) {
                        this.inspectorManager.handleInput(e);
                    }
                });
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
                    this.updateState('ui.rightSidebarWidth', newWidth, { skipHistory: true });
                });

                document.addEventListener('mouseup', () => {
                    if (isResizing) {
                        isResizing = false;
                        document.body.style.cursor = '';
                    }
                });
            },

            _bindGlobalEvents() {
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

                    this.updateState(doc => {
                        doc.presentation.settings.globalCss = css;
                    });
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
                    const hasMultipleSelection = this.getState('selectedElementIds') && this.getState('selectedElementIds').length > 1;

                    if ((el && el.dataset.id && !isEditingText) || hasMultipleSelection) {
                        // 要素または複数選択のコンテキストメニュー
                        const targetId = el?.dataset?.id || this.getState('selectedElementIds')[0];
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
                    const panState = this.getState('canvas.pan');
                    if (e.touches.length === 2 && panState && panState.dragging) {
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
                        }
                        // 2本指パン
                        if (lastTouchCenter) {
                            const dx = center.x - panState.startX;
                            const dy = center.y - panState.startY;
                            this.updateState('canvas.pan.x', panState.originX + dx);
                            this.updateState('canvas.pan.y', panState.originY + dy);
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
                }, { passive: false });
                // ズームリセットボタン
            
            },

            handleCanvasMouseDown(e) {
                if (!e.type.startsWith('touch') && e.button === 2) return;

                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const target = point.target;

                if (this.getState('isEditingText')) {
                    const clickedElement = target.closest('.slide-element');
                    if (!clickedElement || !this.getState('selectedElementIds').includes(clickedElement.dataset.id)) {
                        this.stopTextEditing(true);
                    }
                    return;
                }

                const element = target.closest('.slide-element');
                const elementId = element ? element.dataset.id : null;
                const clickedGroup = elementId ? this._findGroupForElement(elementId) : null;

                let shouldStartInteraction = false;

                this.updateState(doc => {
                    if (!doc.interaction) doc.interaction = {};
                    doc.interaction.isCtrlPressed = e.ctrlKey || e.metaKey;

                    if (clickedGroup) {
                        doc.selectedElementIds = [];
                        doc.selectedGroupIds = [clickedGroup.id];
                        doc.interaction.isDragging = true;
                        shouldStartInteraction = true;
                    } else if (elementId) {
                        const isSelected = doc.selectedElementIds.includes(elementId);
                        if (doc.interaction.isCtrlPressed) {
                            if (isSelected) {
                                doc.selectedElementIds = doc.selectedElementIds.filter(id => id !== elementId);
                            } else {
                                doc.selectedElementIds.push(elementId);
                            }
                        } else {
                            if (!isSelected) {
                                doc.selectedElementIds = [elementId];
                                this.switchToTab('inspector');
                            }
                        }
                        doc.selectedGroupIds = [];

                        if (target.classList.contains('resize-handle')) {
                            doc.interaction.isResizing = true;
                            doc.interaction.handle = target.dataset.handle;
                        } else {
                            doc.interaction.isDragging = true;
                        }
                        shouldStartInteraction = true;
                    } else {
                        doc.selectedElementIds = [];
                        doc.selectedGroupIds = [];
                    }
                });

                if (shouldStartInteraction) {
                    this.startInteraction(e);
                }
            },

            startInteraction(e) {
                // Add event listeners
                this._boundHandleMouseMove = this.handleMouseMove.bind(this);
                this._boundHandleMouseUp = this.handleMouseUp.bind(this);
                window.addEventListener('mousemove', this._boundHandleMouseMove);
                window.addEventListener('touchmove', this._boundHandleMouseMove, { passive: false });
                window.addEventListener('mouseup', this._boundHandleMouseUp);
                window.addEventListener('touchend', this._boundHandleMouseUp);

                const isTouch = e.type.startsWith('touch');
                const point = isTouch ? e.touches[0] : e;
                const canvasRect = this.elements.slideCanvas.getBoundingClientRect();

                this.updateState(doc => {
                    if (!doc.canvas) doc.canvas = {};
                    // DOMRectをプレーンオブジェクトに変換して保存
                    doc.canvas.rect = {
                        left: canvasRect.left,
                        top: canvasRect.top,
                        width: canvasRect.width,
                        height: canvasRect.height,
                        right: canvasRect.right,
                        bottom: canvasRect.bottom,
                        x: canvasRect.x,
                        y: canvasRect.y
                    };
                    if (!doc.interaction) doc.interaction = {};
                    doc.interaction.startX = point.clientX;
                    doc.interaction.startY = point.clientY;

                    let elementsToTrack = [];
                    if (doc.selectedGroupIds.length > 0) {
                        const slideGroups = doc.presentation.groups[doc.activeSlideId] || [];
                        doc.selectedGroupIds.forEach(groupId => {
                            const group = slideGroups.find(g => g.id === groupId);
                            if (group) {
                                elementsToTrack.push(...doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.filter(el => group.elementIds.includes(el.id)));
                            }
                        });
                    } else {
                        elementsToTrack = doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.filter(el => doc.selectedElementIds.includes(el.id));
                    }
                    
                    const allElementsPixelRects = doc.presentation.slides.find(s => s.id === doc.activeSlideId).elements.map(elData => {
                        const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (!domEl) {
                            return { id: elData.id, rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, centerX: 0, centerY: 0 } };
                        }
                        const rect = { left: domEl.offsetLeft, top: domEl.offsetTop, width: domEl.offsetWidth, height: domEl.offsetHeight };
                        rect.right = rect.left + rect.width;
                        rect.bottom = rect.top + rect.height;
                        rect.centerX = rect.left + rect.width / 2;
                        rect.centerY = rect.top + rect.height / 2;
                        return { id: elData.id, rect };
                    });

                    doc.interaction.initialStates = elementsToTrack.map(elData => {
                        const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (!domEl) return null;
                        
                        domEl.style.willChange = 'transform, width, height';
                        
                        if (elData.type === 'iframe') {
                            const iframeEl = domEl.querySelector('iframe');
                            if (iframeEl) iframeEl.style.pointerEvents = 'none';
                        }
                        
                        const foundRect = allElementsPixelRects.find(r => r.id === elData.id);
                        return {
                            id: elData.id,
                            startX: elData.style.left ?? 0,
                            startY: elData.style.top ?? 0,
                            startW: elData.style.width ?? 0,
                            startH: elData.style.height ?? (domEl.offsetHeight / canvasRect.height * 100),
                            initialRect: foundRect ? foundRect.rect : { left: 0, top: 0, width: 0, height: 0 },
                            _initialFontSize: elData.style.fontSize ?? null
                        };
                    }).filter(Boolean);

                    // 静的要素の情報をキャッシュ
                    const selectedIds = new Set(doc.selectedElementIds);
                    doc.interaction.staticElementsBounds = allElementsPixelRects
                        .filter(el => !selectedIds.has(el.id))
                        .map(el => el.rect);
                }, { silent: true });
            },

            handleMouseMove(e) {
                const interaction = this.getState('interaction');
                if (!interaction.isDragging && !interaction.isResizing) return;

                e.preventDefault();

                // 既にフレームが予約されている場合は何もしない
                if (this._animationFrameId) {
                    return;
                }

                this._animationFrameId = requestAnimationFrame(() => {
                    const isTouch = e.type.startsWith('touch');
                    if (isTouch && e.touches.length === 0) {
                        this._animationFrameId = null;
                        return;
                    }
                    const point = isTouch ? e.touches[0] : e;

                    const dx = point.clientX - interaction.startX;
                    const dy = point.clientY - interaction.startY;

                    this.batchUpdateState({
                        'interaction.lastDx': dx,
                        'interaction.lastDy': dy
                    }, { silent: true });

                    if (interaction.isDragging) {
                        this.handleDragMove(dx, dy);
                    } else if (interaction.isResizing) {
                        const scale = this.getState('canvas.actualScale') || 1;
                        const dxPercent = (dx / scale) / CANVAS_WIDTH * 100;
                        const dyPercent = (dy / scale) / CANVAS_HEIGHT * 100;
                        this.performResize(dxPercent, dyPercent);
                    }

                    this._animationFrameId = null; // 処理が終わったらIDをクリア
                });
            },

            handleDragMove(dx, dy) {
                this.guideLineManager.clear();
                const interaction = this.getState('interaction');
                const draggingElementsInitialStates = interaction.initialStates;
                const scale = this.getState('canvas.actualScale') || 1;

                const canvasWidth = CANVAS_WIDTH;
                const canvasHeight = CANVAS_HEIGHT;

                let snapOffset = { x: 0, y: 0 };
                let guides = [];

                // スケール補正された移動量
                const scaledDx = dx / scale;
                const scaledDy = dy / scale;

                if (this.isSnapEnabled()) {
                    const combinedBounds = draggingElementsInitialStates.reduce((acc, state) => {
                        const currentLeft = state.initialRect.left + scaledDx;
                        const currentTop = state.initialRect.top + scaledDy;
                        acc.left = Math.min(acc.left, currentLeft);
                        acc.top = Math.min(acc.top, currentTop);
                        acc.right = Math.max(acc.right, currentLeft + state.initialRect.width);
                        acc.bottom = Math.max(acc.bottom, currentTop + state.initialRect.height);
                        return acc;
                    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
                    combinedBounds.centerX = combinedBounds.left + (combinedBounds.right - combinedBounds.left) / 2;
                    combinedBounds.centerY = combinedBounds.top + (combinedBounds.bottom - combinedBounds.top) / 2;

                    const staticElementsBounds = interaction.staticElementsBounds || [];
                    const canvasBounds = { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight, centerX: canvasWidth / 2, centerY: canvasHeight / 2 };
                    
                    const snapResult = this.guideLineManager.calculateSnapGuides(combinedBounds, staticElementsBounds, canvasBounds);
                    snapOffset = snapResult.snapOffset; // snapOffsetはスケールされていないピクセル値
                    guides = snapResult.guides;
                }

                this.updateState('interaction.lastSnapOffset', snapOffset, { silent: true });
                const elementsToUpdate = this.getSelectedElementsData();
                draggingElementsInitialStates.forEach(initialState => {
                    const elData = elementsToUpdate.find(el => el.id === initialState.id);
                    if (elData) {
                        const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                        if (domEl) {
                            const finalDx = scaledDx + snapOffset.x;
                            const finalDy = scaledDy + snapOffset.y;
                            const rotation = elData.style.rotation || 0;
                            domEl.style.transform = `translate(${finalDx}px, ${finalDy}px) rotate(${rotation}deg)`;
                        }
                    }
                });

                this.renderSelectionBoundingBox();
                if (this.isSnapEnabled()) {
                    guides.forEach(g => { const [o, p] = g.split('-'); this.guideLineManager.addGuide(o, p); });
                }
            },

            handleMouseUp() {
                if (this._boundHandleMouseMove) {
                    window.removeEventListener('mousemove', this._boundHandleMouseMove);
                    window.removeEventListener('touchmove', this._boundHandleMouseMove);
                    this._boundHandleMouseMove = null;
                }
                if (this._boundHandleMouseUp) {
                    window.removeEventListener('mouseup', this._boundHandleMouseUp);
                    window.removeEventListener('touchend', this._boundHandleMouseUp);
                    this._boundHandleMouseUp = null;
                }

                const interaction = this.getState('interaction');
                if (!interaction || (!interaction.isDragging && !interaction.isResizing)) return;

                this.updateState(doc => {
                    const activeSlide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!activeSlide) return;

                    if (doc.isEditingText) {
                        doc.interaction.isDragging = false;
                        doc.interaction.isResizing = false;
                        return;
                    }

                    if (interaction.isDragging) {
                        const { lastDx, lastDy, lastSnapOffset, initialStates } = interaction;
                        const currentActualScale = doc.canvas?.actualScale || 1;
                        const finalDx = (lastDx / currentActualScale) + (lastSnapOffset?.x || 0);
                        const finalDy = (lastDy / currentActualScale) + (lastSnapOffset?.y || 0);

                        initialStates.forEach(initialState => {
                            const element = activeSlide.elements.find(el => el.id === initialState.id);
                            if (element) {
                                const newLeft = (initialState.startX || 0) + (finalDx / CANVAS_WIDTH * 100);
                                const newTop = (initialState.startY || 0) + (finalDy / CANVAS_HEIGHT * 100);
                                if (!isNaN(newLeft)) {
                                    element.style.left = parseFloat(newLeft.toFixed(2));
                                }
                                if (!isNaN(newTop)) {
                                    element.style.top = parseFloat(newTop.toFixed(2));
                                }
                            }
                        });
                    }

                    if (interaction.isResizing) {
                        const { handle, initialStates, lastDx, lastDy } = interaction;
                        const elId = doc.selectedElementIds[0];
                        const initialState = initialStates[0];
                        const element = activeSlide.elements.find(el => el.id === elId);

                        if (element && initialState) {
                            const scale = doc.canvas?.actualScale || 1;
                            const dxPercent = (lastDx / scale) / CANVAS_WIDTH * 100;
                            const dyPercent = (lastDy / scale) / CANVAS_HEIGHT * 100;

                            const finalStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent, interaction);

                            if (!isNaN(finalStyles.newLeft)) element.style.left = finalStyles.newLeft;
                            if (!isNaN(finalStyles.newTop)) element.style.top = finalStyles.newTop;
                            if (!isNaN(finalStyles.newWidth)) element.style.width = finalStyles.newWidth;
                            if (finalStyles.newHeight != null && !isNaN(finalStyles.newHeight)) {
                                element.style.height = finalStyles.newHeight;
                            }
                            if (finalStyles.newFontSize && !isNaN(finalStyles.newFontSize)) {
                                element.style.fontSize = finalStyles.newFontSize;
                            }
                        }
                    }

                    this.guideLineManager.clear();
                    
                    doc.interaction.isDragging = false;
                    doc.interaction.isResizing = false;
                    doc.interaction.initialStates = [];
                    doc.interaction.allElementsPixelRects = [];
                    doc.interaction.lastDx = 0;
                    doc.interaction.lastDy = 0;
                    doc.interaction.lastSnapOffset = { x: 0, y: 0 };
                });

                this.state.selectedElementIds.forEach(id => {
                    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${id}"]`);
                    if (domEl) {
                        domEl.style.willChange = 'auto';
                        const elData = this.getActiveSlide().elements.find(el => el.id === id);
                        if (elData && elData.type === 'iframe') {
                            const iframeEl = domEl.querySelector('iframe');
                            if (iframeEl) iframeEl.style.pointerEvents = 'auto';
                        }
                    }
                });

                // 変更は stateManager.change によって自動的に Automerge の内部で記録され、
                // stateManager の setOnChange コールバック経由で WebSocket に送信されるため、
                // ここで明示的に send する必要はありません。
            },

            performResize(dxPercent, dyPercent) {
                const interaction = this.getState('interaction');
                const { handle, initialStates } = interaction;
                const elData = this.getSelectedElement();
                const initialState = initialStates[0];
                if (!elData || !initialState) return;

                this.guideLineManager.clear();
                const newStyles = this._calculateResize(handle, initialState, dxPercent, dyPercent, interaction);

                if (newStyles.snapResult.snapped) {
                    const scale = this.getState('canvas.actualScale') || 1;
                    newStyles.snapResult.guides.forEach(guideInfo => {
                        this.guideLineManager.drawSizeMatchGuide(guideInfo, scale);
                    });
                }

                const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                if (domEl) {
                    const rotation = elData.style.rotation || 0;
                    domEl.style.width = `${newStyles.newWidth}%`;
                    if (newStyles.newHeight != null) domEl.style.height = `${newStyles.newHeight}%`;

                    // `_calculateResize`でスナップによってleft/topが変更されている可能性があるので、
                    // dx/dyから再計算するのではなく、計算結果のnewLeft/newTopと開始位置の差分からtransformを計算する
                    const finalDxPercent = newStyles.newLeft - initialState.startX;
                    const finalDyPercent = newStyles.newTop - initialState.startY;

                    const translateXPx = Utils.percentToPixels(finalDxPercent, CANVAS_WIDTH);
                    const translateYPx = Utils.percentToPixels(finalDyPercent, CANVAS_HEIGHT);
                    
                    domEl.style.transform = `translate(${translateXPx}px, ${translateYPx}px) rotate(${rotation}deg)`;

                    if (newStyles.newFontSize) {
                        const fontSizer = domEl.querySelector('i, span, div');
                        if(fontSizer) fontSizer.style.fontSize = `${newStyles.newFontSize}px`;
                    }
                }
                this.renderSelectionBoundingBox();
            },

            _calculateResize(handle, initialState, dxPercent, dyPercent, interaction) {
                const { startX, startY, startW, startH } = initialState;
                let newLeft = startX;
                let newTop = startY;
                let newWidth = startW;
                let newHeight = startH;

                if (handle.includes('e')) newWidth = Math.max(2, startW + dxPercent);
                if (handle.includes('w')) { newWidth = Math.max(2, startW - dxPercent); newLeft = startX + dxPercent; }
                if (handle.includes('s')) newHeight = startH != null ? Math.max(2, startH + dyPercent) : null;
                if (handle.includes('n')) { newHeight = startH != null ? Math.max(2, startH - dyPercent) : null; newTop = startY + dyPercent; }

                // NaNガード: 計算結果がNaNになった場合は元の値に戻す
                if (isNaN(newLeft)) newLeft = startX;
                if (isNaN(newTop)) newTop = startY;
                if (isNaN(newWidth)) newWidth = startW;
                if (isNaN(newHeight)) newHeight = startH;

                // NaNガード: 計算結果がNaNになった場合は元の値に戻す
                if (isNaN(newLeft)) newLeft = startX;
                if (isNaN(newTop)) newTop = startY;
                if (isNaN(newWidth)) newWidth = startW;
                if (isNaN(newHeight)) newHeight = startH;

                const elData = this.getSelectedElement();
                if (elData.type === 'icon' && startW > 0.001 && startH > 0.001) { // ゼロ除算を避ける
                    const ratio = startH / startW;
                    if (newWidth !== startW) {
                        newHeight = newWidth * ratio;
                    } else if (newHeight !== startH && ratio > 0.001) { // ratioもチェック
                        newWidth = newHeight / ratio;
                    }
                }

                let newFontSize = null;
                if ((elData.type === 'text' || elData.type === 'icon') && startW > 0 && newWidth !== startW) {
                    const initialFontSize = initialState._initialFontSize ?? elData.style.fontSize;
                    if (typeof initialFontSize === 'number') {
                        newFontSize = Math.max(8, Math.round(initialFontSize * (newWidth / startW)));
                    }
                }

                // --- サイズ一致ガイドのロジック ---
                const snapResult = { snapped: false, guides: [] };
                if (this.isSnapEnabled() && interaction) {
                    const newWidthLogicalPx = Utils.percentToPixels(newWidth, CANVAS_WIDTH);
                    const newHeightLogicalPx = newHeight != null ? Utils.percentToPixels(newHeight, CANVAS_HEIGHT) : null;
                    const staticElementsRects = interaction.allElementsPixelRects.filter(el => !this.state.selectedElementIds.includes(el.id));

                    for (const staticElRect of staticElementsRects) {
                        const staticWidthLogicalPx = staticElRect.rect.width;
                        const staticHeightLogicalPx = staticElRect.rect.height;

                        // 幅の比較 (論理ピクセルで比較)
                        if (Math.abs(newWidthLogicalPx - staticWidthLogicalPx) < CONFIG.SNAP_THRESHOLD) {
                            const snappedWidthLogicalPx = staticWidthLogicalPx;
                            const snappedWidthPercent = Utils.pixelsToPercent(snappedWidthLogicalPx, CANVAS_WIDTH);
                            if (handle.includes('w')) {
                                newLeft = startX + (startW - snappedWidthPercent);
                            }
                            newWidth = snappedWidthPercent;
                            snapResult.guides.push({ type: 'width', elementAId: elData.id, elementBId: staticElRect.id, handle });
                            snapResult.snapped = true;
                        }

                        // 高さの比較 (論理ピクセルで比較)
                        if (newHeightLogicalPx != null && Math.abs(newHeightLogicalPx - staticHeightLogicalPx) < CONFIG.SNAP_THRESHOLD) {
                            const snappedHeightLogicalPx = staticHeightLogicalPx;
                            const snappedHeightPercent = Utils.pixelsToPercent(snappedHeightLogicalPx, CANVAS_HEIGHT);
                            if (handle.includes('n')) {
                                newTop = startY + (startH - snappedHeightPercent);
                            }
                            newHeight = snappedHeightPercent;
                            snapResult.guides.push({ type: 'height', elementAId: elData.id, elementBId: staticElRect.id, handle });
                            snapResult.snapped = true;
                        }

                        if (snapResult.snapped) break; // 1つ一致したら十分
                    }
                }

                return { newLeft, newTop, newWidth, newHeight, newFontSize, snapResult };
            },
            handleKeyDown(e) {
                const target = e.target;
                const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.cm-editor');

                // If typing in an input field, do not trigger global shortcuts like 'delete element'.
                if (isInputFocused) {
                    return; // Exit early
                }

                this.updateState(doc => {
                    if (e.key === 'Control' || e.key === 'Meta') {
                        if (!doc.interaction) doc.interaction = {};
                        doc.interaction.isCtrlPressed = true;
                    }
                });


                // テキスト編集中はEscapeキーで編集終了のみ許可
                if (this.getState('isEditingText')) {
                    if (e.key === 'Escape') {
                        this.stopTextEditing(true);
                    }
                    return;
                }
                // 一括削除
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (this.getState('selectedElementIds').length > 0) this.deleteSelectedElements();
                }
                // 一括コピー
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                    if (this.getState('selectedElementIds').length > 0) {
                        e.preventDefault();
                        this.copySelectedElements();
                    }
                }
                // 一括貼り付け
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                    if (window._slideClipboard) { // Check the global clipboard
                        e.preventDefault();
                        this.pasteCopiedElements();
                    }
                }
                // Undo/Redo
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    this.stateManager.undo();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    this.stateManager.redo();
                }
            },
            handleKeyUp(e) {
                if (e.key === 'Control' || e.key === 'Meta') {
                    this.updateState(doc => {
                        if (!doc.interaction) doc.interaction = {};
                        doc.interaction.isCtrlPressed = false;
                    });
                }
            },

            toggleElementSelection(id) {
                const selectedElementIds = this.getState('selectedElementIds');
                const interaction = this.getState('interaction');
                const index = selectedElementIds.indexOf(id);

                if (id === null) {
                    this.updateState('selectedElementIds', []);
                } else if (interaction.isCtrlPressed) {
                    if (index === -1) {
                        this.updateState('selectedElementIds', [...selectedElementIds, id]);
                    } else {
                        this.updateState('selectedElementIds', selectedElementIds.filter(i => i !== id));
                    }
                } else {
                    if (index === -1 || selectedElementIds.length > 1) {
                        this.updateState('selectedElementIds', [id]);
                    }
                }
            },

            stopTextEditing(save = false) {
                if (!this.getState('isEditingText')) return;
                const editableEl = this.elements.slideCanvas.querySelector('[contenteditable="true"]');
                if (!editableEl) {
                    this.updateState(doc => { doc.isEditingText = false; });
                    return;
                }

                const newText = editableEl.innerText;
                const oldDoc = this.stateManager.get();
                const elId = this.getState('selectedElementIds')[0];
                const activeSlideId = this.getState('activeSlideId');
                
                let textChanged = false;
                const activeSlide = oldDoc.presentation.slides.find(s => s.id === activeSlideId);
                const element = activeSlide?.elements.find(e => e.id === elId);
                
                if (save && element && element.content !== newText) {
                    textChanged = true;
                }

                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === activeSlideId);
                    const el = slide?.elements.find(e => e.id === elId);
                    if (el && textChanged) {
                        el.content = newText;
                    }
                    doc.isEditingText = false;
                });

                // 変更があった場合のみ、ドキュメント全体を送信
                if (textChanged) {
                    const newDoc = this.stateManager.get();
                    // Automerge.equals を使ってドキュメントが実際に変更されたか確認
                    if (!Automerge.equals(oldDoc, newDoc)) {
                        const fullDocBytes = Automerge.save(newDoc);
                        if (this.webSocketClient) {
                            this.webSocketClient.send([fullDocBytes]);
                        }
                    }
                }
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
                
                this.updateState(doc => {
                    doc.selectedElementIds = [element.dataset.id];
                    doc.isEditingText = true;
                });
                
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
                const isEditing = this.getState('isEditingText');
                const isSlideElement = e.target.classList.contains('slide-element');
                
                if (isEditing && isSlideElement) {
                    // 変更を保存するオプションを付けて編集を終了
                    this.stopTextEditing(true);
                }
            },

            addSlide(silent = false) {
                const newId = Utils.generateId('slide');
                const newSlide = { id: newId, elements: [] };
                const activeIndex = this.state.presentation.slides.findIndex(s => s.id === this.state.activeSlideId);
                const insertionIndex = activeIndex === -1 ? this.state.presentation.slides.length : activeIndex + 1;
                
                this.updateState(doc => {
                    const activeIndex = doc.presentation.slides.findIndex(s => s.id === doc.activeSlideId);
                    const insertionIndex = activeIndex === -1 ? doc.presentation.slides.length : activeIndex + 1;
                    const newSlide = { id: newId, elements: [] };
                    doc.presentation.slides.splice(insertionIndex, 0, newSlide);
                    if (!silent) {
                        doc.activeSlideId = newId;
                        doc.selectedElementIds = [];
                    }
                });
                return newId;
            },
            deleteSlide(slideId, silent = false) {
                const slides = this.getState('presentation.slides');
                if (slides.length <= 1) {
                    const msg = '最後のスライドは削除できません。';
                    if (!silent) ErrorHandler.showNotification(msg, 'warning');
                    return { success: false, message: msg };
                }
                const targetId = slideId || this.getState('activeSlideId');
                if (!silent && !confirm(`スライド(ID: ${targetId})を削除しますか？`)) {
                    return { success: false, message: '削除がキャンセルされました。' };
                }

                this.updateState(doc => {
                    const idx = doc.presentation.slides.findIndex(s => s.id === targetId);
                    if (idx === -1) return;

                    doc.presentation.slides.splice(idx, 1);
                    
                    if (doc.activeSlideId === targetId) {
                        const newActiveId = doc.presentation.slides[Math.max(0, idx - 1)]?.id;
                        doc.activeSlideId = newActiveId;
                    }
                    if (!silent) {
                        doc.selectedElementIds = [];
                    }
                });
                return { success: true };
            },
            addElementToSlide(slideId, type, content, style) {
                let newEl = null;
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === slideId);
                    if (!slide) return;

                    newEl = {
                        id: Utils.generateId('el'),
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
                });
                return newEl;
            },
            addElement(type, content) { // This is for user interaction
                const newElId = Utils.generateId('el');
                this.updateState(doc => {
                    const activeSlide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!activeSlide) return;

                    const newEl = {
                        id: newElId,
                        type,
                        style: { top: 20, left: 20, width: 30, height: null, rotation: 0, animation: '' }
                    };
                    if (type === 'text') {
                        newEl.content = content || '新しいテキスト';
                        Object.assign(newEl.style, { width: 'auto', color: '#212529', fontSize: 24, fontFamily: 'sans-serif' });
                    } else if (type === 'image') {
                        if (!content) { console.error('画像データがありません。'); return; }
                        newEl.content = content;
                        newEl.style.width = 30;
                        newEl.style.height = 30;
                    } else if (type === 'video') {
                        const url = content || prompt('動画のURLを入力してください:', 'https://www.w3schools.com/html/mov_bbb.mp4');
                        if (!url) return;
                        newEl.content = { url: url, autoplay: false, loop: false, controls: true };
                        newEl.style.height = 30;
                    } else if (type === 'table') {
                        newEl.content = { rows: 2, cols: 2, data: [["セル1", "セル2"], ["セル3", "セル4"]] };
                        newEl.style.height = 30;
                    } else if (type === 'iframe') {
                        App.openEmbedModal();
                        return;
                    } else if (type === 'shape') {
                        if (!content || !content.shapeType) { console.error('図形タイプが指定されていません。'); return; }
                        newEl.content = content;
                        Object.assign(newEl.style, { width: 20, height: 20, fill: '#cccccc', stroke: 'transparent', strokeWidth: 0 });
                        if (content.shapeType === 'line') {
                            newEl.style.height = 0;
                            newEl.style.stroke = '#000000';
                            newEl.style.strokeWidth = 2;
                            delete newEl.style.fill;
                        }
                    }
                    activeSlide.elements.push(newEl);
                    doc.selectedElementIds = [newElId];
                });

                if (type === 'text') {
                    setTimeout(() => this.handleCanvasDblClick({ target: this.elements.slideCanvas.querySelector(`[data-id="${newElId}"]`) }), 50);
                }
            },

            
            addChart() {
                // Micromodalでグラフ作成モーダルを表示
                if (typeof MicroModal !== "undefined") {
                    MicroModal.show('chart-modal');
                } else {
                    console.error("MicroModal is undefined.");
                }
            },

            deleteSelectedElements() {
                if (!confirm(`${this.getState('selectedElementIds').length}個の要素を削除しますか？`)) return;
                this.updateState(doc => {
                    const activeSlide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!activeSlide) return;
                    const selectedIds = doc.selectedElementIds;
                    activeSlide.elements = activeSlide.elements.filter(el => !selectedIds.includes(el.id));
                    doc.selectedElementIds = [];
                });
            },

            alignElements(type) {
                const elementsData = this.getSelectedElementsData();
                if (elementsData.length === 0) return;

                this.updateState(doc => {
                    const activeSlide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!activeSlide) return;

                    // 単一のテキスト要素
                    if (elementsData.length === 1 && elementsData[0].type === 'text') {
                        const el = activeSlide.elements.find(e => e.id === elementsData[0].id);
                        const textAlignMap = { 'left': 'left', 'center-h': 'center', 'right': 'right' };
                        if (textAlignMap[type]) {
                            el.style.textAlign = textAlignMap[type];
                            return;
                        }
                    }

                    if (elementsData.length < 2) return;

                    const pixelElements = this.getElementsWithPixelRects(elementsData);
                    const bounds = this.calculatePixelBounds(pixelElements);
                    const currentActualScale = doc.canvas?.actualScale || 1;

                    pixelElements.forEach(el => {
                        const elementToUpdate = activeSlide.elements.find(e => e.id === el.data.id);
                        if (!elementToUpdate) return;
                        
                        let newLeft, newTop;
                        switch (type) {
                            case 'left': newLeft = bounds.minX; break;
                            case 'center-h': newLeft = bounds.centerX - el.rect.width / 2; break;
                            case 'right': newLeft = bounds.maxX - el.rect.width; break;
                            case 'top': newTop = bounds.minY; break;
                            case 'center-v': newTop = bounds.centerY - el.rect.height / 2; break;
                            case 'bottom': newTop = bounds.maxY - el.rect.height; break;
                        }
                        if (newLeft !== undefined) {
                            elementToUpdate.style.left = (newLeft / currentActualScale) / CANVAS_WIDTH * 100;
                        }
                        if (newTop !== undefined) {
                            elementToUpdate.style.top = (newTop / currentActualScale) / CANVAS_HEIGHT * 100;
                        }
                    });
                });
            },

            distributeElements(direction) {
                const elementsData = this.getSelectedElementsData();
                if (elementsData.length < 3) return;
                
                const activeSlideIndex = this.getActiveSlideIndex();
                if (activeSlideIndex === -1) return;

                const pixelElements = this.getElementsWithPixelRects(elementsData);
                const updates = {};
                
                if (direction === 'horizontal') {
                    pixelElements.sort((a, b) => a.rect.left - b.rect.left);
                    const bounds = this.calculatePixelBounds(pixelElements);
                    const totalWidth = pixelElements.reduce((sum, el) => sum + el.rect.width, 0);
                    const gap = (bounds.width - totalWidth) / (pixelElements.length - 1);
                    let currentX = bounds.minX;
                    const currentActualScale = this.getState('canvas.actualScale') || 1;
                    
                    pixelElements.forEach(el => {
                        const newLeftPercent = (currentX / currentActualScale) / CANVAS_WIDTH * 100;
                        updates[`presentation.slides.${activeSlideIndex}.elements.${this.getElementIndex(el.data.id)}.style.left`] = newLeftPercent;
                        currentX += el.rect.width + gap;
                    });
                } else {
                    pixelElements.sort((a, b) => a.rect.top - b.rect.top);
                    const bounds = this.calculatePixelBounds(pixelElements);
                    const totalHeight = pixelElements.reduce((sum, el) => sum + el.rect.height, 0);
                    const gap = (bounds.height - totalHeight) / (pixelElements.length - 1);
                    let currentY = bounds.minY;
                    const currentActualScale = this.getState('canvas.actualScale') || 1;
                    
                    pixelElements.forEach(el => {
                        const newTopPercent = (currentY / currentActualScale) / CANVAS_HEIGHT * 100;
                        updates[`presentation.slides.${activeSlideIndex}.elements.${this.getElementIndex(el.data.id)}.style.top`] = newTopPercent;
                        currentY += el.rect.height + gap;
                    });
                }

                this.batchUpdateState(updates);
            },

            tidyUpElements() {
                const elementsData = this.getSelectedElementsData();
                if (elementsData.length < 2) return;

                const activeSlideIndex = this.getActiveSlideIndex();
                if (activeSlideIndex === -1) return;

                const pixelElements = this.getElementsWithPixelRects(elementsData);
                pixelElements.sort((a, b) => a.rect.left - b.rect.left);
                
                const gap = 20; // 20pxのギャップで固定
                const updates = {};
                let currentX = pixelElements[0].rect.left; // 最初の要素の位置はそのまま
                const currentActualScale = this.getState('canvas.actualScale') || 1;

                for (let i = 1; i < pixelElements.length; i++) {
                    const prevElement = pixelElements[i - 1];
                    const currentElement = pixelElements[i];
                    
                    currentX += prevElement.rect.width + gap;
                    const newLeftPercent = Utils.pixelsToPercent(currentX / currentActualScale, CANVAS_WIDTH);
                    updates[`presentation.slides.${activeSlideIndex}.elements.${this.getElementIndex(currentElement.data.id)}.style.left`] = newLeftPercent;
                }

                if (Object.keys(updates).length > 0) {
                    this.batchUpdateState(updates);
                }
            },

            // --- 範囲選択用 ---
            handleSelectionBoxStart(e) {
                if (e.button !== 0 || e.target.closest('.slide-element')) return;
            
                const mainArea = this.elements.mainCanvasArea;
                const mainAreaRect = mainArea.getBoundingClientRect();
            
                // 選択範囲の視覚的ボックスを、スケールの影響を受けない親コンテナ(mainArea)に追加
                let selectionBox = document.createElement('div');
                selectionBox.className = 'selection-bounding-box';
                Object.assign(selectionBox.style, {
                    position: 'absolute',
                    left: `${e.clientX - mainAreaRect.left}px`,
                    top: `${e.clientY - mainAreaRect.top}px`,
                    width: '0px',
                    height: '0px',
                    pointerEvents: 'none'
                });
                mainArea.appendChild(selectionBox);
            
                const onMouseMove = (ev) => {
                    // 視覚的ボックスを親コンテナ基準で更新
                    const currentMouseX = ev.clientX - mainAreaRect.left;
                    const currentMouseY = ev.clientY - mainAreaRect.top;
                    const x = Math.min(e.clientX - mainAreaRect.left, currentMouseX);
                    const y = Math.min(e.clientY - mainAreaRect.top, currentMouseY);
                    const w = Math.abs(currentMouseX - (e.clientX - mainAreaRect.left));
                    const h = Math.abs(currentMouseY - (e.clientY - mainAreaRect.top));
                    Object.assign(selectionBox.style, {
                        left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`
                    });
                };
            
                const onMouseUp = (ev) => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
            
                    // 選択範囲の矩形をビューポート座標で確定
                    const rectX1 = Math.min(e.clientX, ev.clientX);
                    const rectY1 = Math.min(e.clientY, ev.clientY);
                    const rectX2 = Math.max(e.clientX, ev.clientX);
                    const rectY2 = Math.max(e.clientY, ev.clientY);
            
                    const selected = [];
                    const canvas = this.elements.slideCanvas;
                    this.getActiveSlide().elements.forEach(el => {
                        const domEl = canvas.querySelector(`[data-id="${el.id}"]`);
                        if (!domEl) return;
            
                        // 要素の矩形をビューポート座標で取得
                        const domElRect = domEl.getBoundingClientRect();
                        const elX1 = domElRect.left;
                        const elY1 = domElRect.top;
                        const elX2 = domElRect.right;
                        const elY2 = domElRect.bottom;
            
                        // ビューポート座標同士で重なり判定
                        if (rectX1 < elX2 && rectX2 > elX1 && rectY1 < elY2 && rectY2 > elY1) {
                            selected.push(el.id);
                        }
                    });
            
                    this.updateState('selectedElementIds', selected);
                    selectionBox.remove();
                    this.render();
                };
            
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            },

            // --- 複数コピー ---
            copySelectedElements() {
                const selectedElements = this.getSelectedElementsData();
                if (selectedElements.length === 0) return;
                // Use structuredClone for deep copy to plain JS objects, removing Automerge metadata
                window._slideClipboard = structuredClone(selectedElements);
            },

            pasteCopiedElements() {
                if (!window._slideClipboard) return;
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!slide) return;

                    const newIds = [];
                    const clipboardData = Array.isArray(window._slideClipboard) ? window._slideClipboard : [window._slideClipboard];

                    clipboardData.forEach(elData => {
                        const newEl = { ...elData }; // Plain JS object, shallow copy is fine
                        newEl.id = Utils.generateId('el');
                        newEl.style.left = (newEl.style.left || 0) + 2;
                        newEl.style.top = (newEl.style.top || 0) + 2;
                        newEl.style.zIndex = slide.elements.length + 1;
                        slide.elements.push(newEl);
                        newIds.push(newEl.id);
                    });
                    doc.selectedElementIds = newIds;
                });
            },

            getElementsWithPixelRects(elementsData) {
                const scale = this.getState('canvas.actualScale') || 1; // Needed for auto height
                return elementsData.map(elData => {
                    const domEl = this.elements.slideCanvas.querySelector(`[data-id="${elData.id}"]`);
                    if (!domEl) return { data: elData, rect: { left: 0, top: 0, width: 0, height: 0 } };
            
                    const logicalLeft = Utils.percentToPixels(elData.style.left, CANVAS_WIDTH);
                    const logicalTop = Utils.percentToPixels(elData.style.top, CANVAS_HEIGHT);
                    
                    let logicalWidth;
                    if (typeof elData.style.width === 'number') {
                        logicalWidth = Utils.percentToPixels(elData.style.width, CANVAS_WIDTH);
                    } else { // 'auto' width
                        // For auto width, we must measure the rendered element and un-scale it
                        logicalWidth = domEl.getBoundingClientRect().width / scale;
                    }
            
                    let logicalHeight;
                    if (typeof elData.style.height === 'number') {
                        logicalHeight = Utils.percentToPixels(elData.style.height, CANVAS_HEIGHT);
                    } else { // null/auto height
                        logicalHeight = domEl.getBoundingClientRect().height / scale;
                    }
            
                    return {
                        data: elData,
                        rect: {
                            left: logicalLeft,
                            top: logicalTop,
                            width: logicalWidth,
                            height: logicalHeight,
                        }
                    };
                });
            },
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
                if (!canvasRect || !canvasRect.width || !canvasRect.height) return { left: 0, top: 0, width: 0, height: 0};

                return {
                    left: bounds.minX / CANVAS_WIDTH * 100,
                    top: bounds.minY / CANVAS_HEIGHT * 100,
                    width: bounds.width / CANVAS_WIDTH * 100,
                    height: bounds.height / CANVAS_HEIGHT * 100
                };
            },

            _findGroupForElement(elementId) {
                const slideGroups = this.state.presentation.groups?.[this.state.activeSlideId] || [];
                return slideGroups.find(group => group.elementIds.includes(elementId));
            },
            handleThumbnailClick(e) { const thumb = e.target.closest('.slide-thumbnail'); if (thumb) { this.batchUpdateState({ activeSlideId: thumb.dataset.id, selectedElementIds: [] }); this.render(); } },
            generateId: (p) => `${p}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            getActiveSlide() { return this.state.presentation?.slides.find(s => s.id === this.state.activeSlideId); },
            getActiveSlideIndex() { return this.state.presentation?.slides.findIndex(s => s.id === this.state.activeSlideId); },
            getSelectedElement() { const id = this.state.selectedElementIds[0]; return this.getActiveSlide()?.elements.find(el => el.id === id); },
            getElementIndex(elId) { return this.getActiveSlide()?.elements.findIndex(el => el.id === elId); },
            getSelectedElementsData() { const slide = this.getActiveSlide(); if (!slide) return []; return slide.elements.filter(el => this.state.selectedElementIds.includes(el.id)); },
            setActiveSlide(slideId) {
                this.updateState(doc => {
                    if (doc.presentation.slides.some(s => s.id === slideId)) {
                        doc.activeSlideId = slideId;
                        doc.selectedElementIds = [];
                    }
                });
                if (document.body.classList.contains('presentation-mode')) {
                    this.presentationManager.renderPresentationSlide();
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
                const presentation = this.getState('presentation');
                if (!presentation || presentation.slides.length === 0) return;

                ErrorHandler.showNotification('エクスポート処理を開始しました...', 'info');

                const worker = new Worker('export.worker.js');
                const tempContainer = document.createElement('div');
                tempContainer.style.position = 'absolute';
                tempContainer.style.left = '-9999px';

                try {
                    document.body.appendChild(tempContainer);

                    // --- PPTX (All Slides) ---
                    if (type === 'pptx') {
                        const slideImagePromises = presentation.slides.map(async (slide) => {
                            const slideContainer = this._createSlideContainer(slide, presentation.settings);
                            tempContainer.appendChild(slideContainer);
                            // フォント等の反映安定化のため1フレーム待機
                            await new Promise(r => requestAnimationFrame(() => r()));
                            const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                            const dataUrl = canvas.toDataURL('image/png');
                            return { slideData: slide, dataUrl };
                        });
                        const allSlidesData = await Promise.all(slideImagePromises);
                        worker.postMessage({ type: 'pptx', slides: allSlidesData, settings: presentation.settings });

                    // --- PDF (All Slides) ---
                    } else if (type === 'pdf') {
                        const dataUrlPromises = presentation.slides.map(async (slide) => {
                            const slideContainer = this._createSlideContainer(slide, presentation.settings);
                            tempContainer.appendChild(slideContainer);
                            await new Promise(r => requestAnimationFrame(() => r()));
                            const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                            return canvas.toDataURL('image/png');
                        });
                        const dataUrls = await Promise.all(dataUrlPromises);
                        worker.postMessage({ type: 'pdf', dataUrls: dataUrls, settings: presentation.settings });
                    
                    // --- PNG (Current Slide Only) ---
                    } else if (type === 'png') {
                        const slide = this.getActiveSlide();
                        if (!slide) return;
                        const slideContainer = this._createSlideContainer(slide, presentation.settings);
                        tempContainer.appendChild(slideContainer);
                        await new Promise(r => requestAnimationFrame(() => r()));
                        const canvas = await html2canvas(slideContainer, { backgroundColor: "#fff", scale: 2, useCORS: true });
                        const link = document.createElement('a');
                        link.download = `slide-${slide.id}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                        ErrorHandler.showNotification('エクスポートが完了しました。', 'success');
                        worker.terminate();
                        return;
                    }

                } catch (error) {
                    ErrorHandler.handle(error, 'export');
                    worker.terminate();
                } finally {
                    if (document.body.contains(tempContainer)) {
                        document.body.removeChild(tempContainer);
                    }
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

            _createSlideContainer(slide, settings) {
                const slideContainer = document.createElement('div');
                slideContainer.style.width = `${settings.width}px`;
                slideContainer.style.height = `${settings.height}px`;

                // 背景適用
                this.applyPageBackground(slideContainer);

                // 1) グローバルCSSと要素ごとのカスタムCSSをstyleタグで注入（html2canvasキャプチャ前に必須）
                const styleTag = document.createElement('style');
                let cssText = settings.globalCss || '';

                // 要素ごとの customCss は data-id セレクタで強制適用（!important 付与）
                slide.elements.forEach(elData => {
                    if (elData?.style?.customCss) {
                        // コメント除去 → ; で分割 → !important 付与
                        const importantCss = elData.style.customCss
                            .replace(/\/\*[\s\S]*?\*\//g, '')
                            .split(';')
                            .map(rule => {
                                if (rule.includes(':')) {
                                    const parts = rule.split(':');
                                    const property = parts.shift().trim();
                                    const value = parts.join(':').trim();
                                    if (property && value) {
                                        return `${property}: ${value} !important`;
                                    }
                                }
                                return null;
                            })
                            .filter(Boolean)
                            .join('; ');

                        if (importantCss) {
                            if (elData.type === 'shape') {
                                // 図形はSVG内部も対象
                                const shapeTags = ['rect', 'circle', 'polygon', 'line', 'path'];
                                const svgSelectors = shapeTags.map(tag => `[data-id="${elData.id}"] svg ${tag}`).join(', ');
                                cssText += `\n${svgSelectors} { ${importantCss} }`;
                                cssText += `\n[data-id="${elData.id}"] { ${importantCss} }`;
                            } else {
                                cssText += `\n[data-id="${elData.id}"] { ${importantCss} }`;
                            }
                        }
                    }
                });

                styleTag.textContent = cssText;
                slideContainer.appendChild(styleTag);

                // 2) スライド要素を追加
                slide.elements.forEach(elData => {
                    const el = this.createElementDOM(elData);
                    slideContainer.appendChild(el);
                });

                // 3) フォント読み込み待ち（カスタムフォントやWebフォントがある場合のにじみ対策）
                //    失敗しても続行するようにbest-effort
                try {
                    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
                        // fonts.ready はドキュメント全体だが、既に読み込み済みであれば即時解決
                        // ここでは非同期の待機を呼び出し側で扱わないため、そのまま返却しても問題はない
                        // html2canvas 側では描画時点のフォント状態を使用
                        document.fonts.ready.catch(() => {});
                    }
                } catch (_) {}

                return slideContainer;
            },
            moveSlide(fromId, toId) {
                this.updateState(doc => {
                    const slides = doc.presentation.slides;
                    const fromIndex = slides.findIndex(s => s.id === fromId);
                    const toIndex = slides.findIndex(s => s.id === toId);
                    if (fromIndex !== -1 && toIndex !== -1) {
                        const [moved] = slides.splice(fromIndex, 1);
                        slides.splice(toIndex, 0, moved);
                    }
                });
            },
            duplicateSlide(slideId) {
                this.updateState(doc => {
                    const slideIndex = doc.presentation.slides.findIndex(s => s.id === slideId);
                    if (slideIndex === -1) return;

                    const originalSlide = doc.presentation.slides[slideIndex];
                    const newSlide = JSON.parse(JSON.stringify(originalSlide)); // Automerge object to plain JS
                    newSlide.id = Utils.generateId('slide');
                    newSlide.elements.forEach(el => el.id = Utils.generateId('el'));
                    
                    doc.presentation.slides.splice(slideIndex + 1, 0, newSlide);
                    doc.activeSlideId = newSlide.id;
                    doc.selectedElementIds = [];
                });
            },
            showContextMenu(e, id, content, handlers) {
                const oldMenu = document.getElementById(id);
                if (oldMenu) oldMenu.remove();
                
                const menu = document.createElement('div');
                menu.id = id;
                menu.className = 'context-menu';
                
                if (window.DOMPurify) {
                    menu.innerHTML = DOMPurify.sanitize(content);
                } else {
                    menu.innerHTML = content;
                }
                document.body.appendChild(menu);

                // メニューのサイズを取得 (DOMに追加されてからでないと正確なサイズが取れない)
                const menuWidth = menu.offsetWidth;
                const menuHeight = menu.offsetHeight;

                // 画面のサイズを取得
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let newX = e.clientX;
                let newY = e.clientY;

                // 右端が画面外に出る場合
                if (newX + menuWidth > viewportWidth) {
                    newX = viewportWidth - menuWidth - 10; // 10pxの余白
                }
                // 左端が画面外に出る場合 (通常は発生しないが念のため)
                if (newX < 0) {
                    newX = 10; // 10pxの余白
                }

                // 下端が画面外に出る場合
                if (newY + menuHeight > viewportHeight) {
                    newY = viewportHeight - menuHeight - 10; // 10pxの余白
                }
                // 上端が画面外に出る場合 (通常は発生しないが念のため)
                if (newY < 0) {
                    newY = 10; // 10pxの余白
                }

                Object.assign(menu.style, { left: `${newX}px`, top: `${newY}px` });
                
                Object.entries(handlers).forEach(([btnId, handler]) => {
                    const btn = document.getElementById(btnId);
                    if(btn) btn.onclick = () => { handler(); menu.remove(); };
                });
                
                setTimeout(() => document.addEventListener('click', function h(ev) {
                    if (!menu.contains(ev.target) && !App.elements.exportBtn.contains(ev.target)) {
                        menu.style.display = 'none';
                        document.removeEventListener('click', h);
                    }
                }, { once: true }), 10);
            },
            showSlideContextMenu(e, slideId) { this.showContextMenu(e, 'slide-context-menu', `<div style="padding:8px 12px;cursor:pointer;" id="slide-duplicate-btn">複製</div><div style="padding:8px 12px;cursor:pointer;color:var(--danger-color);" id="slide-delete-btn">削除</div>`, { 'slide-duplicate-btn': () => this.duplicateSlide(slideId), 'slide-delete-btn': () => { this.deleteSlide(slideId); } }); },
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
                    'el-delete-btn': () => {
                        const selectedIds = this.getState('selectedElementIds');
                        if (selectedIds.includes(elId) && selectedIds.length > 1) {
                            // 複数選択されている要素の中にelIdが含まれている場合、複数選択を維持して削除
                            this.deleteSelectedElements();
                        } else {
                            // 単一選択の場合、またはelIdが選択されていない場合、elIdのみを選択して削除
                            this.updateState('selectedElementIds', [elId]);
                            this.deleteSelectedElements();
                        }
                    }
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
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!slide) return;
                    const elementToDup = slide.elements.find(el => el.id === elId);
                    if (!elementToDup) return;

                    const newEl = JSON.parse(JSON.stringify(elementToDup));
                    newEl.id = Utils.generateId('el');
                    newEl.style.left = (newEl.style.left || 0) + 2;
                    newEl.style.top = (newEl.style.top || 0) + 2;
                    newEl.style.zIndex = slide.elements.length + 1;
                    
                    slide.elements.push(newEl);
                    doc.selectedElementIds = [newEl.id];
                });
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
                if (!window._slideClipboard) return;
                
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!slide) return;

                    const newIds = [];
                    const clipboardData = Array.isArray(window._slideClipboard) ? window._slideClipboard : [window._slideClipboard];

                    clipboardData.forEach(elData => {
                        const newEl = { ...elData }; // Shallow copy is enough as it's plain JS
                        newEl.id = Utils.generateId('el');
                        newEl.style.left = (newEl.style.left || 0) + 4;
                        newEl.style.top = (newEl.style.top || 0) + 4;
                        newEl.style.zIndex = slide.elements.length + 1;
                        slide.elements.push(newEl);
                        newIds.push(newEl.id);
                    });
                    doc.selectedElementIds = newIds;
                });
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
                    button.className = 'category-filter-btn';

                    if (category === 'すべて') {
                        button.classList.add('active');
                    }

                    button.addEventListener('click', () => {
                        filterContainer.querySelectorAll('button').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        button.classList.add('active');

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
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    if (!slide) return;

                    const defaultFontSize = 48;
                    const fontSize = style.fontSize || defaultFontSize;
                    const canvasWidth = doc.presentation.settings.width || CANVAS_WIDTH;
                    const canvasHeight = doc.presentation.settings.height || CANVAS_HEIGHT;

                    const newEl = {
                        id: Utils.generateId('el'),
                        type: 'icon',
                        iconType: iconType,
                        content: iconClass,
                        style: {
                            top: 20, left: 20,
                            width: (fontSize / canvasWidth) * 100,
                            height: (fontSize / canvasHeight) * 100,
                            rotation: 0, color: '#212529', fontSize: fontSize, animation: '',
                            zIndex: slide.elements.length + 1,
                            ...style
                        }
                    };

                    if (iconType === 'mi') {
                        newEl.miContent = iconClass;
                        const miStyleSelect = document.getElementById('mi-style-select');
                        if (miStyleSelect) {
                            newEl.content = miStyleSelect.value;
                        }
                    }

                    slide.elements.push(newEl);
                    doc.selectedElementIds = [newEl.id];
                });
            },
            // Inspectorでアイコンのスタイルを変更する関数
            updateIconStyle(element, newStylePrefix) {
                this.updateState(doc => {
                    const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                    const elToUpdate = slide?.elements.find(e => e.id === element.id);
                    if (!elToUpdate) return;

                    if (elToUpdate.iconType === 'fa') {
                        elToUpdate.content = element.content.replace(/^(fas|far|fal|fat)\s/, newStylePrefix + ' ');
                    } else if (elToUpdate.iconType === 'mi') {
                        elToUpdate.content = newStylePrefix;
                    }
                });
            },

        // 要素を最前面へ (配列の末尾に移動)
        bringElementToFront(elId) {
            this.updateState(doc => {
                const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                if (!slide) return;
                const fromIndex = slide.elements.findIndex(el => el.id === elId);
                if (fromIndex !== -1) {
                    const [element] = slide.elements.splice(fromIndex, 1);
                    slide.elements.push(element);
                    slide.elements.forEach((el, idx) => el.style.zIndex = idx + 1);
                }
            });
        },
        // 要素を最背面へ (配列の先頭に移動)
        sendElementToBack(elId) {
            this.updateState(doc => {
                const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                if (!slide) return;
                const fromIndex = slide.elements.findIndex(el => el.id === elId);
                if (fromIndex !== -1) {
                    const [element] = slide.elements.splice(fromIndex, 1);
                    slide.elements.unshift(element);
                    slide.elements.forEach((el, idx) => el.style.zIndex = idx + 1);
                }
            });
        },

        // 要素を一つ前面へ (配列内で一つ後ろに)
        bringElementForward(elId) {
            this.updateState(doc => {
                const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                if (!slide) return;
                const fromIndex = slide.elements.findIndex(el => el.id === elId);
                if (fromIndex !== -1 && fromIndex < slide.elements.length - 1) {
                    const [element] = slide.elements.splice(fromIndex, 1);
                    slide.elements.splice(fromIndex + 1, 0, element);
                    slide.elements.forEach((el, idx) => el.style.zIndex = idx + 1);
                }
            });
        },

        // 要素を一つ背面へ (配列内で一つ前に)
        sendElementBackward(elId) {
            this.updateState(doc => {
                const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                if (!slide) return;
                const fromIndex = slide.elements.findIndex(el => el.id === elId);
                if (fromIndex > 0) {
                    const [element] = slide.elements.splice(fromIndex, 1);
                    slide.elements.splice(fromIndex - 1, 0, element);
                    slide.elements.forEach((el, idx) => el.style.zIndex = idx + 1);
                }
            });
        },
        
        initGlobalCssEditor() {
            this._initCssEditor('global-css-input', this.state.presentation.settings.globalCss || '', (css) => {
                this.updateState(doc => {
                    doc.presentation.settings.globalCss = css;
                });
            });
        },

        initElementCssEditor(initialContent) {
            this._initCssEditor('element-css-editor-container', initialContent || '', (css) => {
                this.updateState(doc => {
                    const elId = doc.selectedElementIds[0];
                    if (elId) {
                        const slide = doc.presentation.slides.find(s => s.id === doc.activeSlideId);
                        const element = slide?.elements.find(e => e.id === elId);
                        if (element) {
                            element.style.customCss = css;
                        }
                    }
                });
            });
        },

        _initCssEditor(containerId, initialContent, onInputCallback) {
            const container = document.getElementById(containerId);
            if (!container) return;

            // 既存の要素をクリア
            container.innerHTML = '';

            // ラッパー要素を作成
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            container.appendChild(wrapper);

            let lineNumbers = document.createElement('div');
            lineNumbers.className = 'line-numbers';

            let textarea = document.createElement('textarea');
            textarea.className = 'css-editor-textarea';

            // 補完リスト
            const completionList = document.createElement('ul');
            completionList.className = 'css-completion-list';
            
            // ツールチップ
            const tooltip = document.createElement('div');
            tooltip.className = 'css-tooltip';

            wrapper.appendChild(textarea);
            wrapper.appendChild(lineNumbers);
            wrapper.appendChild(completionList);
            document.body.appendChild(tooltip); // body直下に追加

            textarea.value = initialContent;

            const updateLineNumbers = () => {
                const lines = textarea.value.split('\n').length;
                lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => (i+1)).join('<br>');
                lineNumbers.scrollTop = textarea.scrollTop;
            };

            textarea.addEventListener('input', () => {
                onInputCallback(textarea.value);
                updateLineNumbers();
                this.showCompletions(textarea, completionList);
            });
            
            textarea.addEventListener('scroll', () => {
                updateLineNumbers();
                completionList.style.display = 'none';
                tooltip.style.display = 'none';
            });
            
            textarea.addEventListener('keydown', (e) => this.handleCompletionKeyDown(e, textarea, completionList));
            
            textarea.addEventListener('mousemove', (e) => this.showTooltip(e, textarea, tooltip));
            textarea.addEventListener('mouseout', () => { tooltip.style.display = 'none'; });
            textarea.addEventListener('blur', () => {
                completionList.style.display = 'none';
                tooltip.style.display = 'none';
            });

            document.addEventListener('click', (e) => {
                if (container && !container.contains(e.target)) {
                    completionList.style.display = 'none';
                }
            });

            updateLineNumbers();
        },

        applyCustomCss() {
            const globalCss = this.state.presentation.settings.globalCss || '';
            document.getElementById('global-custom-styles').textContent = globalCss;

            const slide = this.getActiveSlide();
            if (!slide) return;
            
            let elementCss = '';
            slide.elements.forEach(el => {
                if (el.style.customCss) {
                    // コメントを除去し、各ルールを安全に解析して !important を付与する
                    const cssText = el.style.customCss.replace(/\/\*[\s\S]*?\*\//g, '');
                    const importantCss = cssText.split(';')
                        .map(rule => {
                            if (rule.includes(':')) {
                                const parts = rule.split(':');
                                const property = parts.shift().trim();
                                const value = parts.join(':').trim();
                                if (property && value) {
                                    return `${property}: ${value} !important`;
                                }
                            }
                            return null;
                        })
                        .filter(Boolean) // 無効なルールを除外
                        .join('; ');

                    if (importantCss && el.type === 'shape') {
                        // 図形要素の場合、ラッパーdivとSVG内部要素の両方に適用を試みる
                        // これにより、border-radiusのようなdiv向けスタイルと、fillのようなSVG向けスタイルが両方機能する
                        const shapeTags = ['rect', 'circle', 'polygon', 'line', 'path'];
                        const svgSelectors = shapeTags.map(tag => `[data-id="${el.id}"] svg ${tag}`).join(', ');
                        
                        // SVG内部要素へのスタイル
                        elementCss += `${svgSelectors} { ${importantCss} }\n`;
                        // ラッパーdivへのスタイル
                        elementCss += `[data-id="${el.id}"] { ${importantCss} }\n`;

                    } else if (importantCss) {
                        elementCss += `[data-id="${el.id}"] { ${importantCss} }\n`;
                    }
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
                            this.updateState(doc => {
                                doc.presentation = data.presentation;
                                doc.activeSlideId = data.presentation.slides[0]?.id || null;
                                doc.selectedElementIds = [];
                            });
                            
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
            this.updateState(doc => {
                const selectedElementIds = doc.selectedElementIds;
                const activeSlideId = doc.activeSlideId;
                if (selectedElementIds.length < 2) return;

                const newGroupId = Utils.generateId('group');
                if (!doc.presentation.groups) {
                    doc.presentation.groups = {};
                }
                if (!doc.presentation.groups[activeSlideId]) {
                    doc.presentation.groups[activeSlideId] = [];
                }
                
                doc.presentation.groups[activeSlideId].push({
                    id: newGroupId,
                    elementIds: [...selectedElementIds]
                });

                doc.selectedElementIds = [];
                doc.selectedGroupIds = [newGroupId];
            });
        },

        ungroupSelectedElements() {
            this.updateState(doc => {
                const selectedGroupIds = doc.selectedGroupIds;
                const activeSlideId = doc.activeSlideId;
                if (selectedGroupIds.length === 0) return;

                const slideGroups = doc.presentation.groups?.[activeSlideId] || [];
                const newSelectedElementIds = [];

                const remainingGroups = slideGroups.filter(g => {
                    if (selectedGroupIds.includes(g.id)) {
                        newSelectedElementIds.push(...g.elementIds);
                        return false;
                    }
                    return true;
                });
                
                if (doc.presentation.groups) {
                    doc.presentation.groups[activeSlideId] = remainingGroups;
                }
                doc.selectedGroupIds = [];
                doc.selectedElementIds = newSelectedElementIds;
            });
        },

        showCompletions(textarea, completionList) {
            const text = textarea.value;
            const cursorPos = textarea.selectionStart;

            const textBeforeCursor = text.substring(0, cursorPos);
            const lastColon = textBeforeCursor.lastIndexOf(':');
            const lastSemicolon = textBeforeCursor.lastIndexOf(';');
            const lastBrace = textBeforeCursor.lastIndexOf('{');

            if (lastColon > Math.max(lastSemicolon, lastBrace)) {
                completionList.style.display = 'none';
                return;
            }

            const lastTokenMatch = textBeforeCursor.match(/[\s;{]([a-zA-Z-]*)$/) || textBeforeCursor.match(/^([a-zA-Z-]*)$/);
            const currentWord = lastTokenMatch ? lastTokenMatch[1] : '';
            
            if (currentWord === '') {
                completionList.style.display = 'none';
                return;
            }

            const properties = Object.keys(this.cssProperties || {});
            const suggestions = properties.filter(p => p.startsWith(currentWord));

            if (suggestions.length === 0 || (suggestions.length === 1 && suggestions[0] === currentWord)) {
                completionList.style.display = 'none';
                return;
            }

            completionList.innerHTML = '';
            suggestions.slice(0, 10).forEach((suggestion, index) => {
                const li = document.createElement('li');
                li.textContent = suggestion;
                li.className = 'completion-item';
                if (index === 0) {
                    li.classList.add('selected');
                }
                li.addEventListener('mouseover', () => {
                    completionList.querySelectorAll('li').forEach(item => {
                        item.classList.remove('selected');
                    });
                    li.classList.add('selected');
                });
                li.addEventListener('click', () => {
                    this.applyCompletion(textarea, completionList, suggestion);
                });
                completionList.appendChild(li);
            });
            
            const coords = this.getCaretCoordinates(textarea, cursorPos);
            const textareaRect = textarea.getBoundingClientRect();
            
            completionList.style.display = 'block';
            completionList.style.left = `${textareaRect.left + coords.left}px`;
            completionList.style.top = `${textareaRect.top + coords.top + coords.height}px`;
        },

        applyCompletion(textarea, completionList, completion) {
            const text = textarea.value;
            const cursorPos = textarea.selectionStart;
            
            const textBeforeCursor = text.substring(0, cursorPos);
            const lastTokenMatch = textBeforeCursor.match(/([a-zA-Z-]*)$/);
            const wordToReplace = lastTokenMatch ? lastTokenMatch[0] : '';

            const before = text.substring(0, cursorPos - wordToReplace.length);
            const after = text.substring(cursorPos);
            
            textarea.value = `${before}${completion}: ;${after}`;
            
            const newCursorPos = (before + completion).length + 2;
            textarea.selectionStart = textarea.selectionEnd = newCursorPos;
            
            completionList.style.display = 'none';
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        },
        
        handleCompletionKeyDown(e, textarea, completionList) {
            if (completionList.style.display === 'none') return;

            const items = completionList.querySelectorAll('li');
            if (items.length === 0) return;

            let selectedIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (selectedIndex > -1) {
                    const completion = items[selectedIndex].textContent;
                    this.applyCompletion(textarea, completionList, completion);
                }
                return;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                completionList.style.display = 'none';
                return;
            }

            items.forEach((item, index) => {
                if (index === selectedIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
        },

        showTooltip(e, textarea, tooltip) {
            const text = textarea.value;
            const mousePos = this.getMousePositionInTextarea(e, textarea);
            if (mousePos < 0) {
                tooltip.style.display = 'none';
                return;
            }
            
            const { word } = this.getWordAtPosition(text, mousePos);

            if (word && this.cssProperties && this.cssProperties[word]) {
                tooltip.textContent = `${word}: ${this.cssProperties[word]}`;
                tooltip.style.display = 'block';
                tooltip.style.left = `${e.clientX + 15}px`;
                tooltip.style.top = `${e.clientY + 15}px`;
            } else {
                tooltip.style.display = 'none';
            }
        },

        getMousePositionInTextarea(e, textarea) {
            const rect = textarea.getBoundingClientRect();
            const x = e.clientX - rect.left - parseFloat(getComputedStyle(textarea).paddingLeft);
            const y = e.clientY - rect.top - parseFloat(getComputedStyle(textarea).paddingTop);
            
            const style = window.getComputedStyle(textarea);
            const lineHeight = parseFloat(style.lineHeight);
            const charWidth = this.getCharWidth(style.font);

            if (x < 0 || y < 0) return -1;
            
            const lineIndex = Math.floor(y / lineHeight);
            const lines = textarea.value.split('\n');
            if (lineIndex >= lines.length) return -1;

            const charIndexInLine = Math.round(x / charWidth);
            
            let pos = 0;
            for (let i = 0; i < lineIndex; i++) {
                pos += lines[i].length + 1; // +1 for newline
            }
            pos += charIndexInLine;

            return Math.min(pos, textarea.value.length);
        },

        getCharWidth(font) {
            const id = 'char-width-canvas';
            let canvas = document.getElementById(id);
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.id = id;
                document.body.appendChild(canvas);
            }
            const context = canvas.getContext("2d");
            context.font = font;
            const sample = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
            return context.measureText(sample).width / sample.length;
        },

        getWordAtPosition(text, pos) {
            const pre = text.substring(0, pos);
            const post = text.substring(pos);
            const wordStart = pre.search(/[a-zA-Z-]*$/);
            const wordEndMatch = post.match(/[^a-zA-Z-]/);
            const wordEnd = wordEndMatch ? post.indexOf(wordEndMatch[0]) : post.length;
            const word = text.substring(wordStart, pos + wordEnd);
            return { word, start: wordStart, end: pos + wordEnd };
        },

        getCaretCoordinates(element, position) {
            const properties = [
                'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
                'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
                'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
                'textAlign', 'textTransform', 'textIndent', 'textDecoration',
                'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
            ];
            const isBrowser = (typeof window !== 'undefined');
            const isFirefox = (isBrowser && window.mozInnerScreenX != null);

            const divId = 'input-textarea-caret-position-mirror-div';
            let div = document.getElementById(divId);
            if (!div) {
                div = document.createElement('div');
                div.id = divId;
                document.body.appendChild(div);
            }
            
            const style = div.style;
            const computed = window.getComputedStyle(element);
            
            style.whiteSpace = 'pre-wrap';
            style.wordWrap = 'break-word';
            style.position = 'absolute';
            style.visibility = 'hidden';
            
            properties.forEach(prop => { style[prop] = computed[prop]; });
            if (isFirefox) {
                if (element.scrollHeight > parseInt(computed.height))
                    style.overflowY = 'scroll';
            } else {
                style.overflow = 'hidden';
            }
            div.textContent = element.value.substring(0, position);
            
            const span = document.createElement('span');
            span.textContent = element.value.substring(position) || '.';
            div.appendChild(span);
            
            const coordinates = {
                top: span.offsetTop + parseInt(computed['borderTopWidth']),
                left: span.offsetLeft + parseInt(computed['borderLeftWidth']),
                height: parseInt(computed['lineHeight'])
            };
            
            return coordinates;
        },

        async loadCssProperties() {
            try {
                const response = await fetch('/static/slide/cssproperty.json');
                if (!response.ok) {
                    throw new Error('Failed to load CSS properties');
                }
                this.cssProperties = await response.json();
            } catch (error) {
                ErrorHandler.handle(error, 'css_properties_load');
                this.cssProperties = {};
            }
        },

        applyPageBackground(container = null) {
            const settings = this.getState('presentation.settings');
            const { backgroundType, backgroundColor, gradientStart, gradientEnd, gradientAngle } = settings;
            
            // Update UI controls (only if not in presentation mode)
            if (!container) {
                if (this.elements.gradientStartColor) this.elements.gradientStartColor.value = gradientStart;
                if (this.elements.gradientEndColor) this.elements.gradientEndColor.value = gradientEnd;
                if (this.elements.gradientAngle) this.elements.gradientAngle.value = gradientAngle;
                if (this.elements.gradientAngleValue) this.elements.gradientAngleValue.textContent = gradientAngle;

                if (this.elements.backgroundTypeSelector) {
                    this.elements.backgroundTypeSelector.querySelectorAll('button').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.bgType === backgroundType);
                    });
                }
                if (this.elements.solidColorSettings) {
                    this.elements.solidColorSettings.style.display = backgroundType === 'solid' ? 'block' : 'none';
                }
                if (this.elements.gradientSettings) {
                    this.elements.gradientSettings.style.display = backgroundType === 'gradient' ? 'block' : 'none';
                }
            }

            // Apply style to canvas or provided container
            const targetContainer = container || this.elements.slideCanvas;
            if (targetContainer) {
                if (backgroundType === 'gradient') {
                    targetContainer.style.background = `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientEnd})`;
                } else {
                    targetContainer.style.background = backgroundColor;
                    // 単色モードの場合、カラーピッカーの状態を現在の色に更新する
                    if (!container && this.pageBgColorPicker) {
                        this.pageBgColorPicker.setColor(backgroundColor);
                    }
                }
           }
        },
            _bindWikiImageSearchEvents() {
                if (this.elements.wikiImageSearchBtn) {
                    this.elements.wikiImageSearchBtn.addEventListener('click', () => this.handleWikiImageSearch());
                }
                if (this.elements.wikiImageSearchInput) {
                    this.elements.wikiImageSearchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.handleWikiImageSearch();
                        }
                    });
                }
                if (this.elements.wikiImageResultsContainer) {
                    this.elements.wikiImageResultsContainer.addEventListener('click', (e) => {
                        const item = e.target.closest('.wiki-image-item');
                        if (item && item.dataset.imageUrl) {
                            // 画像追加時、Base64ではなくURLを直接渡す
                            this.addElement('image', item.dataset.imageUrl);
                        }
                    });
                }
            },

            async handleWikiImageSearch() {
                const keyword = this.elements.wikiImageSearchInput.value.trim();
                if (!keyword) return;

                this.elements.wikiImageLoading.style.display = 'block';
                this.elements.wikiImageResultsContainer.innerHTML = '';

                try {
                    const response = await fetch(`/wiki/image/${encodeURIComponent(keyword)}`);
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ detail: 'Server error' }));
                        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();

                    if (data.image_urls && data.image_urls.length > 0) {
                        data.image_urls.forEach(url => {
                            const item = document.createElement('div');
                            item.className = 'wiki-image-item';
                            item.dataset.imageUrl = url;
                            
                            const img = document.createElement('img');
                            img.src = url;
                            img.alt = keyword;
                            img.loading = 'lazy'; // Lazy loading for images
                            
                            item.appendChild(img);
                            this.elements.wikiImageResultsContainer.appendChild(item);
                        });
                    } else {
                        this.elements.wikiImageResultsContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">画像が見つかりませんでした。</p>';
                    }
                } catch (error) {
                    console.error('Wikipedia image search failed:', error);
                    this.elements.wikiImageResultsContainer.innerHTML = `<p style="color: var(--danger-color); text-align: center;">画像の検索中にエラーが発生しました。<br>${error.message}</p>`;
                    ErrorHandler.handle(error, 'wiki_image_search');
                } finally {
                    this.elements.wikiImageLoading.style.display = 'none';
                }
            }
        }; // ここでAppオブジェクトが閉じられる

        // 埋め込み警告ユーティリティ + モーダル制御（統合版）
        // slide.html では「簡易版(embed-modal-*)」と「上級版(embed-modal-advanced)」の2種類のIDが存在する。
        // 本関数はまず上級版(advanced)の要素群を優先して取得し、無ければ簡易版(simple)をフォールバックとして使用する。
        (function attachEmbedWarningAPI(){
            let warnedUrls = new Set();
            let warnedOnceThisSession = false;

            function getWarningEl() {
            const el = document.getElementById('embed-warning');
            if (!el) return null;
            const close = document.getElementById('embed-warning-close');
            if (close && !close._bound) {
                close._bound = true;
                close.addEventListener('click', () => {
                el.style.display = 'none';
                });
            }
            return el;
            }

            App.showEmbedWarning = function(message, opts = {}) {
            const { oncePerUrl = false, url = null, oncePerSession = false } = opts;
            if (oncePerSession && warnedOnceThisSession) return;
            if (oncePerUrl && url && warnedUrls.has(url)) return;

            const warnEl = getWarningEl();
            if (!warnEl) return;
            const msgEl = document.getElementById('embed-warning-message');
            if (msgEl) msgEl.textContent = message;

            warnEl.style.display = 'block';

            if (oncePerSession) warnedOnceThisSession = true;
            if (oncePerUrl && url) warnedUrls.add(url);
            };

            // 埋め込みモーダルの制御（URL検証 + デバウンス + 既定 allow-scripts + 危険URLはプレビューしない/挿入禁止）
            App.openEmbedModal = function() {
            // 1) 上級版(advanced)を優先
            let modalId = 'embed-modal-advanced';
            let urlInput   = document.getElementById('embed-url-input-advanced');
            let widthInput = document.getElementById('embed-width-input-advanced');
            let heightInput= document.getElementById('embed-height-input-advanced');
            let preview    = document.getElementById('embed-preview-advanced');
            let insertBtn  = document.getElementById('embed-insert-btn-advanced');

            // 2) 無ければ簡易版(simple)にフォールバック
            if (!urlInput || !widthInput || !heightInput || !preview || !insertBtn) {
                modalId   = 'embed-modal';
                urlInput  = document.getElementById('embed-url-input-simple');
                widthInput= document.getElementById('embed-width-input-simple');
                heightInput = document.getElementById('embed-height-input-simple');
                preview   = document.getElementById('embed-preview-simple');
                insertBtn = document.getElementById('embed-insert-btn-simple');
            }

            if (!urlInput || !preview || !insertBtn) {
                ErrorHandler.showNotification('埋め込みモーダルの初期化に失敗しました', 'error');
                return;
            }

            // 初期値
            urlInput.value = '';
            widthInput.value = 50;
            heightInput.value = 50;
            preview.removeAttribute('src');

            // 上級者向け: アコーディオン開閉
            const advToggle = document.getElementById('embed-advanced-toggle');
            const advPanel  = document.getElementById('embed-advanced-panel');
            if (advToggle && advPanel && !advToggle._bound) {
                advToggle._bound = true;
                advToggle.addEventListener('click', () => {
                const expanded = advToggle.getAttribute('aria-expanded') === 'true';
                advToggle.setAttribute('aria-expanded', String(!expanded));
                advPanel.hidden = expanded;
                const icon = advToggle.querySelector('i.fas');
                if (icon) {
                    icon.classList.toggle('fa-chevron-right', expanded);
                    icon.classList.toggle('fa-chevron-down', !expanded);
                }
                });
            }

            // デフォルト sandbox は allow-scripts のみ
            document.querySelectorAll('.embed-sbx').forEach(cb => {
                if (cb.value === 'allow-scripts') cb.checked = true;
                else cb.checked = false;
            });
            if (preview) preview.setAttribute('sandbox', 'allow-scripts');

            // URL形式チェック用ヘルパ
            const isValidHttpUrl = (val) => {
                try {
                const u = new URL(val, window.location.origin);
                if (!/^https?:$/.test(u.protocol)) return false;
                // ドメイン風または localhost/127.0.0.1 許可
                const hostOk = /([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname) || /^localhost$/.test(u.hostname) || /^127\.0\.0\.1$/.test(u.hostname);
                // パスは任意、ただしスキーム直後のtypoを粗検知
                const typoLike = /https?:;\/\/|https?:\/\/\/|https?:\/\/:|https?:\/\/\s/i.test(val);
                return hostOk && !typoLike;
                } catch {
                return false;
                }
            };

            // 入力終了待ちのデバウンス
            let embedUrlTimer = null;
            const schedulePreview = () => {
                clearTimeout(embedUrlTimer);
                embedUrlTimer = setTimeout(updatePreview, 500);
            };

            // プレビュー更新関数（安全チェック結果に応じて厳格制御）
            const updatePreview = async () => {
                const url = urlInput.value.trim();

                // sandboxの組み立て（デフォルト allow-scripts）
                const sbx = (() => {
                const selected = Array.from(document.querySelectorAll('.embed-sbx:checked')).map(i => i.value);
                if (selected.length === 0) return 'allow-scripts';
                return selected.join(' ');
                })();
                if (preview) preview.setAttribute('sandbox', sbx);

                // 入力なしならクリア
                if (!url) {
                if (preview) {
                    preview.removeAttribute('src');
                    preview.title = '';
                }
                urlInput.setCustomValidity('');
                urlInput.reportValidity();
                // 追加ボタンの存在チェック（両モーダル対応）
                const insertBtn = document.getElementById('embed-insert-btn-advanced') || document.getElementById('embed-insert-btn-simple');
                if (insertBtn) insertBtn.disabled = true;
                return;
                }

                // URL形式検証
                if (!isValidHttpUrl(url)) {
                if (preview) {
                    preview.removeAttribute('src');
                    preview.title = '';
                }
                urlInput.setCustomValidity('有効な http/https のURLを入力してください。例: https://example.com/page');
                urlInput.reportValidity();
                const insertBtn = document.getElementById('embed-insert-btn-advanced') || document.getElementById('embed-insert-btn-simple');
                if (insertBtn) insertBtn.disabled = true;
                return;
                }

                // 一旦バリデーションOK
                urlInput.setCustomValidity('');
                urlInput.reportValidity();

                // ここでサーバの安全チェックを実施。安全でなければプレビューしない
                let safeCheck = { safe: false, reason: 'error' };
                try {
                const uTmp = new URL(url, window.location.origin);
                safeCheck = await Utils.checkUrlSafety(uTmp.toString());
                } catch (_) {
                safeCheck = { safe: false, reason: 'invalid_url' };
                }

                const insertBtn = document.getElementById('embed-insert-btn-advanced') || document.getElementById('embed-insert-btn-simple');
                if (!safeCheck.safe) {
                // 危険/不正/エラー時はプレビューをロードしない
                if (preview) {
                    preview.removeAttribute('src');
                    preview.title = '';
                }
                if (insertBtn) insertBtn.disabled = true;

                // 既存の警告バナーを使用してユーザーに通知
                const reason = safeCheck.reason || 'error';
                if (reason === 'matched') {
                    const matched = (safeCheck.matched_domain || '');
                    const srcName = (safeCheck.source || '');
                    App.showEmbedWarning(`危険なURLとしてブロックリストに一致しました（${matched} / ${srcName}）。このURLはプレビューできません。`, { oncePerUrl: false, url });
                } else if (reason === 'invalid_url') {
                    App.showEmbedWarning('URLが正しくありません。プレビューできません。', { oncePerUrl: false, url });
                } else {
                    App.showEmbedWarning('安全性チェックで問題が検出されました。プレビューできません。', { oncePerUrl: false, url });
                }
                return;
                }

                // 安全な場合のみプレビューを表示
                try {
                const u = new URL(url, window.location.origin);
                if (preview) {
                    preview.src = u.toString();
                    preview.title = u.toString();
                }
                if (insertBtn) insertBtn.disabled = false;
                } catch {
                if (preview) {
                    preview.removeAttribute('src');
                    preview.title = '';
                }
                if (insertBtn) insertBtn.disabled = true;
                }
            };

            // デバウンスを適用
            if (urlInput) urlInput.oninput = schedulePreview;
            document.querySelectorAll('.embed-sbx').forEach(cb => cb.onchange = updatePreview);

            // URL入力前に注意喚起（モーダルオープン時に一度）
            App.showEmbedWarning('外部サイトのコンテンツを埋め込む前に、提供元が信頼できることを確認してください。', { oncePerSession: true });

            // 追加ボタン
            if (!insertBtn._bound) {
                insertBtn._bound = true;
                insertBtn.addEventListener('click', () => {
                const url = (urlInput?.value || '').trim();
                if (!url) {
                    alert('URLを入力してください');
                    return;
                }
                if (!isValidHttpUrl(url)) {
                    alert('http/https の正しいURLを入力してください。');
                    return;
                }
                let u;
                try {
                    u = new URL(url, window.location.origin);
                    if (!/^https?:$/.test(u.protocol)) {
                    alert('http/https のURLのみ許可されます。');
                    return;
                    }
                } catch {
                    alert('不正なURLです。正しいURLを入力してください。');
                    return;
                }

                // 追加前に警告（ここで必ず表示）
                App.showEmbedWarning(`以下のURLを埋め込みます: ${u.toString()}
    外部サイトのスクリプトが実行される可能性があります。信頼できる提供元か確認してください。`, { oncePerUrl: false, url: u.toString() });

                // sandbox属性（未選択時でも allow-scripts を強制）
                const selectedSbx = Array.from(document.querySelectorAll('.embed-sbx:checked')).map(i => i.value);
                const sandbox = (selectedSbx.length ? selectedSbx.join(' ') : 'allow-scripts');
                // サイズ
                const w = Math.max(10, Math.min(100, Number(widthInput?.value) || 50));
                const h = Math.max(10, Math.min(100, Number(heightInput?.value) || 50));

                // 実際に要素を追加
                const slide = App.getActiveSlide();
                if (!slide) return;

                const newElStyle = { top: 20, left: 20, width: w, height: h, zIndex: slide.elements.length + 1, rotation: 0, animation: '' };
                const content = { url: u.toString(), sandbox: sandbox || 'allow-scripts' };
                const added = App.addElementToSlide(slide.id, 'iframe', content, newElStyle);
                if (added) {
                App.updateState(doc => {
                    doc.selectedElementIds = [added.id];
                });
                if (typeof MicroModal !== 'undefined') MicroModal.close(modalId);
                }
                });
            }

            // モーダルを開く
            if (typeof MicroModal !== 'undefined') {
                MicroModal.show(modalId, {
                awaitCloseAnimation: true,
                disableScroll: true
                });
            } else {
                ErrorHandler.showNotification('モーダルライブラリが読み込まれていません', 'error');
            }
            };
        })();



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
    // qr-code-styling用QRコードプレビュー・生成
    let qrStylingInstance = null;
    const qrTextInput = document.getElementById('qr-text');
    const qrSizeInput = document.getElementById('qr-size');
    const qrLogoUpload = document.getElementById('qr-logo-upload');
    let qrLogoDataUrl = null;

    let qrColorPicker;
    let qrBgColorPicker;

    // QRコードスタイル変数
    let selectedDotStyle = 'square';
    let selectedCornerStyle = 'square';

    async function updateQRPreview() {
        const text = qrTextInput.value;
        const size = parseInt(qrSizeInput.value) || 256;
        const color = qrColorPicker ? qrColorPicker.currentColorString : '#000000FF';
        const bgColor = qrBgColorPicker ? qrBgColorPicker.currentColorString : '#FFFFFFFF';
        const preview = document.getElementById('qr-preview');
        const warning = document.getElementById('qr-warning');
        const form = document.getElementById('qr-create-form');

        preview.innerHTML = '';

        if (!text) {
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.innerHTML = '<span style="color: #6c757d;">QRコード内容を入力してください</span>';
            if (warning) {
                warning.style.display = 'none';
                warning.textContent = '';
            }
            // 入力空時は枠線をリセット
            const inputEl = document.getElementById('qr-text');
            if (inputEl) inputEl.style.outline = '';
            return;
        }

        const typoPattern = /(?:^|[^a-zA-Z])(h{1,2}t{1,2}p[s]?:\/\/|ttp[s]?:\/\/|https?:;\/\/|https?:\/\/\/|https?:\/\/$|https?:\/\/:|https?:\/\/\s|https?:\/\/\W|https?:\/{1,2}[^a-zA-Z0-9])/i;
        const correctPattern = /^https?:\/\/[a-zA-Z0-9]/;

        if (typoPattern.test(text) && !correctPattern.test(text.trim())) {
            const typoMatch = text.match(/(h{1,2}t{1,2}p[s]?:\/\/|ttp[s]?:\/\/|https?:;\/\/|https?:\/\/\/|https?:\/\/$|https?:\/\/:|https?:\/\/\s|https?:\/\/\W|https?:\/{1,2}[^a-zA-Z0-9])/i);
            let typoExample = '';
            if (typoMatch && typoMatch[0]) {
              typoExample = `（${typoMatch[0]}...）`;
            }
            if (warning) {
                warning.style.display = 'block';
                warning.style.background = '#fff8e1';
                warning.style.border = '1px solid #ffe58f';
                warning.style.color = '#664d03';
                warning.innerHTML = `URLにタイプミスがあります${typoExample}<br><span style="font-size:90%;">（例: hhtps://, https;//, https:/, http;//, ttp://, https::// など）<br>正しいURLか確認してください。</span>`;
            }
            const inputEl = document.getElementById('qr-text');
            if (inputEl) inputEl.style.outline = '2px solid #ff9f1a'; // タイプミスは黄色系
        } else {
            if (warning) {
                warning.style.display = 'none';
                warning.textContent = '';
            }
        }

        // URL候補か判定
        let urlCandidate = null;
        try {
            if (/^https?:/i.test(text)) {
                const u = new URL(text);
                urlCandidate = u.toString();
            }
        } catch(_){}

        // URLでない純テキストは赤枠不要
        if (!urlCandidate) {
            const inputEl = document.getElementById('qr-text');
            if (inputEl) inputEl.style.outline = '';
        } else {
            // 危険URLのときの赤枠と明確な警告文を追加
            try {
                const result = await Utils.checkUrlSafety(urlCandidate);
                if (!result.safe) {
                    const inputEl = document.getElementById('qr-text');
                    if (inputEl) inputEl.style.outline = '2px solid #b00020'; // 危険は赤枠
                    if (warning) {
                        if (result.reason === 'matched') {
                            warning.style.display = 'block';
                            warning.style.background = '#fff4f4';
                            warning.style.border = '1px solid #ff9aa2';
                            warning.style.color = '#b00020';
                            const matched = Utils.sanitizeHtml(result.matched_domain || '');
                            const source = Utils.sanitizeHtml(result.source || '');
                            warning.innerHTML = `危険なURLとして検出されました。<br>一致ドメイン: <code>${matched}</code>（${source}）<br><strong>この内容ではQRを作成できません。</strong>`;
                        } else if (result.reason === 'invalid_url') {
                            warning.style.display = 'block';
                            warning.style.background = '#fff8e1';
                            warning.style.border = '1px solid #ffe58f';
                            warning.style.color = '#664d03';
                            warning.innerHTML = 'URLの形式が正しくありません。<br><span style="font-size:90%;">URLを修正するか、テキストに変更してください。</span>';
                        } else {
                            warning.style.display = 'block';
                            warning.style.background = '#fff8e1';
                            warning.style.border = '1px solid #ffe58f';
                            warning.style.color = '#664d03';
                            warning.textContent = '安全性チェックでエラーが発生しました。';
                        }
                    }
                } else {
                    // 安全なURLは緑系アウトラインでフィードバック
                    const inputEl = document.getElementById('qr-text');
                    if (inputEl) inputEl.style.outline = '2px solid #0f5132';
                    if (warning) {
                        warning.style.display = 'block';
                        warning.style.background = '#e7f7ee';
                        warning.style.border = '1px solid #b7ebd1';
                        warning.style.color = '#0f5132';
                        warning.textContent = '安全なURLです。';
                    }
                }
            } catch {
                const inputEl = document.getElementById('qr-text');
                if (inputEl) inputEl.style.outline = '2px solid #ff9f1a';
                if (warning) {
                    warning.style.display = 'block';
                    warning.style.background = '#fff8e1';
                    warning.style.border = '1px solid #ffe58f';
                    warning.style.color = '#664d03';
                    warning.textContent = '安全性チェック中にエラーが発生しました。';
                }
            }
        }

        // プレビュー描画（ローカル生成）
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

    [qrTextInput].forEach(input => {
        if (input) {
            input.addEventListener('input', updateQRPreview);
            // URL安全チェック結果に応じた視覚的フィードバック（赤枠）を同期
            const warning = document.getElementById('qr-warning');
            input.addEventListener('input', () => {
                if (!warning) return;
                // warning の色に応じて枠色変更
                if (warning.style.color === 'rgb(176, 0, 32)' || warning.style.color.toLowerCase().includes('#b00020')) {
                    input.style.outline = '2px solid #b00020';
                } else if (warning.style.color === 'rgb(15, 81, 50)' || warning.style.color.toLowerCase().includes('#0f5132')) {
                    input.style.outline = '2px solid #0f5132';
                } else {
                    input.style.outline = '';
                }
            });
        }
    });

    // QRコードカラーピッカーの初期化
    const qrColorContainer = document.querySelector('.qr-color-picker-wrapper #qr-color');
    if (qrColorContainer) {
        qrColorContainer.innerHTML = ''; // 既存のinputをクリア
        qrColorPicker = new ColorPicker(qrColorContainer, '#000000FF', (color) => {
            updateQRPreview();
        }, { paletteKey: 'qrColorPalette' });
    }

    const qrBgColorContainer = document.querySelector('.qr-color-picker-wrapper #qr-bg-color');
    if (qrBgColorContainer) {
        qrBgColorContainer.innerHTML = ''; // 既存のinputをクリア
        qrBgColorPicker = new ColorPicker(qrBgColorContainer, '#FFFFFFFF', (color) => {
            updateQRPreview();
        }, { paletteKey: 'qrBgColorPalette' });
    }

    const qrForm = document.getElementById('qr-create-form');
    if (qrForm) {
        qrForm.onsubmit = async function(ev) {
            ev.preventDefault();
            const inputEl = document.getElementById('qr-text');
            const val = (inputEl?.value || '').trim();

            // URL風の文字列なら念のため最終チェック（_bindQrModalUrlSafety と同等）
            let urlCandidate = null;
            try { if (/^https?:/i.test(val)) urlCandidate = new URL(val).toString(); } catch(_){}
            if (urlCandidate) {
                const result = await Utils.checkUrlSafety(urlCandidate);
                if (!result.safe) {
                    const warning = document.getElementById('qr-warning');
                    if (warning) {
                        if (result.reason === 'matched') {
                            warning.style.display = 'block';
                            warning.style.background = '#fff4f4';
                            warning.style.border = '1px solid #ff9aa2';
                            warning.style.color = '#b00020';
                            warning.innerHTML = `ブロックリストに一致しました。<br>一致ドメイン: <code>${Utils.sanitizeHtml(result.matched_domain || '')}</code>（${Utils.sanitizeHtml(result.source || '')}）`;
                        } else if (result.reason === 'invalid_url') {
                            warning.style.display = 'block';
                            warning.style.background = '#fff8e1';
                            warning.style.border = '1px solid #ffe58f';
                            warning.style.color = '#664d03';
                            warning.textContent = 'URLの形式が正しくありません。';
                        } else {
                            warning.style.display = 'block';
                            warning.style.background = '#fff8e1';
                            warning.style.border = '1px solid #ffe58f';
                            warning.style.color = '#664d03';
                            warning.textContent = '安全性チェックでエラーが発生しました。';
                        }
                    }
                    // 危険/不正はここで中断
                    return;
                }
            }

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
        // デフォルトカラーをRGBA形式で定義
        const defaultColors = [
            'rgba(0, 123, 255, 1)', 'rgba(40, 167, 69, 1)', 'rgba(220, 53, 69, 1)',
            'rgba(255, 193, 7, 1)', 'rgba(111, 66, 193, 1)', 'rgba(232, 62, 140, 1)',
            'rgba(32, 201, 151, 1)', 'rgba(253, 126, 20, 1)', 'rgba(108, 117, 125, 1)',
            'rgba(13, 202, 240, 1)'
        ];
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
                    backgroundColor: ['pie', 'doughnut'].includes(chartType) ? colors : colors[0], // RGBA対応
                    borderColor: ['pie', 'doughnut'].includes(chartType) ? colors : colors[0], // RGBA対応
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

    // チャートカラーピッカーの初期化
    const chartColorsContainer = document.getElementById('chart-colors');
    let chartColorsPicker;
    if (chartColorsContainer) {
        chartColorsContainer.style.display = 'none'; // 既存のinputを非表示
        const newDiv = document.createElement('div');
        chartColorsContainer.parentNode.insertBefore(newDiv, chartColorsContainer.nextSibling);
        chartColorsPicker = new ColorPicker(newDiv, '#007bff', (color) => {
            // カスタムカラー入力フィールドに値を反映
            chartColorsContainer.value = color;
            updateChartPreview();
        }, { paletteKey: 'chartColorPalette' });
    }

    const chartInputs = ['chart-type', 'chart-dataset-label', 'chart-line-width', 'chart-show-legend', 'chart-title', 'chart-show-grid'];
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

            // Chart.jsのconfigから非シリアライズ可能なプロパティを削除
            const cleanConfig = Utils.deepClone(chartInstance.config);
            if (cleanConfig.options && cleanConfig.options.plugins && cleanConfig.options.plugins.legend && cleanConfig.options.plugins.legend.labels) {
                // Chart.jsが追加する可能性のある関数を削除
                delete cleanConfig.options.plugins.legend.labels.generateLabels;
            }
            
            const newElContent = Utils.deepClone(cleanConfig);
            const newElStyle = { top: 20, left: 20, width: 50, height: 30, zIndex: slide.elements.length + 1, rotation: 0, animation: '' };

            // App.addElementToSlide を使用して要素を追加
            const addedElement = App.addElementToSlide(slide.id, 'chart', newElContent, newElStyle);
            
            if (addedElement) {
                App.updateState(doc => {
                    doc.selectedElementIds = [addedElement.id];
                });
                MicroModal.close('chart-modal');
            }
        };
    }

    // 2. サイドバーリサイズハンドラの初期化 (デスクトップのみ有効)
    // モバイルではleft-sidebarがdisplay:noneなので不要
    if (window.innerWidth > 768) { // デスクトップ幅の場合のみ有効
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
    }

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
        labelInput.value = label.replace(/</g, "<").replace(/>/g, ">"); // Escape HTML
        labelInput.style.cssText = 'width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;';
        labelCell.appendChild(labelInput);

        const valueCell = document.createElement('td');
        valueCell.style.padding = '4px';
        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.dataset.type = 'value';
        valueInput.value = value.replace(/</g, "<").replace(/>/g, ">"); // Escape HTML
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

    // 「埋め込み」ボタンにモーダル起動をバインド（重複バインド防止付き）
    const addIframeBtn = document.getElementById('add-iframe-btn');
    if (addIframeBtn && !addIframeBtn._embedBound) {
        addIframeBtn._embedBound = true;
        addIframeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof App.openEmbedModal === 'function') {
                App.openEmbedModal();
            } else {
                // フォールバック: 直接の注意喚起のみ
                App.showEmbedWarning('外部サイトのコンテンツを埋め込む前に、提供元が信頼できることを確認してください。', { oncePerSession: true });
            }
        });
    }

    // 5. Appの初期化を待ってから、依存する機能を初期化
    window.addEventListener('app-initialized', () => {
        window.aiHandler = App.aiHandler = new AIHandler(App);
    });

    await App.init();

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