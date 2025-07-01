/**
 * AIとの対話、コマンド生成、実行、自律モードを管理するクラス
 */
class AIHandler {
    /**
     * @param {App} app - メインアプリケーションのインスタンス
     */
    constructor(app) {
        this.app = app;
        this.state = app.state;
        this.elements = app.elements;
        this.apiEndpoint = 'http://localhost:3000/ask-ai';
        this.aiMode = 'design'; // 'design', 'plan', 'ask'
        
        /** @type {Array<{role: 'user' | 'assistant', content: string}>} */
        this.chatHistory = []; // 対話履歴を保持
        this.autonomousAgent = null; // 自律モードエージェントのインスタンス

        this.init();
    }

    // --- 初期化とイベント関連 ---

    init() {
        this.cacheAIElements();
        this.bindEvents();
    }

    cacheAIElements() {
        // 通常モード用
        this.elements.aiChatInput = document.getElementById('chat-input');
        this.elements.sendChatBtn = document.getElementById('send-chat-btn');
        this.elements.aiChatOutput = document.getElementById('chat-messages');
        
        // コントロール
        this.elements.restoreCheckpointBtn = document.getElementById('restore-checkpoint-btn');
        this.elements.autonomousModeToggle = document.getElementById('autonomous-mode-toggle');
        this.elements.autoExecuteToggle = document.getElementById('auto-execute-toggle');

        // 自律モード用
        this.elements.autonomousGoalContainer = document.getElementById('autonomous-goal-container');
        this.elements.autonomousGoalInput = document.getElementById('autonomous-goal-input');
        this.elements.startAutonomousBtn = document.getElementById('start-autonomous-btn');

        // モードセレクター
        this.elements.aiModeButtons = document.querySelectorAll('.ai-mode-btn');
    }

    bindEvents() {
        this.elements.sendChatBtn.addEventListener('click', () => this.handleSendMessage());
        this.elements.aiChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.elements.aiChatOutput.addEventListener('click', async (e) => {
            if (e.target.classList.contains('execute-btn')) {
                await this.handleExecuteCommandClick(e.target);
            }
        });

        this.elements.restoreCheckpointBtn.addEventListener('click', () => this.restoreAICheckpoint());
        
        this.elements.autonomousModeToggle.addEventListener('change', (e) => {
            this.toggleAutonomousModeUI(e.target.checked);
        });

        this.elements.startAutonomousBtn.addEventListener('click', () => {
            const goal = this.elements.autonomousGoalInput.value.trim();
            if (goal) {
                this.startAutonomousMode(goal);
            } else {
                alert('自律モードの最終目標を入力してください。');
            }
        });

        this.elements.aiModeButtons.forEach(button => {
            button.addEventListener('click', () => {
                const newMode = button.dataset.mode;
                this.setAIMode(newMode);
            });
        });
    }

    // --- UI操作とハンドラ ---

    async handleSendMessage() {
        const message = this.elements.aiChatInput.value.trim();
        if (!message) return;

        this.displayMessage(message, 'user');
        this.chatHistory.push({ role: 'user', content: message });
        if (this.chatHistory.length > 20) this.chatHistory.splice(0, this.chatHistory.length - 20);
        this.elements.aiChatInput.value = '';

        const loadingMsgDiv = this.displayMessage('AIが応答を生成中...', 'loading');

        try {
            // 「聞く」モードの場合、コマンド生成をスキップ
            if (this.aiMode === 'ask') {
                const systemPrompt = this.generateCommandSystemPrompt();
                const aiResponse = await this.askAI(this.chatHistory, systemPrompt);
                loadingMsgDiv.remove();
                this.chatHistory.push({ role: 'assistant', content: aiResponse });
                if (this.chatHistory.length > 20) this.chatHistory.splice(0, this.chatHistory.length - 20);
                this.displayMessage(aiResponse, 'ai');
                return;
            }

            // デザインモードと計画モード
            const aiXmlCommand = await this.askAIForCommand(this.chatHistory);
            loadingMsgDiv.remove();

            this.chatHistory.push({ role: 'assistant', content: aiXmlCommand });
            if (this.chatHistory.length > 20) this.chatHistory.splice(0, this.chatHistory.length - 20);
            const aiResponseElements = this.displayAIResponse(aiXmlCommand);

            if (this.elements.autoExecuteToggle?.checked && aiResponseElements.executeBtn) {
                aiResponseElements.executeBtn.textContent = '自動実行中...';
                aiResponseElements.executeBtn.disabled = true;
                await this.executeAndDisplayResult(aiXmlCommand, aiResponseElements.resultContainer);
                aiResponseElements.executeBtn.style.display = 'none';
            }

        } catch (error) {
            loadingMsgDiv.remove();
            this.displayMessage(`エラー: ${error.message}`, 'error');
            console.error('Error during AI interaction:', error);
        }
    }
    
    async handleExecuteCommandClick(button) {
        const commandText = button.dataset.command;
        const resultContainer = button.nextElementSibling;
        button.disabled = true;
        button.textContent = '実行中...';
        
        await this.executeAndDisplayResult(commandText, resultContainer);
        
        button.style.display = 'none'; // 実行後はボタンを隠す
    }

    async executeAndDisplayResult(commandText, resultContainer) {
        // 実行前にチェックポイントを作成
        this.createAICheckpoint();
        try {
            const result = await this.executeCommand(commandText);
            
            if (result.success) {
                resultContainer.className = 'success-msg';
                let message = result.message || 'コマンドが正常に実行されました。';
                if (result.slide) {
                    const formattedJson = JSON.stringify(result.slide, null, 2);
                    message = `スライド(ID: ${result.slide.id})の内容:\n<pre>${formattedJson.replace(/</g, '<')}</pre>`;
                }
                resultContainer.innerHTML = `✅ 成功: ${message}`;
            } else {
                resultContainer.className = 'error-msg';
                resultContainer.innerHTML = `❌ 失敗: ${result.message}`;
            }
        } catch (error) {
            resultContainer.className = 'error-msg';
            resultContainer.innerHTML = `❌ エラー: ${error.message}`;
        }
        resultContainer.style.display = 'block';
    }
    
    displayMessage(content, type, subTitle = '') {
        const msgDiv = document.createElement('div');
        const messagesContainer = this.elements.aiChatOutput;
        msgDiv.classList.add('chat-message', `${type}-msg`);

        let iconClass = '';
        let title = '';

        switch(type) {
            case 'user':
                iconClass = 'fas fa-user';
                title = 'ユーザー';
                content = this.escapeHTML(content);
                break;
            case 'ai':
                iconClass = 'fas fa-robot';
                title = 'AIアシスタント';
                // AIからの応答はHTMLを含む可能性があるのでエスケープしない
                break;
            case 'loading':
                iconClass = 'fas fa-spinner fa-spin';
                title = 'AIアシスタント';
                content = this.escapeHTML(content);
                break;
            case 'error':
                iconClass = 'fas fa-exclamation-triangle';
                title = subTitle || 'システムエラー';
                content = this.escapeHTML(content);
                break;
            case 'system':
                iconClass = 'fas fa-info-circle';
                title = subTitle || 'システム';
                // システムメッセージはHTMLを含むことがある
                break;
        }

        msgDiv.innerHTML = `
            <div class="msg-header">
                <i class="${iconClass}"></i>
                <strong>${title}</strong>
            </div>
            <div class="msg-content">${content}</div>
        `;

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    }

    escapeHTML(str) {
        return str.replace(/[&<>"']/g, (match) => {
            return {
                '&': '&',
                '<': '<',
                '>': '>',
                '"': '"',
                "'": '&#39;'
            }[match];
        });
    }

    displayAIResponse(xmlCommand) {
        const messagesContainer = this.elements.aiChatOutput;
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'ai-msg';
        
        aiMsgDiv.innerHTML = `<strong>AIアシスタント:</strong>`;
        
        const pre = document.createElement('pre');
        pre.textContent = xmlCommand;
        aiMsgDiv.appendChild(pre);

        let executeBtn = null;
        let resultContainer = document.createElement('div');
        resultContainer.style.display = 'none';

        if (!xmlCommand.startsWith('<error>')) {
            executeBtn = document.createElement('button');
            executeBtn.className = 'execute-btn';
            executeBtn.textContent = 'コマンドを実行';
            executeBtn.dataset.command = xmlCommand;
            aiMsgDiv.appendChild(executeBtn);
        }
        aiMsgDiv.appendChild(resultContainer);
        
        messagesContainer.appendChild(aiMsgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return { aiMsgDiv, executeBtn, resultContainer };
    }

    // --- AI通信とコマンド検証 ---

    async askAI(messages, systemPrompt, maxRetries = 2) {
        let lastError = null;
        let currentMessages = [...messages]; // 試行ごとにメッセージをリセットしないように

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const currentSystemPrompt = systemPrompt + (lastError ? `\n### 前回の試行エラー\n前回の試行で以下のエラーが発生しました。内容を確認し、必ず修正してください。\nエラー: ${lastError}` : '');

            const payload = { messages: [{ role: "system", content: currentSystemPrompt }, ...currentMessages] };

            try {
                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`APIリクエスト失敗: ステータス ${response.status}. ${errorText}`);
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) throw new Error('APIからの応答形式が不正です。');

                return content; // 検証は呼び出し元で行う

            } catch (error) {
                console.error(`AI API呼び出しエラー (試行 ${attempt + 1}):`, error);
                lastError = error.message;
                // 失敗したことを次の試行のメッセージに含める
                if(attempt < maxRetries) {
                    currentMessages.push({ role: 'assistant', content: 'エラーが発生しました。'});
                    currentMessages.push({ role: 'user', content: `エラー: ${lastError}。修正してやり直してください。`});
                }
            }
        }
        throw new Error(`AIコマンドの生成に失敗しました: ${lastError}`);
    }
    
    async askAIForCommand(messages) {
        const systemPrompt = this.generateCommandSystemPrompt();
        const rawResponse = await this.askAI(messages, systemPrompt);
        
        const xmlMatch = rawResponse.match(/<(\w+)(?:\s+[^>]*?)?>[\s\S]*?<\/\1>/s) || rawResponse.match(/<\w+\s*[^>]*?\/>/s);
        const xmlCommand = xmlMatch ? xmlMatch[0] : null;

        if (!xmlCommand) {
            throw new Error("AIからの応答に有効なXMLコマンドが含まれていませんでした。応答: " + rawResponse);
        }
        const validation = this.validateCommand(xmlCommand);
        if (!validation.isValid) {
            throw new Error(`生成されたコマンドの検証に失敗しました: ${validation.error}`);
        }
        return xmlCommand;
    }

    generateCommandSystemPrompt() {
        const presentation = this.state.presentation && Array.isArray(this.state.presentation.slides)
            ? this.state.presentation
            : { slides: [], settings: {} };

        const basePrompt = `### 現在の状態
- アクティブなスライドID: ${this.state.activeSlideId || 'なし'}
- スライド一覧 (IDと要素数):
${presentation.slides.length > 0 ? presentation.slides.map(s => `  - Slide(id=${s.id}): ${s.elements.length} elements`).join('\n') : 'スライドはありません'}
`;

        const commandDefinition = `
        ### コマンド定義
        <sequence> ... </sequence>: 複数のコマンドを順に実行する
        <create_slide> ... </create_slide>: スライドを新規作成し、要素を追加する
        <delete_slide slide_id="..." />: スライドを削除する
        <edit_element element_id="..." slide_id="...">
          <content>...</content>
          <style ... />
          <customCss>...</customCss>
        </edit_element>: 要素を編集する（カスタムCSSも編集可）
        <view_slide slide_id="..." />: スライドを閲覧する
        
        <add_element type="text|image|video|chart|table|icon|iframe|qrcode" [content="..."] [slide_id="..."]>
          <style top="..." left="..." width="..." height="..." zIndex="..." color="..." fontSize="..." fontFamily="..." rotation="..." animation="..." />
          <customCss>...</customCss>
        </add_element>: アクティブまたは指定スライドに要素を追加（カスタムCSSも指定可）
        
        <add_icon iconType="fa|mi" iconClass="..." [slide_id="..."]>
          <style ... />
          <customCss>...</customCss>
        </add_icon>: アイコン要素を追加（カスタムCSSも指定可）
        
        <add_qrcode text="..." size="..." color="..." bgColor="..." [slide_id="..."]>
          <style ... />
          <customCss>...</customCss>
        </add_qrcode>: QRコード画像を生成し追加（カスタムCSSも指定可）
        
        ### 使用例
        <add_element type="text" content="タイトル"><style top="10" left="10" fontSize="40" /></add_element>
        <add_element type="image" content="https://example.com/image.png"><customCss>border-radius:16px;border:2px solid #333;</customCss></add_element>
        <edit_element element_id="el-xxx"><customCss>background:linear-gradient(90deg,#f00,#00f);</customCss></edit_element>
        <add_icon iconType="fa" iconClass="fas fa-star"><customCss>color:gold;font-size:64px;</customCss></add_icon>
        <add_qrcode text="https://example.com" size="256" color="#000" bgColor="#fff"><customCss>box-shadow:0 0 8px #0003;</customCss></add_qrcode>
        `;

        switch (this.aiMode) {
            case 'design':
                return `あなたはWebデザイナーアシスタントです。ユーザーからの具体的な指示を解釈せず、そのまま忠実にXMLコマンドに変換する役割を担います。余計な提案はせず、指示されたデザイン変更を直接実行してください。XML以外の説明やテキストは絶対に含めないでください。
${commandDefinition}
${basePrompt}`;
            case 'plan':
                return `あなたは優秀なプロジェクトプランナーです。ユーザーの最終目標に基づき、具体的な行動計画を立案する役割を担います。計画はステップバイステップで考え、それを実行するためのXMLコマンドのシーケンス(<sequence>)を生成してください。このモードでは、あなたが能動的にデザインの詳細を決定することはありません。あくまで計画立案に専念してください。XML以外の説明やテキストは絶対に含めないでください。
${commandDefinition}
${basePrompt}`;
            case 'ask':
                return `あなたはスライドエディタに関する質問に答えるAIアシスタントです。ユーザーの質問に対して、現在の状態を参考にし、自然言語で分かりやすく回答してください。XMLコマンドは絶対に生成しないでください。
${basePrompt}`;
            default:
                return `あなたはWebスライドエディタを操作するためのAIアシスタントです。
${commandDefinition}
${basePrompt}`;
        }
    }

    validateCommand(xmlCommand) {
        // (以前のコードと同じなので省略。必要に応じて貼り付けてください)
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlCommand, "text/xml");

        if (xmlDoc.querySelector('parsererror')) {
            return { isValid: false, error: "XML構文が正しくありません。" };
        }
        const commandNode = xmlDoc.documentElement;
        if (!commandNode) {
            return { isValid: false, error: "XMLのルート要素が見つかりません。" };
        }
        const commandName = commandNode.tagName.toLowerCase();
        const knownCommands = [
            'create_slide', 'delete_slide', 'edit_element', 'view_slide', 'sequence',
            'add_element', 'add_icon', 'add_qrcode'
        ];
        if (!knownCommands.includes(commandName)) {
            return { isValid: false, error: `不明なコマンド'${commandName}'です。` };
        }
        // ... 他のバリデーションルール
        return { isValid: true };
    }

    // --- コマンド実行 ---
    
    async executeCommand(xmlCommand) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlCommand, "text/xml");
        const commandNode = xmlDoc.documentElement;
        const commandName = commandNode.tagName.toLowerCase();

        if (commandName === 'sequence') {
            return this.handleSequence(commandNode);
        }

        try {
            const result = this.handleSingleCommand(commandNode);
            this.app.render();
            this.app.saveState();
            return result;
        } catch (error) {
            console.error("AIコマンド実行エラー:", error);
            return { success: false, message: error.message };
        }
    }

    async handleSequence(sequenceNode) {
        const commands = Array.from(sequenceNode.children);
        let results = [];
        let successCount = 0;
        for (const commandNode of commands) {
            this.displayMessage(`<pre>${this.escapeHTML(commandNode.outerHTML)}</pre>`, 'system', 'シーケンス実行中');
            const result = await this.executeCommand(commandNode.outerHTML);
            results.push(result);
            if (result.success) {
                successCount++;
            } else {
                return { success: false, message: `シーケンスの実行中にエラーが発生しました: ${result.message}` };
            }
             await new Promise(resolve => setTimeout(resolve, 500)); // 実行の間に少し待機
        }
        return { success: true, message: `シーケンス完了: ${commands.length}個のコマンドのうち${successCount}個を正常に実行しました。` };
    }
    
    handleSingleCommand(commandNode) {
        const commandName = commandNode.tagName.toLowerCase();
        switch (commandName) {
            case 'create_slide': return this.handleCreateSlide(commandNode);
            case 'delete_slide': return this.handleDeleteSlide(commandNode);
            case 'edit_element': return this.handleEditElement(commandNode);
            case 'view_slide': return this.handleViewSlide(commandNode);
            case 'add_element': return this.handleAddElement(commandNode);
            case 'add_icon': return this.handleAddIcon(commandNode);
            case 'add_qrcode': return this.handleAddQrcode(commandNode);
            default: throw new Error(`不明なコマンド: ${commandName}`);
        }
    }
    
    handleCreateSlide(commandNode) {
        const newSlideId = this.app.addSlide(true);
        const elementsNode = commandNode.querySelector('elements');
        let elementCount = 0;
        if (elementsNode) {
            const elementNodes = Array.from(elementsNode.querySelectorAll('element'));
            elementCount = elementNodes.length;
            elementNodes.forEach(elNode => {
                const type = elNode.getAttribute('type');
                const content = elNode.querySelector('content')?.textContent || '';
                const styleNode = elNode.querySelector('style');
                const style = {};
                if (styleNode) {
                    for (const attr of styleNode.attributes) {
                        style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
                    }
                }
                this.app.addElementToSlide(newSlideId, type, content, style);
            });
        }
        this.app.setActiveSlide(newSlideId);
        return { success: true, message: `新しいスライド(ID: ${newSlideId})を作成し、${elementCount}個の要素を追加しました。` };
    }
    handleDeleteSlide(commandNode) {
        const slideId = commandNode.getAttribute('slide_id');
        if (!slideId) throw new Error('slide_id is required.');
        return this.app.deleteSlide(slideId, true);
    }
    handleEditElement(commandNode) {
        const elementId = commandNode.getAttribute('element_id');
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        if (!elementId) throw new Error('element_id is required.');
        const slide = this.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) throw new Error(`Slide ${slideId} not found.`);
        const element = slide.elements.find(el => el.id === elementId);
        if (!element) throw new Error(`Element ${elementId} not found.`);
        
        const contentNode = commandNode.querySelector('content');
        if (contentNode) element.content = contentNode.textContent;
        
        const styleNode = commandNode.querySelector('style');
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                element.style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }
        const customCssNode = commandNode.querySelector('customCss');
        if (customCssNode) element.style.customCss = customCssNode.textContent;
        return { success: true, message: `Element ${elementId} updated.` };
    }
    handleViewSlide(commandNode) {
        const slideId = commandNode.getAttribute('slide_id');
        if (!slideId) throw new Error('slide_id is required.');
        const slide = this.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) return { success: false, message: `Slide ${slideId} not found.` };
        this.app.setActiveSlide(slideId);
        return { success: true, slide: JSON.parse(JSON.stringify(slide)) };
    }
    
    // --- 新規追加: 要素追加・アイコン追加・QRコード追加コマンド ---
    handleAddElement(commandNode) {
        const type = commandNode.getAttribute('type');
        const content = commandNode.getAttribute('content') || '';
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        const styleNode = commandNode.querySelector('style');
        const style = {};
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }
        const customCssNode = commandNode.querySelector('customCss');
        const slide = this.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) throw new Error(`Slide ${slideId} not found.`);
        const newEl = this.app.addElementToSlide(slideId, type, content, style);
        if (!newEl) throw new Error('要素の追加に失敗しました');
        if (customCssNode) newEl.style.customCss = customCssNode.textContent;
        return { success: true, message: `要素(type=${type})を追加しました。`, element: newEl };
    }
    handleAddIcon(commandNode) {
        const iconType = commandNode.getAttribute('iconType');
        const iconClass = commandNode.getAttribute('iconClass');
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        const styleNode = commandNode.querySelector('style');
        const style = {};
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }
        const customCssNode = commandNode.querySelector('customCss');
        const slide = this.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) throw new Error(`Slide ${slideId} not found.`);
        // slide.jsのaddIconElementを使う
        if (iconType === 'fa' || iconType === 'mi') {
            // addIconElementはアクティブスライドのみ対応なので、slideIdが違う場合は一時的にactiveSlideIdを変更
            const prevActive = this.state.activeSlideId;
            this.app.setActiveSlide(slideId);
            this.app.addIconElement(iconType, iconClass);
            // 直近で追加された要素にカスタムCSSを反映
            if (customCssNode) {
                const lastEl = slide.elements[slide.elements.length - 1];
                if (lastEl) lastEl.style.customCss = customCssNode.textContent;
            }
            if (prevActive !== slideId) this.app.setActiveSlide(prevActive);
            return { success: true, message: `アイコン(${iconType}:${iconClass})を追加しました。` };
        }
        throw new Error('iconTypeはfaまたはmiのみ対応');
    }
    handleAddQrcode(commandNode) {
        const text = commandNode.getAttribute('text');
        const size = parseInt(commandNode.getAttribute('size')) || 256;
        const color = commandNode.getAttribute('color') || '#000';
        const bgColor = commandNode.getAttribute('bgColor') || '#fff';
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        const customCssNode = commandNode.querySelector('customCss');
        // QRコード生成はslide.jsのQRコード生成ロジックを流用
        // ここではwindow.QRCodeStylingが必要
        if (!window.QRCodeStyling) throw new Error('QRCodeStylingライブラリがロードされていません');
        return new Promise((resolve, reject) => {
            const qr = new window.QRCodeStyling({
                width: size,
                height: size,
                data: text,
                dotsOptions: { color: color },
                backgroundOptions: { color: bgColor }
            });
            qr.getRawData("png").then(blob => {
                const reader = new FileReader();
                reader.onload = () => {
                    const imgUrl = reader.result;
                    const slide = this.state.presentation.slides.find(s => s.id === slideId);
                    if (!slide) return reject(new Error(`Slide ${slideId} not found.`));
                    const newEl = this.app.addElementToSlide(slideId, 'image', imgUrl, { width: 20, height: null });
                    if (customCssNode && newEl) newEl.style.customCss = customCssNode.textContent;
                    resolve({ success: true, message: `QRコードを追加しました。`, element: newEl });
                };
                reader.readAsDataURL(blob);
            }).catch(err => reject({ success: false, message: err.message }));
        });
    }


    // --- 状態管理と自律モード ---

    createAICheckpoint() {
        this.state.aiCheckpoint = JSON.parse(JSON.stringify(this.state.presentation));
        this.elements.restoreCheckpointBtn.disabled = false;
        console.log("AI Checkpoint created.");
    }

    restoreAICheckpoint() {
        if (this.state.aiCheckpoint) {
            if (confirm('AIによる直前の操作を元に戻しますか？')) {
                // ... (以前のコードと同じ)
            }
        }
    }
    
    toggleAutonomousModeUI(isActive) {
        this.state.autonomousMode.isActive = isActive;
        if (isActive) {
            document.getElementById('chat-input-container').style.display = 'none';
            this.elements.autonomousGoalContainer.style.display = 'flex';
            if (!this.autonomousAgent) {
                this.displayMessage('自律モードが有効になりました。最終目標を入力して「開始」を押してください。', 'system', '自律モード');
            }
        } else {
            document.getElementById('chat-input-container').style.display = 'flex';
            this.elements.autonomousGoalContainer.style.display = 'none';
            this.stopAutonomousMode();
        }
    }

    startAutonomousMode(goal) {
        this.elements.autonomousGoalInput.disabled = true;
        this.elements.startAutonomousBtn.disabled = true;
        this.displayMessage(`目標設定: ${goal}`, 'system', '自律モード');
        
        this.autonomousAgent = new AutonomousAgent(this, goal);
        this.autonomousAgent.start();
    }

    stopAutonomousMode() {
        if (this.autonomousAgent) {
            this.autonomousAgent.stop();
            this.autonomousAgent = null;
            this.displayMessage('自律モードを停止しました。', 'system', '自律モード');
            this.elements.autonomousGoalInput.disabled = false;
            this.elements.startAutonomousBtn.disabled = false;
        }
    }

    setAIMode(newMode) {
        if (this.aiMode === newMode) return;
        this.aiMode = newMode;

        this.elements.aiModeButtons.forEach(button => {
            if (button.dataset.mode === newMode) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // モード変更時にシステムメッセージを表示
        const modeMap = {
            design: 'デザインモード',
            plan: '計画モード',
            ask: '聞くモード'
        };
        this.displayMessage(`${modeMap[newMode]}に切り替えました。`, 'system', 'モード変更');
    }
}


/**
 * 自律的なタスク実行を管理するエージェントクラス
 */
class AutonomousAgent {
    constructor(handler, goal) {
        this.handler = handler; // AIHandlerのインスタンス
        this.app = handler.app;
        this.state = handler.state;
        this.goal = goal;
        this.plan = [];
        this.isRunning = false;
        this.currentStep = 0;
    }

    async start() {
        this.isRunning = true;
        try {
            // 1. 計画立案
            await this.createPlan();
            if (!this.isRunning) return; // 途中で停止された場合

            // 2. 計画の実行ループ
            await this.executePlan();

            this.handler.displayMessage('全ての計画が完了しました。', 'system', '自律モード完了');

        } catch (error) {
            this.handler.displayMessage(`自律モードでエラーが発生しました: ${error.message}`, 'error');
            console.error("Autonomous mode error:", error);
        } finally {
            this.stop();
            this.handler.toggleAutonomousModeUI(false);
            this.handler.elements.autonomousModeToggle.checked = false;
        }
    }

    stop() {
        this.isRunning = false;
    }

    async createPlan() {
        this.handler.displayMessage('最終目標に基づき、行動計画を立案中...', 'loading');
        const systemPrompt = `あなたはプレゼンテーション作成AIのプランナーです。ユーザーの最終目標を達成するためのステップバイステップの計画を考えてください。各ステップは簡潔な自然言語で記述し、番号付きリストで返してください。
例:
1. タイトルスライドを作成する。タイトルは「...」とする。
2. 会社概要スライドを追加する。
3. ...`;

        const messages = [{ role: 'user', content: `最終目標: ${this.goal}\n現在のスライドの状態: ${this.state.presentation.slides.length}枚のスライドがあります。` }];
        
        const planText = await this.handler.askAI(messages, systemPrompt, 1);
        
        this.plan = planText.split('\n').filter(line => line.match(/^\d+\.\s/)).map(line => line.replace(/^\d+\.\s/, ''));
        
        if (this.plan.length === 0) {
            throw new Error('計画の立案に失敗しました。');
        }

        const planHtml = '<ul>' + this.plan.map(step => `<li>${this.handler.escapeHTML(step)}</li>`).join('') + '</ul>';
        this.handler.displayMessage(planHtml, 'system', '計画を立案しました');
    }

    async executePlan() {
        for (let i = 0; i < this.plan.length; i++) {
            if (!this.isRunning) {
                this.handler.displayMessage('ユーザーによって計画の実行が中断されました。', 'system', '自律モード');
                return;
            }
            this.currentStep = i;
            const task = this.plan[i];

            this.handler.displayMessage(`<strong>ステップ ${i + 1}/${this.plan.length}:</strong> ${this.handler.escapeHTML(task)}`, 'system', 'タスク実行中');
            
            // a. タスクを実行するためのXMLコマンドを生成
            const command = await this.generateCommandForTask(task);
            
            // b. コマンドを実行
            this.handler.displayMessage(`<pre>${this.handler.escapeHTML(command)}</pre>`, 'system', '生成されたコマンド');
            const result = await this.handler.executeCommand(command);
            
            if (!result.success) {
                // c. 自己修正（ここでは単純にエラーを投げて停止）
                throw new Error(`ステップ ${i + 1} の実行に失敗しました: ${result.message}`);
            }
             this.handler.displayMessage(`✅ ステップ ${i + 1} 完了`, 'success-msg');
             
             await new Promise(resolve => setTimeout(resolve, 1000)); // 次のステップに進む前に少し待つ
        }
    }

    async generateCommandForTask(task) {
        const systemPrompt = this.handler.generateCommandSystemPrompt(); // コマンド生成用のプロンプトを再利用
        const messages = [
            { role: 'user', content: `以下のタスクを実行するためのXMLコマンドを生成してください: "${task}"` }
        ];
        
        // 自律モード用の履歴は、通常のチャット履歴とは独立させる
        const command = await this.handler.askAIForCommand(messages);
        return command;
    }
}