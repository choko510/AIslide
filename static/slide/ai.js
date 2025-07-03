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
        this.nextRequestImage = null; // 次のAIリクエストに含める画像データ

        this.init();
    }

    // --- 初期化とイベント関連 ---

    init() {
        this.cacheAIElements();
        this.bindEvents();
        this.preparePrompts();
    }

    cacheAIElements() {
        // 通常モード用
        this.elements.aiChatInput = document.getElementById('chat-input');
        this.elements.sendChatBtn = document.getElementById('send-chat-btn');
        this.elements.aiChatOutput = document.getElementById('chat-messages');
        
        // コントロール
        this.elements.resetChatBtn = document.getElementById('reset-chat-btn');
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
            const restoreBtn = e.target.closest('.restore-checkpoint-btn-inline');
            if (restoreBtn && !restoreBtn.disabled) {
                const checkpointId = restoreBtn.dataset.checkpointId;
                this.restoreAICheckpoint(checkpointId);
            }
        });

        this.elements.resetChatBtn.addEventListener('click', () => this.resetChat());
        
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

    preparePrompts() {
        this.basePromptContent = {
            allCommandDefinitions: {
                sequence: '<sequence> ... </sequence>: 複数のコマンドを順に実行する',
                create_slide: '<create_slide> ... </create_slide>: スライドを新規作成し、要素を追加する',
                delete_slide: '<delete_slide slide_id="..." />: スライドを削除する',
                edit_element: `<edit_element element_id="..." slide_id="...">\n  <content>...</content>\n  <style ... />\n  <customCss>...</customCss>\n</edit_element>: 要素を編集する（カスタムCSSも編集可）`,
                view_slide: '<view_slide slide_id="..." />: スライドを閲覧する',
                switch_ai_mode: '<switch_ai_mode mode="design|plan|ask" />: AIのモードを指定されたモードに切り替える',
                add_element: `<add_element type="text|image|video|table|icon|iframe|qrcode" [slide_id="..."]>\\n  <content><![CDATA[...]]></content>\\n  <style top, left, width, heightは0-100の%指定。fontSizeは数値(px)のみ。 top="..." left="..." width="..." height="..." zIndex="..." color="..." fontSize="..." fontFamily="..." rotation="..." animation="アニメーション名 継続時間 タイミング関数 遅延時間 イテレーション回数 方向 フィルモード (例: fadeIn 1s ease-out 0.5s forwards)" />\\n  <customCss>...</customCss>\\n</add_element>: アクティブまたは指定スライドに要素を追加。HTMLを含む場合はcontentを子要素としCDATAで囲む。`,
                add_chart: `<add_chart type="bar|line|pie|doughnut|radar" [slide_id="..."]>\n  <title>グラフのタイトル</title>\n  <labels>ラベル1,ラベル2,ラベル3</labels>\n  <datasets>\n    <dataset label="データセット1" data="10,20,30" [color="#ff0000"] />\n    <dataset label="データセット2" data="15,25,35" [color="rgba(0,0,255,0.5)"] />\n  </datasets>\n  <options showLegend="true" showGrid="true" />\n  <style ... />\n</add_chart>: グラフ要素を追加。複数のデータセットも可。色は単色(#RRGGBB)またはカンマ区切りの複数色で指定。`,
                add_icon: `<add_icon iconType="fa|mi" iconClass="..." [slide_id="..."]>\n  <style ... />\n  <customCss>...</customCss>\n</add_icon>: アイコン要素を追加（カスタムCSSも指定可）`,
                add_qrcode: `<add_qrcode text="..." size="..." color="..." bgColor="..." [slide_id="..."]>\n  <style ... />\n  <customCss>...</customCss>\n</add_qrcode>: QRコード画像を生成し追加（カスタムCSSも指定可）`,
                question: `<question type="free_text|multiple_choice">...</question>: 計画立案に必要な情報をユーザーに質問する`,
                view_slide_as_image: `<view_slide_as_image slide_id="..." />: 指定されたスライドを画像として認識する。これにより、AIはスライドの視覚的なレイアウトを理解できる。`,
                reorder_slides: `<reorder_slides order="slide_id_1,slide_id_2,slide_id_3" />: スライドの表示順序を変更する。カンマ区切りのスライドIDで新しい順序を指定する。`,
                complete: '<complete>完了報告</complete>: 全てのタスクが完了したことを報告する'
            },
            
            modeCommands: {
                design: ['sequence', 'create_slide', 'delete_slide', 'edit_element', 'view_slide', 'add_element', 'add_chart', 'add_icon', 'add_qrcode', 'switch_ai_mode', 'view_slide_as_image', 'reorder_slides', 'complete', 'question'],
                plan: ['sequence', 'view_slide', 'switch_ai_mode', 'question', 'view_slide_as_image', 'complete'],
                ask: ['sequence', 'view_slide', 'view_slide_as_image']
            },

            usageExample: `
### 使用例
<add_element type="text" content="タイトル">
    <style top="10" left="10" fontSize="40" />
</add_element>
<add_element type="text" content="アニメーションするテキスト">
    <style top="50" left="50" fontSize="30" animation="fadeIn 1s ease-out" />
</add_element>
<add_element type="image" content="https://example.com/animated.gif">
    <style top="60" left="60" width="30" height="30" animation="bounce 2s infinite" />
</add_element>
<add_element type="image" content="https://example.com/image.png">
    <customCss>border-radius:16px; border:2px solid #333;</customCss>
</add_element>
<edit_element element_id="el-xxx">
    <customCss>background:linear-gradient(90deg,#f00,#00f);</customCss>
</edit_element>
<add_icon iconType="fa" iconClass="fas fa-star">
    <style top="5" left="5" width="10" height="10" />
    <customCss>color:gold; font-size:64px;</customCss>
</add_icon>
<add_qrcode text="https://example.com" size="256" color="#000" bgColor="#fff">
    <customCss>box-shadow:0 0 8px #0003;</customCss>
</add_qrcode>
<switch_ai_mode mode="design" />
`
        };

        this.systemPromptTemplates = {
            design: `あなたは世界クラスのプレゼンテーションデザイナーです。ユーザーの指示を解釈し、以下の思考プロセス、対話戦略、デザイン原則、レイアウトルールに基づいて、プロフェッショナルで説得力のあるスライドを作成してください。

### 思考プロセス
1.  **目的の理解**: このスライドの目的は何か？（情報提供、説得、意思決定など）
2.  **ターゲットの想定**: 誰に向けたスライドか？（専門家、初心者、経営層など）
3.  **文脈の把握**: ユーザーの指示から、デザインのトーン＆マナー（フォーマル、クリエイティブなど）を読み取る。

### 対話戦略
- **曖昧さの解消**: ユーザーの指示が曖昧な場合（例：「いい感じにして」）、具体的なデザインの方向性を確認するために、\`<question>\`コマンドを使って質問してください。
- **積極的な提案**: 指示がなくても、より良いデザインになるような提案（例：アイコンの追加、グラフの視覚化）をXMLコメントとして常に含めてください。提案は \`<!-- 追加提案: ... -->\` の形式で記述してください。

### 基本デザイン原則
- **1スライド・1メッセージ**: 伝えたいことを一つに絞り、情報を詰め込みすぎない。
- **情報の階層化**: メッセージの重要度に応じて、見た目に明確な差をつける。例: タイトルは \`fontSize: 48\` で太字、サブタイトルは \`fontSize: 24\`、本文は \`fontSize: 18\` のように、サイズと太さでメリハリをつける。
- **近接**: アイコンと関連テキスト、見出しと本文など、関連する要素は近くに配置し、1つの視覚ユニットとして認識させる。
- **コントラスト**: 背景色と文字色には十分なコントラストを確保し、可読性を最優先する。
- **一貫性**: スライド全体でフォントファミリー、カラースキーム、レイアウトスタイルを統一する。

### 超重要レイアウトルール
- **グリッドシステム**: スライドを仮想の12x12グリッドで考える。要素の配置(top, left)やサイズ(width, height)は、このグリッド線に沿わせることで、整然としたレイアウトを実現する。
- **レイアウトの多様性**: 常に中央揃えにするのではなく、Zパターン（視線を左上→右上→左下→右下と誘導）や、左右非対称のレイアウトを効果的に使い、視覚的なリズムを生み出す。
- **衝突回避**: 要素同士は絶対に重ねてはならない。各要素の周囲には最低でも5%の「マージン」を確保する。
- **余白の戦略的活用**: スライドの端から最低でも5%の余白（セーフエリア）を設ける。要素を端ギリギリに配置しない。
- **整列**: 複数の要素を配置する場合、左揃え、中央揃え、右揃えのいずれかで整列させ、視覚的な安定感を生み出す。

### アニメーション活用原則
- **実装方法**: アニメーションは、animate.cssを用いて実装されています。。
- **目的**: アニメーションは情報の強調、注意の喚起、状態変化の明示など、明確な目的を持って使用する。過度なアニメーションは避ける。
- **一貫性**: 同じ種類の要素や目的には、一貫したアニメーションスタイルを適用する。
- **一般的なアニメーションの一部の例**:
    - \`fadeIn\`: 要素がフェードインして表示される。
    - \`slideInUp\`: 要素が下からスライドインして表示される。
    - \`bounce\`: 要素が跳ねるように表示される。
    - \`rotateIn\`: 要素が回転しながら表示される。

### 重要ルール
- **提案の根拠**: なぜそのデザインにしたのか、意図をXMLコメント(\`<!-- ... -->\`)で簡潔に説明してください。例: \`<!-- メインメッセージを強調するため、中央に大きく配置しました -->\`
- **フィードバックへの対応**: ユーザーからの修正依頼（「もっとこうしてほしい」など）があった場合は、チャット履歴を注意深く参照し、意図を汲み取って柔軟に提案を修正してください。
- **厳格なXML出力**: あなたの応答は、必ずルート要素を1つだけ持つ有効なXMLでなければなりません。XMLタグの外側には、いかなるテキスト、コメント、空白、改行も含めないでください。
- **CDATAの使用**: contentにHTMLタグ(\`<p>\`, \`<h3>\`など)や特殊文字を含める場合は、必ず \`<![CDATA[...]]>\` で囲んでください。これはXMLパースエラーを防ぐために非常に重要です。
- **改行の制御**: キャッチコピーや短い見出しのようなテキストを生成する際は、意図しない\`<br>\`タグなどの改行を含めないでください。
- **単一コマンドの原則**: 一度の応答には、'<sequence>'や'<create_slide>'などのコマンドを一つだけ含めてください。'<sequence>'と'<complete>'を同時に返すようなことは絶対にしないでください。
- 全ての要素は必ずキャンバス内(top, left, width, heightが0-100の範囲)に収まるように配置してください。
- **スライド1枚毎の出力**: 原則として、1枚のスライドに関する全てのコマンド（例: <create_slide>とその内部の<add_element>など）を1つの<sequence>ブロックにまとめて出力してください。
- **完了報告**: ユーザーから与えられたタスクが完了したと判断した場合のみ、**必ず** '<complete>完了した報告の文章</complete>' という形式で報告してください。例えば「スライドを3枚作って」という指示であれば、3枚作り終えたら、それ以上は何もせずに\`<complete>\`タグで報告します。不必要にスライドを追加し続けるなどの無限ループは絶対に避けてください。それ以外の途中経過の報告は一切不要です。
- **エラーからの自己修正**: もしあなたの生成したコマンドがエラーになった場合は、エラーメッセージを分析し、**どこが間違っていたのか**をXMLコメントで説明した上で、修正したコマンドを再生成してください。
`,
            plan: `あなたは優秀なプロジェクトプランナーです。ユーザーの最終目標に基づき、具体的で実行可能な行動計画を立案する役割を担います。

### 計画立案の原則
- **目標の分解**: 最終目標を、具体的なスライド作成のステップに分解します。
- **情報の網羅性**: 各スライドで「何を」「どのように」伝えるかを明確に記述します。
- **確認ステップ**: 重要な意思決定（デザインの方向性、コンテンツの骨子など）が必要な場合は、計画の途中でユーザーに確認するステップを設けてください。
- **成果物の明確化**: 最終的にどのようなプレゼンテーションが完成するのか、全体像がわかるように計画を立ててください。

計画はステップバイステップで考え、それをXMLの<sequence>タグ内にXMLコメントとして記述して提案してください。

### 質問機能
計画に必要な情報が不足している場合は、ユーザーに質問してください。質問は<question>タグを使用します。
**重要: ユーザーの手間を省くため、可能な限り選択肢形式('multiple_choice')を使用してください。** 自由回答('free_text')は、選択肢を提示することが困難な場合にのみ使用してください。

- **選択式 (推奨)**: <question type="multiple_choice"><text>質問文</text><option>選択肢A</option><option>選択肢B</option><option>その他</option></question>
- **自由回答**: <question type="free_text">質問文</question>

例:
<sequence>
  <!-- 1. プレゼンテーションの基本方針を決定する -->
  <!-- 2. タイトルスライドを作成する。タイトルは「〇〇」、サブタイトルは「△△」とする -->
  <!-- 3. 会社概要スライドを作成する。内容は～とする -->
</sequence>
<question type="multiple_choice">
  <text>このプレゼンの主な目的は何ですか？</text>
  <option>製品やサービスを紹介する</option>
  <option>研究成果を報告する</option>
  <option>社内向けの情報を共有する</option>
</question>

重要: このモードでは、スライドを直接編集するコマンドは絶対に使用できません。使用可能なコマンドは上記「コマンド定義」に記載されているもののみです。
ユーザーが計画に同意したら、次の応答で<switch_ai_mode mode="design" />コマンドを生成し、デザインモードに移行してください。一度の応答で計画とモードスイッチを両方含めないでください。XML以外の説明やテキストは絶対に含めないでください。
`,
            ask: `あなたはスライドエディタに関する質問に答えたり、簡単な操作を支援したりするAIアシスタントです。ユーザーの質問に対して、現在の状態を参考にし、必要であればコマンドを使用して回答や操作を行ってください。基本的には自然言語で分かりやすく回答しますが、操作を実行する場合はXMLコマンドを生成してください。
`
        };
    }

    // --- UI操作とハンドラ ---

    async handleSendMessage(prompt = null) {
        const message = prompt || this.elements.aiChatInput.value.trim();
        if (!message) return;

        this.displayMessage(message, 'user');
        this._addHistory('user', message);
        
        if (!prompt) {
            this.elements.aiChatInput.value = '';
        }

        const loadingMsgDiv = this.displayMessage('AIが応答を生成中...', 'loading');

        try {
            const aiResponse = await this._requestToAI();
            loadingMsgDiv.remove();
            await this._processAIResponse(aiResponse);
        } catch (error) {
            loadingMsgDiv.remove();
            this.displayMessage(`エラー: ${error.message}`, 'error');
            console.error('Error during AI interaction:', error);
        }
    }

    /**
     * AIからの応答を処理し、表示と実行を行う
     * @param {string} aiResponse
     * @private
     */
    async _processAIResponse(aiResponse) {
        this._addHistory('assistant', aiResponse);


        const aiResponseElements = this.displayAIResponse(aiResponse);
        if (aiResponseElements.executeBtn) {
            await this._executeAndFollowUp(aiResponse, aiResponseElements);
        }
    }

    /**
     * コマンドを自動実行し、必要に応じて次の対話を開始する
     * @param {string} command
     * @param {object} uiElements
     * @private
     */
    async _executeAndFollowUp(command, uiElements) {
        uiElements.executeBtn.textContent = '自動実行中...';
        uiElements.executeBtn.disabled = true;

        const executionResult = await this.executeAndDisplayResult(command, uiElements.resultContainer);
        uiElements.executeBtn.style.display = 'none';

        // 実行が成功し、かつ完了/質問タグがない場合のみ、ループを継続
        if (executionResult && executionResult.success && !command.includes('<complete>') && !command.includes('<question>')) {
            const nextPrompt = executionResult.imageDataProcessed
                ? "このスライドの画像を認識しました。これを基に、次に行うべきことを提案・実行してください。"
                : "次のスライドを作成してください。もしタスクが完了していれば<complete>タグで報告してください。";
            
            // 少し待ってから次の対話を開始
            setTimeout(() => this.handleSendMessage(nextPrompt), 500);
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
                resultContainer.innerHTML = ''; // Clear previous content

                const successPrefix = document.createElement('span');
                successPrefix.textContent = '✅ 成功: ';
                resultContainer.appendChild(successPrefix);
                
                let message = result.message || 'コマンドが正常に実行されました。';
                resultContainer.appendChild(document.createTextNode(message));

                if (result.slide) {
                    const slideMessage = `\nスライド(ID: ${result.slide.id})の内容:\n`;
                    resultContainer.appendChild(document.createTextNode(slideMessage));
                    const pre = document.createElement('pre');
                    pre.style.maxHeight = '200px';
                    pre.style.overflowY = 'auto';
                    pre.textContent = JSON.stringify(result.slide, null, 2);
                    resultContainer.appendChild(pre);
                }
                
                let imageDataProcessed = false;
                if (result.imageData) {
                    this.nextRequestImage = result.imageData;
                    const thumb = document.createElement('img');
                    thumb.src = result.imageData;
                    thumb.style.cssText = 'max-width: 200px; max-height: 150px; border: 1px solid #ccc; margin-top: 10px; display: block;';
                    
                    const imageHeader = document.createElement('div');
                    imageHeader.textContent = 'AIは以下の画像を認識しました:';
                    imageHeader.style.marginTop = '10px';
                    
                    resultContainer.appendChild(imageHeader);
                    resultContainer.appendChild(thumb);
                    imageDataProcessed = true;
                }
                return { success: true, imageDataProcessed };

            } else {
                resultContainer.className = 'error-msg';
                resultContainer.innerHTML = `❌ 失敗: ${result.message}`;
                
                // シーケンスの失敗で、自動実行がONの場合のみ再試行
                if (commandText.trim().startsWith('<sequence>') && this.elements.autoExecuteToggle?.checked) {
                    resultContainer.innerHTML += `<br>AIが修正を試みます...`;
                    
                    const feedback = `コマンドシーケンスの実行に失敗しました。エラー: "${result.message}". このエラーを修正した新しいXMLコマンドシーケンスを生成してください。`;
                    this.chatHistory.push({ role: 'user', content: feedback });
                    this.displayMessage(feedback, 'user');
                    
                    const loadingMsgDiv = this.displayMessage('AIがコマンドを修正中...', 'loading');
                    try {
                        const newCommand = await this.askAIForCommand(this.chatHistory);
                        loadingMsgDiv.remove();
                        
                        this.chatHistory.push({ role: 'assistant', content: newCommand });
                        const { resultContainer: newResultContainer, executeBtn: newExecuteBtn } = this.displayAIResponse(newCommand);
                        
                        if (newExecuteBtn) {
                           newExecuteBtn.textContent = '自動実行中...';
                           newExecuteBtn.disabled = true;
                           // ここで再帰呼び出し
                           await this.executeAndDisplayResult(newCommand, newResultContainer);
                           newExecuteBtn.style.display = 'none';
                        }
                    } catch (aiError) {
                        loadingMsgDiv.remove();
                        this.displayMessage(`AIによるコマンド修正中にエラーが発生しました: ${aiError.message}`, 'error');
                    }
                }
                return { success: false, imageDataProcessed: false };
            }
        } catch (error) {
            resultContainer.className = 'error-msg';
            resultContainer.innerHTML = `❌ エラー: ${error.message}`;
            return { success: false, imageDataProcessed: false };
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
                break;
            case 'ai':
                iconClass = 'fas fa-robot';
                title = 'AIアシスタント';
                break;
            case 'loading':
                iconClass = 'fas fa-spinner fa-spin';
                title = 'AIアシスタント';
                break;
            case 'error':
                iconClass = 'fas fa-exclamation-triangle';
                title = subTitle || 'システムエラー';
                break;
            case 'system':
                iconClass = 'fas fa-info-circle';
                title = subTitle || 'システム';
                break;
            case 'checkpoint':
                iconClass = 'fas fa-flag';
                title = subTitle || 'チェックポイント';
                break;
        }

        const headerDiv = document.createElement('div');
        headerDiv.className = 'msg-header';
        headerDiv.innerHTML = `<i class="${iconClass}"></i> <strong>${title}</strong>`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';

        // AIからの応答や特定のシステムメッセージはHTMLとして扱う
        if (type === 'ai' || (type === 'system' && subTitle !== '') || type === 'checkpoint') {
            contentDiv.innerHTML = content;
        } else {
            // それ以外は安全なテキストとして扱う
            contentDiv.textContent = content;
        }

        msgDiv.appendChild(headerDiv);
        msgDiv.appendChild(contentDiv);

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    }

    escapeHTML(str) {
        return str.replace(/[&<>"']/g, (match) => {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    displayAIResponse(xmlCommand) {
        const messagesContainer = this.elements.aiChatOutput;
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'chat-message ai-msg'; // classをchat-messageに合わせる

        const header = document.createElement('div');
        header.className = 'msg-header';
        header.innerHTML = `<i class="fas fa-robot"></i> <strong>AIアシスタント</strong>`;
        aiMsgDiv.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        aiMsgDiv.appendChild(contentDiv);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlCommand, "text/xml");
        const questionNode = xmlDoc.querySelector('question');
        const completeNode = xmlDoc.querySelector('complete');

        let executeBtn = null;
        let resultContainer = null;

        if (questionNode) {
            this.displayQuestion(questionNode, contentDiv);
        } else if (completeNode) {
            const completeMessage = completeNode.textContent.trim();
            const completeDiv = document.createElement('div');
            completeDiv.className = 'complete-msg-container';
            completeDiv.innerHTML = `<i class="fas fa-check-circle"></i> <strong>タスク完了:</strong> ${this.escapeHTML(completeMessage)}`;
            contentDiv.appendChild(completeDiv);
        } else {
            const comments = [];
            const walker = document.createTreeWalker(xmlDoc, NodeFilter.SHOW_COMMENT);
            while (walker.nextNode()) {
                comments.push(walker.currentNode.nodeValue.trim());
            }

            if (comments.length > 0) {
                const planList = document.createElement('ol');
                planList.style.paddingLeft = '20px';
                comments.forEach(commentText => {
                    const listItem = document.createElement('li');
                    listItem.textContent = this.escapeHTML(commentText);
                    planList.appendChild(listItem);
                });
                contentDiv.appendChild(planList);
            } else {
                const pre = document.createElement('pre');
                pre.textContent = xmlCommand;
                contentDiv.appendChild(pre);
            }

            if (!xmlCommand.startsWith('<error>')) {
                executeBtn = document.createElement('button');
                executeBtn.className = 'execute-btn';
                executeBtn.textContent = 'コマンドを実行';
                executeBtn.dataset.command = xmlCommand;
                contentDiv.appendChild(executeBtn);
            }
            
            resultContainer = document.createElement('div');
            resultContainer.style.display = 'none';
            contentDiv.appendChild(resultContainer);
        }

        messagesContainer.appendChild(aiMsgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return { aiMsgDiv, executeBtn, resultContainer };
    }

    displayQuestion(questionNode, container) {
        const type = questionNode.getAttribute('type');
        container.classList.add('question-container-wrapper');

        if (type === 'free_text') {
            const questionText = questionNode.textContent.trim();
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-container';
            questionDiv.innerHTML = `<p>${this.escapeHTML(questionText)}</p>`;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'question-input';
            input.placeholder = '回答を入力...';

            const submitBtn = document.createElement('button');
            submitBtn.textContent = '送信';
            submitBtn.className = 'question-submit-btn';

            questionDiv.appendChild(input);
            questionDiv.appendChild(submitBtn);
            container.appendChild(questionDiv);

            const handleSubmit = () => {
                const answer = input.value.trim();
                if (answer) {
                    input.disabled = true;
                    submitBtn.disabled = true;
                    this.handleQuestionResponse(questionText, answer);
                }
            };

            submitBtn.addEventListener('click', handleSubmit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleSubmit();
            });

        } else if (type === 'multiple_choice') {
            const questionText = questionNode.querySelector('text').textContent.trim();
            const options = Array.from(questionNode.querySelectorAll('option')).map(o => o.textContent.trim());

            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-container';
            questionDiv.innerHTML = `<p>${this.escapeHTML(questionText)}</p>`;

            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'question-options';

            options.forEach(optionText => {
                const optionBtn = document.createElement('button');
                optionBtn.textContent = optionText;
                optionBtn.className = 'question-option-btn';
                optionBtn.addEventListener('click', () => {
                    optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
                    this.handleQuestionResponse(questionText, optionText);
                });
                optionsContainer.appendChild(optionBtn);
            });

            questionDiv.appendChild(optionsContainer);
            container.appendChild(questionDiv);
        }
    }

    async handleQuestionResponse(question, answer) {
        const responseText = `質問:\n${question}\n\n回答:\n${answer}`;
        this.displayMessage(responseText, 'user');
        this._addHistory('user', answer);
        await this.handleSendMessage(answer);
    }

    // --- AI通信とコマンド検証 ---

    /**
     * チャット履歴にメッセージを追加し、最大件数を維持する
     * @param {'user' | 'assistant'} role
     * @param {string | object} content
     * @private
     */
    _addHistory(role, content) {
        this.chatHistory.push({ role, content });
        if (this.chatHistory.length > 20) {
            this.chatHistory.splice(0, this.chatHistory.length - 20);
        }
    }

    /**
     * AIにリクエストを送信し、応答を解析して返す
     * @returns {Promise<string>} AIからの応答テキストまたはXMLコマンド
     * @private
     */
    async _requestToAI(messagesOverride = null, maxRetries = 2) {
        const systemPrompt = this.generateCommandSystemPrompt();
        let lastError = null;

        let messages = messagesOverride ? [...messagesOverride] : [...this.chatHistory];
        
        // 通常のチャットフローでのみ画像を追加する
        if (!messagesOverride && this.nextRequestImage) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'user') {
                 lastMessage.content = [
                    { type: 'text', text: lastMessage.content },
                    { type: 'image_url', image_url: { url: this.nextRequestImage, detail: "high" } }
                ];
            }
            this.nextRequestImage = null;
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const currentSystemPrompt = systemPrompt + (lastError ? `\n### 前回の試行エラー\n前回の試行で以下のエラーが発生しました。内容を分析し、**どこが間違っていたのか**をXMLコメントで説明した上で、修正したコマンドを再生成してください。\nエラー: ${lastError}` : '');
            const payload = { messages: [{ role: "system", content: currentSystemPrompt }, ...messages] };

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
                
                // messagesOverrideが指定されている場合は、検証せずにそのまま返すことが多い
                if (messagesOverride) return content;

                // 通常のフローではモードに応じて処理
                return this._extractAndValidateCommand(content);

            } catch (error) {
                console.error(`AI API呼び出しエラー (試行 ${attempt + 1}):`, error);
                lastError = error.message;
                // 通常のチャットフローでのみ履歴にエラーを追加する
                if (!messagesOverride && attempt < maxRetries) {
                    this._addHistory('assistant', 'エラーが発生しました。');
                    this._addHistory('user', `エラー: ${lastError}。修正してやり直してください。`);
                }
            }
        }
        throw new Error(`AIコマンドの生成に失敗しました: ${lastError}`);
    }
    
    _extractAndValidateCommand(rawResponse) {
        // 質問タグを優先的にチェック
        const questionMatch = rawResponse.match(/<question[\s\S]*?<\/question>/s);
        if (questionMatch) {
            return questionMatch[0];
        }

        // 応答からXMLコメントや前後のテキストを除いた、最初のXML要素を抽出する
        let startIndex = -1;
        let currentIndex = 0;
        while (currentIndex < rawResponse.length) {
            const i = rawResponse.indexOf('<', currentIndex);
            if (i === -1) break;
            if (rawResponse.substring(i, i + 4) !== '<!--') {
                startIndex = i;
                break;
            }
            const commentEndIndex = rawResponse.indexOf('-->', i);
            currentIndex = (commentEndIndex !== -1) ? commentEndIndex + 3 : i + 4;
        }

        if (startIndex === -1) {
            throw new Error(`AIからの応答に有効なXMLコマンドが含まれていませんでした。\nAIの応答:\n${rawResponse}`);
        }

        const potentialXml = rawResponse.substring(startIndex);
        // ルート要素にマッチさせるための正規表現
        const xmlMatch = potentialXml.match(/<(\w+)(?:[\s\S]*?)>[\s\S]*?<\/\1>|<(\w+)(?:[\s\S]*?)\/>/s);

        if (!xmlMatch) {
            throw new Error(`AIからの応答に有効なXMLコマンドが含まれていませんでした。\n抽出試行ブロック:\n${potentialXml}\n\n元のAIの応答:\n${rawResponse}`);
        }
        
        let xmlCommand = xmlMatch[0].trim();

        // 応急処置: AIが誤って content="<![CDATA[...]]>" という属性を生成した場合、
        // これを <content><![CDATA[...]]></content> という子要素に変換する。
        const regex = /(<add_element[^>]*?)(\s*content="<!\[CDATA\[([\s\S]*?)\]\]>")(.*?)(\/?>)/g;
        xmlCommand = xmlCommand.replace(regex, (match, start, attr, cdata, rest, end) => {
            const restoredEnd = end || ''; // endがundefinedの場合に備える
            if (restoredEnd === '/>') {
                // 自己完結タグ <add_element ... /> を <add_element ...><content>...</content></add_element> に変換
                return `${start}${rest}><content><![CDATA[${cdata}]]></content></add_element>`;
            }
            // 通常の開始タグ <add_element ...> を <add_element ...><content>...</content> に変換
            return `${start}${rest}${restoredEnd}<content><![CDATA[${cdata}]]></content>`;
        });

        const validation = this.validateCommand(xmlCommand);
        if (!validation.isValid) {
            throw new Error(`生成されたコマンドの検証に失敗しました: ${validation.error}\n抽出されたコマンド:\n${xmlCommand}\n\n元のAIの応答:\n${rawResponse}`);
        }
        
        return xmlCommand;
    }

    generateCommandSystemPrompt() {
        const presentation = this.state.presentation && Array.isArray(this.state.presentation.slides)
            ? this.state.presentation
            : { slides: [], settings: {} };

        // planモードから引き継いだ計画を取得
        const inheritedPlan = this.getInheritedPlan();

        const dynamicPrompt = `### 現在の状態
- スライドのサイズ: width=${presentation.settings.width}, height=${presentation.settings.height}
- アクティブなスライドID: ${this.state.activeSlideId || 'なし'}
- スライド一覧 (IDと要素数):
${presentation.slides.length > 0 ? presentation.slides.map(s => `  - Slide(id=${s.id}): ${s.elements.length} elements`).join('\n') : 'スライドはありません'}
${inheritedPlan ? `\n### 実行中の計画\n${inheritedPlan}` : ''}
`;

        const { allCommandDefinitions, modeCommands, usageExample } = this.basePromptContent;
        const availableCommandKeys = modeCommands[this.aiMode] || [];
        
        const commandDefinition = availableCommandKeys.length > 0
            ? '### コマンド定義\n' + availableCommandKeys.map(key => allCommandDefinitions[key]).join('\n')
            : '';

        let systemPrompt = this.systemPromptTemplates[this.aiMode] || `あなたはWebスライドエディタを操作するためのAIアシスタントです。`;
        
        systemPrompt += `\n${commandDefinition}\n${usageExample}`;
        systemPrompt += `\n${dynamicPrompt}`;

        return systemPrompt;
    }

    validateCommand(xmlCommand) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlCommand, "text/xml");

        if (xmlDoc.querySelector('parsererror')) {
            // 質問タグはXMLとしてパースエラーになることがあるので許容
            if (xmlCommand.trim().startsWith('<question')) {
                return { isValid: true };
            }
            return { isValid: false, error: "XML構文が正しくありません。" };
        }
        const commandNode = xmlDoc.documentElement;
        if (!commandNode) {
            return { isValid: false, error: "XMLのルート要素が見つかりません。" };
        }
        const commandName = commandNode.tagName.toLowerCase();
        const knownCommands = [
            'create_slide', 'delete_slide', 'edit_element', 'view_slide', 'sequence',
            'add_element', 'add_chart', 'add_icon', 'add_qrcode', 'switch_ai_mode', 'question',
            'view_slide_as_image', 'reorder_slides', 'complete'
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
            const result = await this.handleSingleCommand(commandNode);
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
    
    async handleSingleCommand(commandNode) {
        const commandName = commandNode.tagName.toLowerCase();
        switch (commandName) {
            case 'create_slide': return await this.handleCreateSlide(commandNode);
            case 'delete_slide': return this.handleDeleteSlide(commandNode);
            case 'edit_element': return this.handleEditElement(commandNode);
            case 'view_slide': return this.handleViewSlide(commandNode);
            case 'add_element': return this.handleAddElement(commandNode);
            case 'add_chart': return this.handleAddChart(commandNode);
            case 'add_icon': return this.handleAddIcon(commandNode);
            case 'add_qrcode': return this.handleAddQrcode(commandNode);
            case 'switch_ai_mode': return this.handleSwitchAiMode(commandNode);
            case 'question': return { success: true, message: '質問はUIで処理されるため、実行はスキップされました。' };
            case 'view_slide_as_image': return this.handleViewSlideAsImage(commandNode);
            case 'reorder_slides': return this.handleReorderSlides(commandNode);
            case 'complete': return { success: true, message: commandNode.textContent.trim() || 'タスクが完了しました。' };
            default: throw new Error(`不明なコマンド: ${commandName}`);
        }
    }

    handleReorderSlides(commandNode) {
        const orderAttr = commandNode.getAttribute('order');
        if (!orderAttr) {
            throw new Error('order属性が指定されていません。');
        }
        const slideIds = orderAttr.split(',').map(id => id.trim());
        this.app.reorderSlides(slideIds);
        return { success: true, message: `スライドの順序を${orderAttr}に並べ替えました。` };
    }

    async handleViewSlideAsImage(commandNode) {
        const slideId = commandNode.getAttribute('slide_id') || this.app.getState('activeSlideId');
        if (!slideId) {
            throw new Error('スライドIDが指定されていません。');
        }

        const slide = this.app.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) {
            throw new Error(`スライドID ${slideId} が見つかりません。`);
        }

        return new Promise((resolve, reject) => {
            const worker = new Worker('export.worker.js');

            const slideContainer = document.createElement('div');
            slideContainer.style.width = `${this.app.state.presentation.settings.width}px`;
            slideContainer.style.height = `${this.app.state.presentation.settings.height}px`;
            slide.elements.forEach(elData => {
                const el = this.app.createElementDOM(elData);
                slideContainer.appendChild(el);
            });

            worker.postMessage({
                type: 'png',
                slideHTML: slideContainer.innerHTML,
                settings: this.app.state.presentation.settings,
                slideId: slide.id
            });

            worker.onmessage = (event) => {
                if (event.data.success) {
                    resolve({
                        success: true,
                        message: `スライド ${slideId} を画像としてキャプチャしました。`,
                        imageData: event.data.dataUrl
                    });
                } else {
                    console.error('スライドの画像キャプチャに失敗しました(Worker):', event.data.error);
                    reject(new Error(`スライドの画像キャプチャに失敗しました: ${event.data.error}`));
                }
                worker.terminate();
            };

            worker.onerror = (error) => {
                console.error('Worker for image capture failed:', error);
                reject(new Error(`画像キャプチャWorkerでエラーが発生しました: ${error.message}`));
                worker.terminate();
            };
        });
    }

    handleSwitchAiMode(commandNode) {
        const mode = commandNode.getAttribute('mode');
        if (!['design', 'plan', 'ask'].includes(mode)) {
            throw new Error(`無効なAIモードです: ${mode}`);
        }

        // plan -> design の場合、計画をstateに保存
        if (this.aiMode === 'plan' && mode === 'design') {
            const lastPlan = this.chatHistory
                .filter(h => h.role === 'assistant' && h.content.includes('<sequence>'))
                .pop()?.content;
            
            if (lastPlan) {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(lastPlan, "text/xml");
                const comments = [];
                const walker = document.createTreeWalker(xmlDoc, NodeFilter.SHOW_COMMENT);
                while(walker.nextNode()) {
                    comments.push(walker.currentNode.nodeValue.trim());
                }
                if (comments.length > 0) {
                    this.state.inheritedPlan = comments.map(c => `- ${c}`).join('\n');
                }
            }
        } else if (mode !== 'plan') {
            // planモード以外に切り替わったら計画をリセット
            this.state.inheritedPlan = null;
        }

        this.setAIMode(mode);
        return { success: true, message: `${mode}モードに切り替えました。` };
    }
    
    async handleCreateSlide(commandNode) {
        const newSlideId = this.app.addSlide(true);
        let elementCount = 0;
        // 1. elementsタグ配下のelementも従来通り処理
        const elementsNode = commandNode.querySelector('elements');
        if (elementsNode) {
            const elementNodes = Array.from(elementsNode.querySelectorAll('element'));
            elementCount += elementNodes.length;
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
        // 2. create_slide直下のadd_element/add_icon/add_qrcodeも順次実行
        const childNodes = Array.from(commandNode.children).filter(
            n => ["add_element", "add_icon", "add_qrcode"].includes(n.tagName?.toLowerCase())
        );
        for (const node of childNodes) {
            const tag = node.tagName.toLowerCase();
            if (tag === "add_element") {
                this.handleAddElementWithSlide(node, newSlideId);
                elementCount++;
            } else if (tag === "add_icon") {
                this.handleAddIconWithSlide(node, newSlideId);
                elementCount++;
            } else if (tag === "add_qrcode") {
                await this.handleAddQrcodeWithSlide(node, newSlideId);
                elementCount++;
            }
        }
        this.app.setActiveSlide(newSlideId);
        return { success: true, message: `新しいスライド(ID: ${newSlideId})を作成し、${elementCount}個の要素を追加しました。` };
    }
    
    // add_element/add_icon/add_qrcodeを特定スライドIDで追加するためのラッパー
    handleAddElementWithSlide(node, slideId) {
        // slide_idを一時的に上書きしてhandleAddElementを使う
        node.setAttribute("slide_id", slideId);
        return this.handleAddElement(node);
    }
    handleAddIconWithSlide(node, slideId) {
        node.setAttribute("slide_id", slideId);
        return this.handleAddIcon(node);
    }
    async handleAddQrcodeWithSlide(node, slideId) {
        node.setAttribute("slide_id", slideId);
        return await this.handleAddQrcode(node);
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
        const slides = (this.state.presentation && Array.isArray(this.state.presentation.slides)) ? this.state.presentation.slides : [];
        const slide = slides.find(s => s.id === slideId);
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
        const slides = (this.state.presentation && Array.isArray(this.state.presentation.slides)) ? this.state.presentation.slides : [];
        const slide = slides.find(s => s.id === slideId);
        if (!slide) return { success: false, message: `Slide ${slideId} not found.` };
        this.app.setActiveSlide(slideId);
        return { success: true, slide: JSON.parse(JSON.stringify(slide)) };
    }
    
    // --- 新規追加: 要素追加・アイコン追加・QRコード追加コマンド ---
    handleAddElement(commandNode) {
        const type = commandNode.getAttribute('type');
        const content = commandNode.querySelector('content')?.textContent || commandNode.getAttribute('content') || '';
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        const styleNode = commandNode.querySelector('style');
        const style = {};
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }
        const customCssNode = commandNode.querySelector('customCss');
        const slides = (this.state.presentation && Array.isArray(this.state.presentation.slides)) ? this.state.presentation.slides : [];
        const slide = slides.find(s => s.id === slideId);
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
        const slides = (this.state.presentation && Array.isArray(this.state.presentation.slides)) ? this.state.presentation.slides : [];
        const slide = slides.find(s => s.id === slideId);
        if (!slide) throw new Error(`Slide ${slideId} not found.`);
        // slide.jsのaddIconElementを使う
        if (iconType === 'fa' || iconType === 'mi') {
            // addIconElementはアクティブスライドのみ対応なので、slideIdが違う場合は一時的にactiveSlideIdを変更
            const prevActive = this.state.activeSlideId;
            this.app.setActiveSlide(slideId);
            this.app.addIconElement(iconType, iconClass, style); // styleオブジェクトを渡す
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
        
        const styleNode = commandNode.querySelector('style');
        const style = {};
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }
        // デフォルトのスタイルとマージ
        const finalStyle = { width: 20, height: null, ...style };

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
                    const slides = (this.state.presentation && Array.isArray(this.state.presentation.slides)) ? this.state.presentation.slides : [];
                    const slide = slides.find(s => s.id === slideId);
                    if (!slide) return reject(new Error(`Slide ${slideId} not found.`));
                    const newEl = this.app.addElementToSlide(slideId, 'image', imgUrl, finalStyle);
                    if (customCssNode && newEl) newEl.style.customCss = customCssNode.textContent;
                    resolve({ success: true, message: `QRコードを追加しました。`, element: newEl });
                };
                reader.readAsDataURL(blob);
            }).catch(err => reject({ success: false, message: err.message }));
        });
    }

    handleAddChart(commandNode) {
        const slideId = commandNode.getAttribute('slide_id') || this.state.activeSlideId;
        const slide = this.state.presentation.slides.find(s => s.id === slideId);
        if (!slide) throw new Error(`Slide ${slideId} not found.`);

        const chartType = commandNode.getAttribute('type');
        const title = commandNode.querySelector('title')?.textContent || '';
        const labels = (commandNode.querySelector('labels')?.textContent || '').split(',').map(l => l.trim());
        const datasetNodes = Array.from(commandNode.querySelectorAll('dataset'));
        
        const datasets = datasetNodes.map(node => {
            const label = node.getAttribute('label');
            const data = (node.getAttribute('data') || '').split(',').map(d => parseFloat(d.trim()) || 0);
            const colorAttr = node.getAttribute('color');
            
            // 色の処理: 単色または複数色
            const colors = colorAttr ? colorAttr.split(',').map(c => c.trim()) : [];
            const backgroundColor = ['pie', 'doughnut'].includes(chartType) ? colors : (colors[0] || this._getRandomColor());
            const borderColor = ['pie', 'doughnut'].includes(chartType) ? colors : (colors[0] || this._getRandomColor());

            return {
                label,
                data,
                backgroundColor,
                borderColor,
                borderWidth: 1
            };
        });

        const optionsNode = commandNode.querySelector('options');
        const showLegend = optionsNode?.getAttribute('showLegend') !== 'false';
        const showGrid = optionsNode?.getAttribute('showGrid') !== 'false';

        const chartConfig = {
            type: chartType,
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: showLegend },
                    title: { display: !!title, text: title }
                },
                scales: ['pie', 'doughnut'].includes(chartType) ? {} : {
                    y: { beginAtZero: true, grid: { display: showGrid } },
                    x: { grid: { display: showGrid } }
                }
            }
        };
        
        const styleNode = commandNode.querySelector('style');
        const style = { width: 50, height: 40 }; // Default size
        if (styleNode) {
            for (const attr of styleNode.attributes) {
                style[attr.name] = isNaN(Number(attr.value)) ? attr.value : parseFloat(attr.value);
            }
        }

        const newEl = this.app.addElementToSlide(slideId, 'chart', chartConfig, style);
        if (!newEl) throw new Error('グラフ要素の追加に失敗しました');

        return { success: true, message: `グラフ(type=${chartType})を追加しました。`, element: newEl };
    }

    _getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // --- 状態管理と自律モード ---

    resetChat() {
        if (confirm('チャット履歴をリセットしてもよろしいですか？')) {
            this.chatHistory = [];
            this.elements.aiChatOutput.innerHTML = '';
            this.displayMessage('チャットがリセットされました。', 'system', 'システム');
        }
    }

    createAICheckpoint() {
        const checkpointId = `cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const pres = this.state.presentation || {};
        if (!this.state.aiCheckpoints) {
            this.state.aiCheckpoints = {};
        }
        this.state.aiCheckpoints[checkpointId] = JSON.parse(JSON.stringify(pres));

        const checkpointMsgContent = `
            <div class="checkpoint-controls">
                <button class="restore-checkpoint-btn-inline" data-checkpoint-id="${checkpointId}">
                    <i class="fas fa-undo"></i> この時点に戻す
                </button>
            </div>
        `;
        this.displayMessage(checkpointMsgContent, 'checkpoint', 'チェックポイント');
        console.log(`AI Checkpoint created: ${checkpointId}`);
    }

    restoreAICheckpoint(checkpointId) {
        if (!this.state.aiCheckpoints || !this.state.aiCheckpoints[checkpointId]) {
            alert('復元ポイントが見つかりません。');
            return;
        }

        if (confirm('このチェックポイントの状態に復元しますか？\nこれ以降のチェックポイントは無効になります。')) {
            this.state.presentation = JSON.parse(JSON.stringify(this.state.aiCheckpoints[checkpointId]));
            
            // 復元後のアクティブスライドIDを安全に設定
            if (this.state.presentation.slides && this.state.presentation.slides.length > 0) {
                const activeSlideExists = this.state.presentation.slides.some(s => s.id === this.state.activeSlideId);
                if (!activeSlideExists) {
                    this.state.activeSlideId = this.state.presentation.slides[0].id;
                }
            } else {
                this.state.activeSlideId = null;
            }

            this.app.render();
            this.app.saveState();
            this.displayMessage(`チェックポイントに復元しました。`, 'system', 'システム');

            // UI更新
            const allCheckpoints = document.querySelectorAll('.checkpoint-msg');
            const targetTimestamp = parseInt(checkpointId.split('-')[1]);

            allCheckpoints.forEach(cpMsgDiv => {
                const button = cpMsgDiv.querySelector('.restore-checkpoint-btn-inline');
                if (!button) return;
                
                const currentTimestamp = parseInt(button.dataset.checkpointId.split('-')[1]);

                if (currentTimestamp >= targetTimestamp) {
                    button.disabled = true;
                    button.innerHTML = `<i class="fas fa-history"></i> 復元済み`;
                    cpMsgDiv.classList.add('disabled');
                }
            });
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
    getInheritedPlan() {
        return this.state.inheritedPlan || null;
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
        
        // 自律モードの計画フェーズでは、システムプロンプトを直接渡す
        const planText = await this.handler._requestToAI(messages, 1);
        
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
            const result = await this.executeCommand(command);
            
            if (!result.success) {
                // c. 自己修正（ここでは単純にエラーを投げて停止）
                throw new Error(`ステップ ${i + 1} の実行に失敗しました: ${result.message}`);
            }
             this.handler.displayMessage(`✅ ステップ ${i + 1} 完了`, 'success-msg');
             
             await new Promise(resolve => setTimeout(resolve, 1000)); // 次のステップに進む前に少し待つ
        }
    }

    async generateCommandForTask(task) {
        const messages = [
            { role: 'user', content: `以下のタスクを実行するためのXMLコマンドを生成してください: "${task}"` }
        ];
        
        // 自律モード用の履歴は、通常のチャット履歴とは独立させる
        const rawResponse = await this.handler._requestToAI(messages);
        // 自律モードではコマンドの検証が必須
        return this.handler._extractAndValidateCommand(rawResponse);
    }

    async processTextWithAI(processType, text, elementId) {
        if (!text) {
            alert('テキストが空です。');
            return;
        }

        this.displayMessage(`${processType} を実行中...`, 'loading');

        const prompts = {
            catchphrase: `以下のテキストの魅力を引き出す、クリエイティブなキャッチコピーを3つ提案してください。結果は必ずJSON配列形式（例: ["案1", "案2", "案3"]）で返してください。\n\nテキスト:\n「${text}」`,
            summarize: `以下のテキストを、スライドに適した簡潔な文章に要約してください。\n\nテキスト:\n「${text}」`,
            proofread: `以下のテキストを校正し、より自然で分かりやすい表現に修正してください。\n\nテキスト:\n「${text}」`
        };

        const prompt = prompts[processType];
        if (!prompt) {
            console.error('無効な処理タイプです:', processType);
            return;
        }

        try {
            // テキスト処理専用のAPIリクエスト
            const messages = [{ role: 'user', content: prompt }];
            const aiResponse = await this._requestToAI(messages, 0); // リトライなし

            // ローディングメッセージを消す
            const loadingMsg = document.querySelector('.loading-msg');
            if (loadingMsg) loadingMsg.remove();

            this.showSuggestionPopover(processType, aiResponse, elementId);

        } catch (error) {
            const loadingMsg = document.querySelector('.loading-msg');
            if (loadingMsg) loadingMsg.remove();
            this.displayMessage(`エラー: ${error.message}`, 'error');
            console.error('AIテキスト処理エラー:', error);
        }
    }

    showSuggestionPopover(processType, aiResponse, elementId) {
        const popover = document.getElementById('ai-suggestion-popover');
        const contentDiv = document.getElementById('ai-suggestion-content');
        const applyBtn = document.getElementById('ai-suggestion-apply');
        const cancelBtn = document.getElementById('ai-suggestion-cancel');

        if (!popover || !contentDiv || !applyBtn || !cancelBtn) return;
        
        let selectedSuggestion = null;

        if (processType === 'catchphrase') {
            try {
                const suggestions = JSON.parse(aiResponse);
                contentDiv.innerHTML = '<strong>キャッチコピー案:</strong>';
                const list = document.createElement('ul');
                list.style.listStyle = 'none';
                list.style.padding = '0';
                list.style.margin = '8px 0 0 0';

                suggestions.forEach(suggestion => {
                    const item = document.createElement('li');
                    // DOMPurifyでサニタイズしてからinnerHTMLに設定
                    item.innerHTML = DOMPurify.sanitize(suggestion);
                    item.style.padding = '6px';
                    item.style.border = '1px solid var(--border-color)';
                    item.style.borderRadius = '4px';
                    item.style.marginBottom = '4px';
                    item.style.cursor = 'pointer';
                    item.style.wordBreak = 'break-word'; // UI崩れ対策
                    item.style.lineHeight = '1.5';      // UI崩れ対策
                    item.onclick = () => {
                        list.querySelectorAll('li').forEach(li => li.style.backgroundColor = 'transparent');
                        item.style.backgroundColor = 'var(--primary-color-hover)';
                        selectedSuggestion = suggestion;
                    };
                    list.appendChild(item);
                });
                contentDiv.appendChild(list);
                applyBtn.textContent = '選択した案を適用';

            } catch (e) {
                console.error("キャッチコピーのJSONパースに失敗:", e);
                contentDiv.textContent = `エラー: AIからの応答形式が正しくありません。\n${aiResponse}`;
                applyBtn.style.display = 'none';
            }
        } else {
            // DOMPurifyでサニタイズ
            const sanitizedResponse = DOMPurify.sanitize(aiResponse);
            contentDiv.innerHTML = `<strong>提案:</strong><p style="margin-top:4px; padding:8px; background-color: var(--bg-light); border-radius:4px; word-break: break-word; line-height: 1.5;">${sanitizedResponse}</p>`;
            selectedSuggestion = aiResponse; // 元の応答を保持
            applyBtn.textContent = '適用';
        }

        const applyHandler = () => {
            if (selectedSuggestion) {
                const element = this.app.getActiveSlide()?.elements.find(el => el.id === elementId);
                if (element) {
                    element.content = selectedSuggestion;
                    this.app.render();
                    this.app.saveState();
                }
            }
            popover.style.display = 'none';
        };

        const cancelHandler = () => {
            popover.style.display = 'none';
        };
        
        // イベントリスナーを一度削除してから再設定
        applyBtn.replaceWith(applyBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        document.getElementById('ai-suggestion-apply').onclick = applyHandler;
        document.getElementById('ai-suggestion-cancel').onclick = cancelHandler;


        const targetElement = document.querySelector(`[data-id="${elementId}"]`);
        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            popover.style.left = `${rect.right + 10}px`;
            popover.style.top = `${rect.top}px`;
        }

        popover.style.display = 'block';
    }
}

