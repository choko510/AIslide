/* Navigation enhancements: back and skip */
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-button');
    const skipBtn = document.getElementById('skip-button');

    // 既存のグローバル関数があれば利用、無ければ no-op
    const goPrev = (window.planGoPrev || window.goPrev || function(){});
    const skipCurrent = (window.planSkip || window.skipQuestion || function(){
        // フォールバック: 次へ進む関数があればスキップ扱いで進む
        if (typeof window.planGoNext === 'function') window.planGoNext(true);
        else if (typeof window.goNext === 'function') window.goNext(true);
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        goPrev();
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        skipCurrent();
        });
    }
});
document.addEventListener('DOMContentLoaded', () => {
    // q1の選択に応じて質問セットを出し分ける
    const nodes = {
        q1: {
            id: 'q1',
            question: "どこまで自分で決める気がありますか？",
            options: ["ほぼAIに任せたい", "そこそこ指定したい", "がっつり指定したい", "AIと相談しながら決めたい"],
            type: "choice",
            next: (answer, state) => {
                if (answer === "ほぼAIに任せたい") return 'ai_purpose';
                if (answer === "そこそこ指定したい") return 'mid_purpose';
                if (answer === "がっつり指定したい") return 'deep_purpose';
                if (answer === "AIと相談しながら決めたい") return 'chat_intro';
                return null;
            }
        },

        // --- AIと相談しながら決めたい（チャット） ---
        chat_intro: {
            id: 'chat_intro',
            question: "どんなスライドを作りたいですか？AIと対話しながら一緒に決めましょう。",
            type: "chat",
            next: () => 'chat_running'
        },
        chat_running: {
            id: 'chat_running',
            question: "チャット継続中。必要に応じて「この内容で進める」を押してください。",
            type: "chat",
            next: () => 'chat_confirm'
        },
        chat_confirm: {
            id: 'chat_confirm',
            question: "対話内容をもとにスライド作成に進みますか？（必要なら続けて相談できます）",
            type: "chat-confirm",
            next: (answer, state) => {
                // answer は "proceed" | "continue"
                if (answer === "proceed") return null; // finishPlanning() へ
                return 'chat_running';
            }
        },

        // ほぼAIに任せたい: 目的 -> タイトル -> 枚数
        ai_purpose: {
            id: 'ai_purpose',
            question: "スライドの目的を選んでください（例：社内プレゼン／営業提案／製品紹介／学会発表 など）",
            type: "choice",
            options: ["社内プレゼン", "営業提案", "製品紹介", "学会発表", "その他"],
            next: () => 'ai_title'
        },
        ai_title: {
            id: 'ai_title',
            question: "テーマ・タイトルを入力してください（例：「AIが変える未来の教育」）",
            type: "text",
            next: () => 'ai_pages'
        },
        ai_pages: {
            id: 'ai_pages',
            question: "スライドの枚数目安（例：5枚程度、10枚以内、時間にして10分程度 など）",
            type: "text",
            next: () => null
        },

        // そこそこ指定したい: 目的 -> ターゲット -> トーン -> タイトル -> 構成/ポイント -> 枚数 -> 具体文言/画像
        mid_purpose: {
            id: 'mid_purpose',
            question: "スライドの目的を選んでください（例：社内プレゼン／営業提案／製品紹介／学会発表 など）",
            type: "choice",
            options: ["社内プレゼン", "営業提案", "製品紹介", "学会発表", "その他"],
            next: () => 'mid_audience'
        },
        mid_audience: {
            id: 'mid_audience',
            question: "ターゲット（聴衆）を選んでください（例：経営層／一般社員／顧客／学生 など）",
            type: "choice",
            options: ["経営層", "一般社員", "顧客", "学生", "その他"],
            next: () => 'mid_tone'
        },
        mid_tone: {
            id: 'mid_tone',
            question: "トーン・雰囲気を選んでください（例：カジュアル／フォーマル／ユーモアあり／堅実 など）",
            type: "choice",
            options: ["カジュアル", "フォーマル", "ユーモアあり", "堅実", "クリエイティブ"],
            next: () => 'mid_title'
        },
        mid_title: {
            id: 'mid_title',
            question: "テーマ・タイトルを入力してください（例：「AIが変える未来の教育」）",
            type: "text",
            next: () => 'mid_outline'
        },
        mid_outline: {
            id: 'mid_outline',
            question: "全体の構成案 or 伝えたいポイントを入力してください（例：導入 → 問題提起 → 解決策 → まとめ）",
            type: "text",
            next: () => 'mid_pages'
        },
        mid_pages: {
            id: 'mid_pages',
            question: "スライドの枚数目安（例：5枚程度、10枚以内、時間にして10分程度 など）",
            type: "text",
            next: () => 'mid_assets'
        },
        mid_assets: {
            id: 'mid_assets',
            question: "含めたい具体的な文言や画像（キーメッセージ、引用文、ロゴ画像など）があれば入力してください",
            type: "text",
            next: () => null
        },

        // がっつり指定したい: そこそこ + デザインの好み + 禁止/避けたい
        deep_purpose: {
            id: 'deep_purpose',
            question: "スライドの目的を選んでください（例：社内プレゼン／営業提案／製品紹介／学会発表 など）",
            type: "choice",
            options: ["社内プレゼン", "営業提案", "製品紹介", "学会発表", "その他"],
            next: () => 'deep_audience'
        },
        deep_audience: {
            id: 'deep_audience',
            question: "ターゲット（聴衆）を選んでください（例：経営層／一般社員／顧客／学生 など）",
            type: "choice",
            options: ["経営層", "一般社員", "顧客", "学生", "その他"],
            next: () => 'deep_tone'
        },
        deep_tone: {
            id: 'deep_tone',
            question: "トーン・雰囲気を選んでください（例：カジュアル／フォーマル／ユーモアあり／堅実 など）",
            type: "choice",
            options: ["カジュアル", "フォーマル", "ユーモアあり", "堅実", "クリエイティブ"],
            next: () => 'deep_title'
        },
        deep_title: {
            id: 'deep_title',
            question: "テーマ・タイトルを入力してください（例：「AIが変える未来の教育」）",
            type: "text",
            next: () => 'deep_outline'
        },
        deep_outline: {
            id: 'deep_outline',
            question: "全体の構成案 or 伝えたいポイントを入力してください（例：導入 → 問題提起 → 解決策 → まとめ）",
            type: "text",
            next: () => 'deep_pages'
        },
        deep_pages: {
            id: 'deep_pages',
            question: "スライドの枚数目安（例：5枚程度、10枚以内、時間にして10分程度 など）",
            type: "text",
            next: () => 'deep_assets'
        },
        deep_assets: {
            id: 'deep_assets',
            question: "含めたい具体的な文言や画像（キーメッセージ、引用文、ロゴ画像など）があれば入力してください",
            type: "text",
            next: () => 'deep_design'
        },
        deep_design: {
            id: 'deep_design',
            question: "デザインの好みを選んでください（例：ミニマル、ビジネスライク、図多め、カラー指定 など）",
            type: "choice",
            options: ["ミニマル", "ビジネスライク", "図多め", "カラー指定", "その他"],
            next: () => 'deep_avoid'
        },
        deep_avoid: {
            id: 'deep_avoid',
            question: "禁止したい表現や避けたい構成があれば入力してください（例：「スライドに文字が多すぎるのは避けて」など）",
            type: "text",
            next: () => null
        }
    };

    // 動的な進捗: 現在の分岐チェーンを推定して総数を算出
    let startNodeId = 'q1';
    let currentNodeId = startNodeId;
    let answers = {};
    let path = [];

    const progressBar = document.getElementById('progress-bar');
    const questionContainer = document.getElementById('question-container');
    const prevButton = document.getElementById('prev-button');
    const navigationContainer = document.getElementById('navigation-container');

    function inferFlowTotalCount() {
        // q1の回答に応じて、そのチェーン長を返す
        const a = answers[nodes.q1.question];
        if (a === "ほぼAIに任せたい") return 1 + 3; // q1 + ai_* 3問
        if (a === "そこそこ指定したい") return 1 + 7; // q1 + mid_* 7問
        if (a === "がっつり指定したい") return 1 + 9; // q1 + deep_* 9問
        if (a === "AIと相談しながら決めたい") return 1 + 3; // q1 + chat_intro/chat_running/chat_confirm
        // まだ未選択
        return 1;
    }

    function loadState() {
        const saved = localStorage.getItem('slidePlanStateV2');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (s && s.answers && s.currentNodeId && Array.isArray(s.path)) {
                    answers = s.answers;
                    currentNodeId = s.currentNodeId;
                    path = s.path;
                }
            } catch (_) {}
        }
        if (!currentNodeId) currentNodeId = startNodeId;
        if (!Array.isArray(path)) path = [];
    }

    function saveState() {
        const state = { answers, currentNodeId, path };
        localStorage.setItem('slidePlanStateV2', JSON.stringify(state));
    }

    function updateProgressBar() {
        const total = inferFlowTotalCount();
        const visited = Math.min(path.length + 1, total);
        const progress = total > 0 ? (visited / total) * 100 : 0;
        progressBar.style.width = `${progress}%`;
    }

    function getCurrentNode() {
        return nodes[currentNodeId];
    }

    function displayQuestion() {
        const oldNextButton = document.getElementById('next-button');
        if (oldNextButton) oldNextButton.remove();

        const node = getCurrentNode();
        if (!node) {
            finishPlanning();
            return;
        }

        questionContainer.innerHTML = '';

        const questionElement = document.createElement('h2');
        questionElement.textContent = node.question;
        questionContainer.appendChild(questionElement);

        if (node.type === "choice") {
            node.options.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.className = 'option-button';
                button.onclick = () => selectAnswer(option);
                questionContainer.appendChild(button);
            });
        } else if (node.type === "text") {
            const input = document.createElement('input');
            input.type = "text";
            input.placeholder = "回答を入力してください";
            input.value = answers[node.question] || '';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    selectAnswer(input.value);
                }
            });
            questionContainer.appendChild(input);

            const nextButton = document.createElement('button');
            nextButton.textContent = "次へ";
            nextButton.id = 'next-button';
            nextButton.onclick = () => selectAnswer(input.value);
            navigationContainer.appendChild(nextButton);
        } else if (node.type === "chat" || node.type === "chat-confirm") {
            renderChatPanel(node);
        }

        prevButton.style.display = path.length === 0 ? 'none' : 'inline-block';
        updateProgressBar();
        saveState();
    }

    function selectAnswer(answer) {
        const node = getCurrentNode();
        if (!node) return;

        if (typeof answer === 'string' && answer.trim() === '' && node.type === 'text') {
            alert('入力してください');
            return;
        }

        answers[node.question] = answer;

        let nextId = null;
        if (typeof node.next === 'function') {
            try {
                nextId = node.next(answer, { answers, path, currentNodeId });
            } catch (_) {
                nextId = null;
            }
        }

        path.push(currentNodeId);
        currentNodeId = nextId;

        if (!currentNodeId) {
            finishPlanning();
            return;
        }

        displayQuestion();
    }

    // --- Chat UI 実装 ---
    let chatHistory = []; // {role: 'user'|'assistant', text: string}[]

    // 簡易Markdownレンダラ（依存なしの軽量版）
    function renderMarkdown(src) {
        // エスケープ
        const escapeHtml = (s) => s
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">");

        // 事前にコードブロックを抽出してプレースホルダ化
        const codeBlocks = [];
        let text = src.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (m, lang, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push({ lang: lang || '', code });
            return `§§CODEBLOCK_${idx}§§`;
        });

        // インラインコード
        text = text.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);

        // 見出し # ～ ######
        text =  text.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
                    .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
                    .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
                    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
                    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
                    .replace(/^# (.*)$/gm, '<h1>$1</h1>');

        // 箇条書き（シンプル変換）
        // 連続する - または * の行を <ul><li>...</li></ul> に
        text = text.replace(/(^|\n)([-*] .*(\n[-*] .*)+)/g, (m) => {
            const items = m.trim().split('\n').map(l => l.replace(/^[-*]\s+/, '').trim());
            return `\n<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
        });

        // 番号リスト
        text = text.replace(/(^|\n)((\d+)\. .*(\n(\d+)\. .*)+)/g, (m) => {
            const items = m.trim().split('\n').map(l => l.replace(/^\d+\.\s+/, '').trim());
            return `\n<ol>${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
        });

        // 引用
        text = text.replace(/(^|\n)>(.*)/g, (m, nl, body) => `${nl}<blockquote>${body.trim()}</blockquote>`);

        // 太字/斜体
        text =  text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 改行を<p>扱い（既にh/ul/ol/blockquote等に変換済みのものは維持）
        const paragraphs = text.split(/\n{2,}/).map(seg => {
            // 既にブロック要素で始まる場合はそのまま
            if (/^\s*<(h\d|ul|ol|pre|blockquote)/.test(seg)) return seg;
            return `<p>${seg.replace(/\n/g, '<br>')}</p>`;
        }).join('\n');

        // コードブロックを戻す
        const restored = paragraphs.replace(/§§CODEBLOCK_(\d+)§§/g, (m, idxStr) => {
            const idx = parseInt(idxStr, 10);
            const block = codeBlocks[idx];
            const codeEscaped = escapeHtml(block.code);
            return `<pre><code class="language-${block.lang}">${codeEscaped}</code></pre>`;
        });

        return restored;
    }

    function renderChatPanel(node) {
        // 既存の「次へ」ボタンを削除
        const oldNextButton = document.getElementById('next-button');
        if (oldNextButton) oldNextButton.remove();

        // ラッパー
        const chatWrapper = document.createElement('div');
        chatWrapper.className = 'chat-wrapper';
        chatWrapper.style.border = '1px solid #ddd';
        chatWrapper.style.borderRadius = '8px';
        chatWrapper.style.padding = '12px';
        chatWrapper.style.marginTop = '8px';
        chatWrapper.style.display = 'flex';
        chatWrapper.style.flexDirection = 'column';
        chatWrapper.style.gap = '8px';

        // ログ
        const log = document.createElement('div');
        log.id = 'chat-log';

        function redraw() {
            log.innerHTML = '';
            chatHistory.forEach(msg => {
                const bubble = document.createElement('div');
                bubble.className = `chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;
                if (msg.role === 'assistant') {
                    // Markdownレンダリング（簡易）
                    bubble.innerHTML = renderMarkdown(msg.text);
                } else {
                    bubble.textContent = msg.text;
                }
                log.appendChild(bubble);
            });
            log.scrollTop = log.scrollHeight;
        }

        // 入力行
        const inputRow = document.createElement('div');
        inputRow.className = 'chat-input-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'どんなスライドを作りたいですか？（例：新製品の社内発表、10分、フォーマル）';
        input.style.flex = '1';

        const sendBtn = document.createElement('button');
        sendBtn.textContent = '送信';

        const proceedBtn = document.createElement('button');
        proceedBtn.textContent = 'この内容で進める';
        proceedBtn.className = 'proceed-btn';

        inputRow.appendChild(input);
        inputRow.appendChild(sendBtn);
        if (node.type === 'chat-confirm' || node.id === 'chat_running') {
            inputRow.appendChild(proceedBtn);
        }

        chatWrapper.appendChild(log);
        chatWrapper.appendChild(inputRow);
        questionContainer.appendChild(chatWrapper);

        // 初回メッセージ
        if (chatHistory.length === 0 && node.id === 'chat_intro') {
            const sys = "こんにちは。どんなスライドを作りたいか教えてください。目的、ターゲット、トーン、タイトル案、枚数の希望など何でも構いません。";
            chatHistory.push({role: 'assistant', text: sys});
            redraw();
        } else {
            redraw();
        }

        function buildPrompt(userMessage) {
            const contextLines = chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
            return `[コンテキスト]\n${contextLines}\n\n[ユーザー入力]\n${userMessage}\n\n[指示]\n上記を踏まえて、スライド計画の具体化に役立つ提案や確認質問を日本語で簡潔に返答してください。必要なら箇条書きで整理してください。`;
        }

        async function callAI(userMessage) {
            const payload = new URLSearchParams();
            payload.append('prompt', buildPrompt(userMessage));
            payload.append('is_search', 'false');

            try {
                const res = await fetch('/ai/ask', { method: 'POST', body: payload });
                if (!res.ok) {
                    const t = await res.text();
                    throw new Error(`AI request failed: ${res.status} ${t}`);
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let aiText = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    aiText += decoder.decode(value, { stream: true });
                }
                aiText += decoder.decode();
                return aiText.trim();
            } catch (e) {
                return `エラーが発生しました: ${e}`;
            }
        }

        async function onSend() {
            const v = input.value.trim();
            if (!v) return;
            chatHistory.push({role: 'user', text: v});
            input.value = '';
            redraw();

            sendBtn.disabled = true;
            proceedBtn.disabled = true;
            input.disabled = true;
            const reply = await callAI(v);
            chatHistory.push({role: 'assistant', text: reply});
            sendBtn.disabled = false;
            proceedBtn.disabled = false;
            input.disabled = false;
            redraw();
        }

        function onProceed() {
            // 履歴を保存（/slide 側で要約利用できるように）
            answers["チャットモード履歴"] = JSON.stringify(chatHistory);
            if (node.type === 'chat-confirm') {
                selectAnswer("proceed");
            } else {
                currentNodeId = 'chat_confirm';
                displayQuestion();
            }
        }

        sendBtn.onclick = onSend;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onSend();
            }
        });
        proceedBtn.onclick = onProceed;
    }

    function prevQuestion() {
        if (path.length > 0) {
            const current = getCurrentNode();
            if (current && current.question && Object.prototype.hasOwnProperty.call(answers, current.question)) {
                delete answers[current.question];
            }
            currentNodeId = path.pop();
            displayQuestion();
        }
    }

    function finishPlanning() {
        updateProgressBar();
        console.log("最終的な回答:", answers);
        const answersJSON = JSON.stringify(answers);
        // Base64(URLセーフ)でエンコード
        const base64 = btoa(unescape(encodeURIComponent(answersJSON)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');

        localStorage.removeItem('slidePlanAnswers');
        localStorage.removeItem('slidePlanIndex');
        localStorage.removeItem('slidePlanStateV2');

        window.location.href = `/slide?data=${base64}`;
    }

    prevButton.onclick = prevQuestion;

    loadState();
    displayQuestion();
});