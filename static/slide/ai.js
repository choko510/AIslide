class AIHandler {
    constructor(app) {
        this.app = app;
        this.state = app.state; // Appのstateへの参照
        this.elements = app.elements; // Appのelementsへの参照
        this.init();
    }

    init() {
        this.cacheAIElements();
        this.bindEvents();
    }

    cacheAIElements() {
        this.elements.aiChatInput = document.getElementById('chat-input');
        this.elements.aiChatOutput = document.getElementById('chat-messages');
        this.elements.sendChatBtn = document.getElementById('send-chat-btn');
        this.elements.restoreCheckpointBtn = document.getElementById('restore-checkpoint-btn');
        this.elements.autonomousModeToggle = document.getElementById('autonomous-mode-toggle');
    }

    bindEvents() {
        // チャット送信
        document.getElementById('send-chat-btn').addEventListener('click', async () => {
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (!message) return;

            const messagesDiv = document.getElementById('chat-messages');
            
            // ユーザーのメッセージを表示
            const userMsgDiv = document.createElement('div');
            userMsgDiv.className = 'user-msg';
            userMsgDiv.textContent = `ユーザー: ${message}`;
            messagesDiv.appendChild(userMsgDiv);
            input.value = '';
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            // ローディング表示
            const loadingMsgDiv = document.createElement('div');
            loadingMsgDiv.className = 'ai-msg';
            loadingMsgDiv.innerHTML = '<div>AIがコマンドを生成中...</div>';
            messagesDiv.appendChild(loadingMsgDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            
            // AIに問い合わせ
            const aiXmlCommand = await this.askAI(message);
            
            // ローディング表示を削除
            messagesDiv.removeChild(loadingMsgDiv);

            // AIからの応答を表示
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.className = 'ai-msg';
            
            const aiLabel = document.createElement('div');
            aiLabel.textContent = 'AIアシスタント:';
            aiMsgDiv.appendChild(aiLabel);

            const pre = document.createElement('pre');
            pre.textContent = aiXmlCommand;
            aiMsgDiv.appendChild(pre);

            // エラーでなければ実行ボタンを追加
            if (!aiXmlCommand.startsWith('<error>')) {
                const executeBtn = document.createElement('button');
                executeBtn.className = 'execute-btn';
                executeBtn.textContent = 'コマンドを実行';
                executeBtn.dataset.command = aiXmlCommand;
                aiMsgDiv.appendChild(executeBtn);

                const resultDiv = document.createElement('div');
                resultDiv.style.display = 'none'; // 最初は非表示
                aiMsgDiv.appendChild(resultDiv);
            }
            
            messagesDiv.appendChild(aiMsgDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });

        // コマンド実行
        document.getElementById('chat-messages').addEventListener('click', async (e) => {
            if (e.target.classList.contains('execute-btn')) {
                // 実行前にチェックポイントを作成
                this.createAICheckpoint();

                const commandText = e.target.dataset.command;
                const resultContainer = e.target.nextElementSibling;
                try {
                    const result = await this.executeCommand(commandText);
                    if (result.success) {
                        resultContainer.className = 'success-msg';
                        let message = result.message || 'コマンドが正常に実行されました。';
                        if (result.slide) {
                            // view_slideの結果を整形して表示
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
                e.target.style.display = 'none'; // ボタンを隠す
            }
        });

        this.elements.restoreCheckpointBtn.addEventListener('click', () => this.restoreAICheckpoint());
        this.elements.autonomousModeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.startAutonomousMode();
            } else {
                this.stopAutonomousMode();
            }
        });
    }

    async askAI(prompt) {
        try {
            const currentPresentation = this.state.presentation;
            const currentSlide = this.app.getActiveSlide();
            const currentSlideElements = currentSlide ? currentSlide.elements : [];

            const response = await fetch('http://localhost:3000/ask-ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    presentation: currentPresentation,
                    currentSlide: currentSlide,
                    currentSlideElements: currentSlideElements
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            return data.command;
        } catch (error) {
            console.error('AIからの応答取得中にエラー:', error);
            return `<error>AIからの応答取得中にエラーが発生しました: ${error.message}</error>`;
        }
    }

    async executeCommand(xmlCommand) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlCommand, 'text/xml');
            const commandElement = xmlDoc.documentElement;
            const commandName = commandElement.tagName;
            const slideId = commandElement.getAttribute('slideId') || this.state.activeSlideId;
            const elementId = commandElement.getAttribute('elementId');

            let result = { success: false, message: '不明なコマンドです。' };

            switch (commandName) {
                case 'add_slide':
                    const newSlideId = this.app.addSlide(true); // silent = true
                    result = { success: true, message: `新しいスライド(ID: ${newSlideId})を追加しました。` };
                    break;
                case 'delete_slide':
                    result = this.app.deleteSlide(slideId, true); // silent = true
                    break;
                case 'add_element':
                    const type = commandElement.getAttribute('type');
                    const content = commandElement.querySelector('content')?.textContent;
                    const style = {};
                    commandElement.querySelectorAll('style > *').forEach(s => {
                        style[s.tagName] = isNaN(parseFloat(s.textContent)) ? s.textContent : parseFloat(s.textContent);
                    });
                    const newEl = this.app.addElementToSlide(slideId, type, content, style);
                    if (newEl) {
                        result = { success: true, message: `スライド(ID: ${slideId})に${type}要素(ID: ${newEl.id})を追加しました。` };
                    } else {
                        result = { success: false, message: `スライド(ID: ${slideId})に要素を追加できませんでした。` };
                    }
                    break;
                case 'update_element':
                    const updateEl = this.app.getActiveSlide().elements.find(el => el.id === elementId);
                    if (updateEl) {
                        commandElement.querySelectorAll('style > *').forEach(s => {
                            updateEl.style[s.tagName] = isNaN(parseFloat(s.textContent)) ? s.textContent : parseFloat(s.textContent);
                        });
                        const newContent = commandElement.querySelector('content')?.textContent;
                        if (newContent !== undefined) {
                            updateEl.content = newContent;
                        }
                        result = { success: true, message: `要素(ID: ${elementId})を更新しました。` };
                    } else {
                        result = { success: false, message: `要素(ID: ${elementId})が見つかりませんでした。` };
                    }
                    break;
                case 'delete_element':
                    const slide = this.app.getActiveSlide();
                    if (slide) {
                        const initialLength = slide.elements.length;
                        slide.elements = slide.elements.filter(el => el.id !== elementId);
                        if (slide.elements.length < initialLength) {
                            result = { success: true, message: `要素(ID: ${elementId})を削除しました。` };
                        } else {
                            result = { success: false, message: `要素(ID: ${elementId})が見つかりませんでした。` };
                        }
                    } else {
                        result = { success: false, message: 'アクティブなスライドが見つかりません。' };
                    }
                    break;
                case 'view_slide':
                    const targetSlide = this.state.presentation.slides.find(s => s.id === slideId);
                    if (targetSlide) {
                        result = { success: true, message: `スライド(ID: ${slideId})の内容を表示します。`, slide: targetSlide };
                    } else {
                        result = { success: false, message: `スライド(ID: ${slideId})が見つかりません。` };
                    }
                    break;
                case 'select_element':
                    this.state.selectedElementIds = [elementId];
                    result = { success: true, message: `要素(ID: ${elementId})を選択しました。` };
                    break;
                case 'set_active_slide':
                    this.app.setActiveSlide(slideId);
                    result = { success: true, message: `スライド(ID: ${slideId})をアクティブにしました。` };
                    break;
                default:
                    result = { success: false, message: `不明なコマンド: ${commandName}` };
            }
            this.app.saveState();
            this.app.render();
            return result;
        } catch (error) {
            console.error('コマンド実行中にエラー:', error);
            return { success: false, message: `コマンド実行中にエラーが発生しました: ${error.message}` };
        }
    }

    createAICheckpoint() {
        this.state.aiCheckpoint = JSON.parse(JSON.stringify(this.state.presentation));
        this.elements.restoreCheckpointBtn.disabled = false;
        console.log("AI Checkpoint created.");
    }

    restoreAICheckpoint() {
        if (this.state.aiCheckpoint) {
            if (confirm('AIによる変更を元に戻しますか？')) {
                this.state.presentation = this.state.aiCheckpoint;
                this.state.aiCheckpoint = null; // チェックポイントをクリア
                // 状態を復元したあとの再設定
                this.state.activeSlideId = this.state.presentation.slides.find(s => s.id === this.state.activeSlideId)?.id || this.state.presentation.slides[0]?.id;
                this.state.selectedElementIds = [];
                
                this.app.render();
                this.app.saveState();
                this.elements.restoreCheckpointBtn.disabled = true;
                console.log("Restored to AI checkpoint.");
            }
        } else {
            alert('復元できるAIの変更履歴がありません。');
        }
    }

    startAutonomousMode() {
        this.state.autonomousMode.isActive = true;
        document.getElementById('chat-input-container').style.display = 'none';
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML += `<div class="ai-msg">🤖 自律モードを開始しました。</div>`;
        // ここに自律的なスライド作成のロジックを追加（次のステップ）
        alert("自律モードが開始されました（機能は現在開発中です）");
    }

    stopAutonomousMode() {
        this.state.autonomousMode.isActive = false;
        document.getElementById('chat-input-container').style.display = 'flex';
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML += `<div class="ai-msg">🤖 自律モードを停止しました。</div>`;
         if (this.state.autonomousMode.intervalId) {
            clearInterval(this.state.autonomousMode.intervalId);
            this.state.autonomousMode.intervalId = null;
        }
    }
}