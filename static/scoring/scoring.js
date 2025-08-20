document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const stepContents = document.querySelectorAll('.step-content');
    const steps = document.querySelectorAll('.step');
    
    // Step 1
    const slideList = document.getElementById('scoring-slide-list');
    const toStep2Btn = document.getElementById('to-step-2-btn');

    // Step 2
    const backToStep1Btn = document.getElementById('back-to-step-1-btn');
    const toStep3Btn = document.getElementById('to-step-3-btn');
    const cameraView = document.getElementById('camera-view');
    const startRecordingBtn = document.getElementById('start-recording-btn');
    const stopRecordingBtn = document.getElementById('stop-recording-btn');
    const recordingTimer = document.getElementById('recording-timer');
    const slidePreview = document.getElementById('slide-preview');
    const toggleViewBtn = document.getElementById('toggle-view-btn');
    const recordingLayout = document.querySelector('.recording-layout');
    const targetTimeInput = document.getElementById('target-time-input');

    // Step 3
    const backToStep2Btn = document.getElementById('back-to-step-2-btn');
    const toDashboardBtn = document.getElementById('to-dashboard-btn');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const resultDisplay = document.getElementById('result-display');

    // --- State ---
    let currentStep = 1;
    let selectedSlideId = null;
    let mediaRecorder;
    let recordedChunks = [];
    let timerInterval;

    // --- Functions ---

    /**
     * Navigate to a specific step
     * @param {number} stepNumber The step to navigate to
     */
    const goToStep = (stepNumber) => {
        currentStep = stepNumber;
        
        // Update step indicators
        steps.forEach(step => {
            const stepNum = parseInt(step.dataset.step, 10);
            step.classList.remove('active', 'completed');
            if (stepNum < currentStep) {
                step.classList.add('completed');
            } else if (stepNum === currentStep) {
                step.classList.add('active');
            }
        });

        // Show the correct content
        stepContents.forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`step-${currentStep}`).classList.add('active');

        // Handle step-specific logic
        if (currentStep === 2) {
            initCamera();
        } else {
            stopCamera();
        }
    };

    /**
     * Fetch and display slides for selection
     */
    const loadSlides = async () => {
        try {
            // This is a placeholder. In a real app, you'd fetch this from the server.
            const slides = [
                { id: 1, title: '2024年第1四半期 業績報告' },
                { id: 2, title: '新規プロジェクト「Phoenix」提案' },
                { id: 3, title: 'マーケティング戦略 2025' },
            ];
            
            slideList.innerHTML = '';
            slides.forEach(slide => {
                const card = document.createElement('div');
                card.className = 'slide-card';
                card.dataset.slideId = slide.id;
                card.innerHTML = `
                    <div class="slide-info">
                        <div class="slide-title">${slide.title}</div>
                    </div>
                `;
                card.addEventListener('click', () => selectSlide(slide.id, card));
                slideList.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load slides:', error);
            slideList.innerHTML = '<p>スライドの読み込みに失敗しました。</p>';
        }
    };

    /**
     * Handle slide selection
     * @param {number} slideId The ID of the selected slide
     * @param {HTMLElement} cardElement The clicked card element
     */
    const selectSlide = (slideId, cardElement) => {
        selectedSlideId = slideId;
        
        // Update UI
        document.querySelectorAll('#scoring-slide-list .slide-card').forEach(card => {
            card.classList.remove('selected');
        });
        cardElement.classList.add('selected');
        
        toStep2Btn.disabled = false;
        
        // Update slide preview for step 2
        slidePreview.innerHTML = `<h4>${cardElement.querySelector('.slide-title').textContent}</h4><p>プレビューが表示されます</p>`;
    };

    /**
     * Initialize the camera
     */
    const initCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            cameraView.srcObject = stream;
        } catch (error) {
            console.error('Camera access denied:', error);
            alert('カメラへのアクセスが拒否されました。設定を確認してください。');
            goToStep(1);
        }
    };

    /**
     * Stop the camera stream
     */
    const stopCamera = () => {
        if (cameraView.srcObject) {
            cameraView.srcObject.getTracks().forEach(track => track.stop());
            cameraView.srcObject = null;
        }
    };

    /**
     * Start recording
     */
    const startRecording = () => {
        if (!cameraView.srcObject) return;

        recordedChunks = [];
        const stream = cameraView.srcObject;
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            toStep3Btn.disabled = false;
        };

        mediaRecorder.start();
        startRecordingBtn.style.display = 'none';
        stopRecordingBtn.style.display = 'inline-block';
        targetTimeInput.disabled = true; // Disable input during recording
        
        // Start timer
        let seconds = 0;
        const targetMinutes = parseInt(targetTimeInput.value, 10);
        const targetSeconds = isNaN(targetMinutes) || targetMinutes <= 0 ? null : targetMinutes * 60;

        const formatTime = (s) => {
            const min = Math.floor(s / 60).toString().padStart(2, '0');
            const sec = (s % 60).toString().padStart(2, '0');
            return `${min}:${sec}`;
        };

        // Initial display
        recordingTimer.textContent = targetSeconds
            ? `00:00 / ${formatTime(targetSeconds)}`
            : '00:00';

        timerInterval = setInterval(() => {
            seconds++;
            const currentTimeFormatted = formatTime(seconds);
            
            if (targetSeconds) {
                recordingTimer.textContent = `${currentTimeFormatted} / ${formatTime(targetSeconds)}`;
                if (seconds > targetSeconds) {
                    recordingTimer.classList.add('timer-overtime');
                }
            } else {
                recordingTimer.textContent = currentTimeFormatted;
            }
        }, 1000);
    };

    /**
     * Stop recording
     */
    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        stopRecordingBtn.style.display = 'none';
        startRecordingBtn.style.display = 'inline-block';
        targetTimeInput.disabled = false; // Re-enable input
        clearInterval(timerInterval);
        
        // Reset timer display
        recordingTimer.classList.remove('timer-overtime');
        const targetMinutes = parseInt(targetTimeInput.value, 10);
        const targetSeconds = isNaN(targetMinutes) || targetMinutes <= 0 ? null : targetMinutes * 60;
        if (targetSeconds) {
            const min = Math.floor(targetSeconds / 60).toString().padStart(2, '0');
            const sec = (targetSeconds % 60).toString().padStart(2, '0');
            recordingTimer.textContent = `00:00 / ${min}:${sec}`;
        } else {
            recordingTimer.textContent = '00:00';
        }
    };

    /**
     * Upload the recorded video and get score
     */
    const getScore = async () => {
        if (recordedChunks.length === 0) {
            alert('録画データがありません。');
            return;
        }

        goToStep(3);
        loadingSpinner.style.display = 'block';
        resultDisplay.innerHTML = '';

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('video', blob, `recording_${selectedSlideId}.webm`);
        formData.append('slide_id', selectedSlideId);

        try {
            // This is a placeholder for the actual API call
            // const response = await fetch('/scoring/upload', {
            //     method: 'POST',
            //     body: formData,
            // });
            // const result = await response.json();

            // Mock result
            await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate network delay
            const result = {
                score: 85,
                feedback: {
                    clarity: "声が明瞭で聞き取りやすいです。",
                    pace: "話すペースが適切で、聴衆を引きつけます。",
                    engagement: "ジェスチャーや視線の使い方が効果的です。",
                    improvement_points: [
                        "専門用語について、もう少し簡単な言葉で補足するとより分かりやすくなります。",
                        "スライドの切り替えタイミングが少し早い箇所がありました。"
                    ]
                }
            };

            displayResults(result);

        } catch (error) {
            console.error('Failed to get score:', error);
            resultDisplay.innerHTML = '<p>採点に失敗しました。もう一度お試しください。</p>';
        } finally {
            loadingSpinner.style.display = 'none';
        }
    };
    
    /**
     * Display scoring results
     * @param {object} result The scoring result from the server
     */
    const displayResults = (result) => {
        let pointsHtml = result.feedback.improvement_points.map(point => `<li>${point}</li>`).join('');
        resultDisplay.innerHTML = `
            <h4>総合スコア: ${result.score}点</h4>
            <h5>フィードバック</h5>
            <ul>
                <li><strong>明瞭さ:</strong> ${result.feedback.clarity}</li>
                <li><strong>ペース:</strong> ${result.feedback.pace}</li>
                <li><strong>エンゲージメント:</strong> ${result.feedback.engagement}</li>
            </ul>
            <h5>改善点</h5>
            <ul>${pointsHtml}</ul>
        `;
    };


    // --- Event Listeners ---
    toStep2Btn.addEventListener('click', () => goToStep(2));
    backToStep1Btn.addEventListener('click', () => goToStep(1));
    toStep3Btn.addEventListener('click', getScore);
    backToStep2Btn.addEventListener('click', () => {
        goToStep(2);
        toStep3Btn.disabled = true;
    });
    toDashboardBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    toggleViewBtn.addEventListener('click', () => {
        recordingLayout.classList.toggle('slide-fullscreen');
        const icon = toggleViewBtn.querySelector('i');
        if (recordingLayout.classList.contains('slide-fullscreen')) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
            toggleViewBtn.title = '通常表示に戻す';
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
            toggleViewBtn.title = 'スライドを全画面表示';
        }
    });

    // --- Initial Load ---
    loadSlides();
});