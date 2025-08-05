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
    const questions = [
        {
            question: "どんなシーンでスライドを使いますか？",
            options: ["ビジネス", "教育", "エンターテイメント", "その他"],
            type: "choice"
        },
        {
            question: "スライドの主な目的は何ですか？",
            options: ["情報伝達", "説得", "教育・研修", "楽しませる"],
            type: "choice"
        },
        {
            question: "ターゲットとなる視聴者は誰ですか？",
            type: "text"
        },
        {
            question: "スライド全体のトーン＆マナーは？",
            options: ["フォーマル", "カジュアル", "クリエイティブ", "シンプル"],
            type: "choice"
        },
        {
            question: "特に伝えたい重要なメッセージを自由に入力してください。",
            type: "text"
        }
    ];

    let currentQuestionIndex = 0;
    let answers = {};

    const progressBar = document.getElementById('progress-bar');
    const questionContainer = document.getElementById('question-container');
    const prevButton = document.getElementById('prev-button');
    const navigationContainer = document.getElementById('navigation-container');

    function loadState() {
        const savedAnswers = localStorage.getItem('slidePlanAnswers');
        const savedIndex = localStorage.getItem('slidePlanIndex');
        
        if (savedAnswers) {
            answers = JSON.parse(savedAnswers);
        }
        if (savedIndex) {
            currentQuestionIndex = parseInt(savedIndex, 10);
        } else {
            currentQuestionIndex = 0;
            answers = {};
        }
    }
    
    function saveState() {
        localStorage.setItem('slidePlanAnswers', JSON.stringify(answers));
        localStorage.setItem('slidePlanIndex', currentQuestionIndex.toString());
    }
    
    function updateProgressBar() {
        const progress = (currentQuestionIndex / questions.length) * 100;
        progressBar.style.width = `${progress}%`;
    }

    function displayQuestion() {
        // 古い「次へ」ボタンを削除
        const oldNextButton = document.getElementById('next-button');
        if (oldNextButton) {
            oldNextButton.remove();
        }

        if (currentQuestionIndex >= questions.length) {
            finishPlanning();
            return;
        }

        const currentQuestion = questions[currentQuestionIndex];
        questionContainer.innerHTML = '';

        const questionElement = document.createElement('h2');
        questionElement.textContent = currentQuestion.question;
        questionContainer.appendChild(questionElement);

        if (currentQuestion.type === "choice") {
            currentQuestion.options.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.className = 'option-button';
                button.onclick = () => selectAnswer(option);
                questionContainer.appendChild(button);
            });
        } else if (currentQuestion.type === "text") {
            const input = document.createElement('input');
            input.type = "text";
            input.placeholder = "回答を入力してください";
            input.value = answers[currentQuestion.question] || '';
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
        }
        
        prevButton.style.display = currentQuestionIndex === 0 ? 'none' : 'inline-block';
        updateProgressBar();
        saveState();
    }

    function selectAnswer(answer) {
        if (typeof answer === 'string' && answer.trim() === '' && questions[currentQuestionIndex].type === 'text') {
            alert('入力してください');
            return;
        }
        const currentQuestion = questions[currentQuestionIndex];
        answers[currentQuestion.question] = answer;
        currentQuestionIndex++;
        displayQuestion();
    }
    
    function prevQuestion() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            displayQuestion();
        }
    }

    function finishPlanning() {
        updateProgressBar();
        console.log("最終的な回答:", answers);
        const answersJSON = JSON.stringify(answers);
        const encodedAnswers = encodeURIComponent(answersJSON);
        
        // localStorageをクリア
        localStorage.removeItem('slidePlanAnswers');
        localStorage.removeItem('slidePlanIndex');

        // サーバーにデータを送信してスライド生成ページへ
        window.location.href = `/slide?data=${encodedAnswers}`;
    }

    prevButton.onclick = prevQuestion;

    loadState();
    displayQuestion();
});