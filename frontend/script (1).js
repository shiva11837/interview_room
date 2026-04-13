/**
 * AI Interview Room - Figma-Inspired Design
 * JavaScript functionality
 */

// ============================================
// GLOBAL VARIABLES
// ============================================

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingTime = 0;
let recordingInterval = null;
let interviewTimer = null;
let interviewTimeRemaining = 45 * 60;
let currentQuestionIndex = 0;
let responses = [];

// Sample questions
const questions = [
    { id: 1, text: "Tell us about your experience with CI/CD pipelines and automation tools." },
    { id: 2, text: "Describe a challenging DevOps problem you solved recently." },
    { id: 3, text: "How do you handle infrastructure as code in your projects?" },
    { id: 4, text: "Explain your experience with container orchestration." },
    { id: 5, text: "How would you design a monitoring system for microservices?" },
    { id: 6, text: "Describe your experience with cloud platforms." },
    { id: 7, text: "How do you ensure security in your deployment pipelines?" },
    { id: 8, text: "Tell me about a time you had to debug a production issue." },
    { id: 9, text: "How do you handle database migrations in production?" },
    { id: 10, text: "What DevOps tools are you most proficient with?" }
];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeMedia();
    populateQuestionsList();
    startTimer();
    setupEventListeners();
});

async function initializeMedia() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        setupVideoElements();
        console.log('Media initialized successfully');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Please allow camera and microphone access for the interview.');
    }
}

function setupVideoElements() {
    const candidateVideo = document.getElementById('candidateVideo');
    const selfVideo = document.getElementById('selfVideo');
    
    if (candidateVideo && mediaStream) {
        candidateVideo.srcObject = mediaStream;
    }
    
    if (selfVideo && mediaStream) {
        selfVideo.srcObject = mediaStream;
    }
}

function setupEventListeners() {
    // Device controls
    document.getElementById('cameraBtn')?.addEventListener('click', toggleCamera);
    document.getElementById('micBtn')?.addEventListener('click', toggleMic);
    document.getElementById('speakerBtn')?.addEventListener('click', toggleSpeaker);
    
    // Recording controls
    document.getElementById('recordBtn')?.addEventListener('click', startRecording);
    document.getElementById('stopBtn')?.addEventListener('click', stopRecording);
    
    // Text response
    document.getElementById('textBtn')?.addEventListener('click', openTextModal);
    document.getElementById('closeModal')?.addEventListener('click', closeTextModal);
    document.getElementById('cancelText')?.addEventListener('click', closeTextModal);
    document.getElementById('submitText')?.addEventListener('click', submitTextResponse);
    
    // Questions sidebar
    document.querySelector('.questions-list-btn')?.addEventListener('click', toggleQuestionsSidebar);
    document.getElementById('closeQs')?.addEventListener('click', toggleQuestionsSidebar);
    
    // Copy room code
    document.querySelector('.copy-btn')?.addEventListener('click', copyRoomCode);
    
    // Disconnect
    document.getElementById('disconnectBtn')?.addEventListener('click', disconnectInterview);
}

// ============================================
// TIMER FUNCTIONS
// ============================================

function startTimer() {
    const timerElement = document.getElementById('timer');
    
    interviewTimer = setInterval(() => {
        interviewTimeRemaining--;
        
        const minutes = Math.floor(interviewTimeRemaining / 60);
        const seconds = interviewTimeRemaining % 60;
        
        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Warning at 5 minutes
        if (interviewTimeRemaining === 300) {
            alert('5 minutes remaining!');
        }
        
        if (interviewTimeRemaining <= 0) {
            clearInterval(interviewTimer);
            alert('Time is up! Your interview has ended.');
        }
    }, 1000);
}

// ============================================
// DEVICE CONTROLS
// ============================================

function toggleCamera() {
    const btn = document.getElementById('cameraBtn');
    
    if (mediaStream) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            btn?.classList.toggle('active', videoTrack.enabled);
        }
    }
}

function toggleMic() {
    const btn = document.getElementById('micBtn');
    
    if (mediaStream) {
        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            btn?.classList.toggle('active', audioTrack.enabled);
        }
    }
}

function toggleSpeaker() {
    const btn = document.getElementById('speakerBtn');
    btn?.classList.toggle('active');
}

// ============================================
// RECORDING FUNCTIONS
// ============================================

function setupMediaRecorder() {
    if (!mediaStream) return;
    
    const options = { mimeType: 'video/webm;codecs=vp9' };
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
    }
    
    mediaRecorder = new MediaRecorder(mediaStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = () => {
        console.log('Recording stopped, chunks:', recordedChunks.length);
    };
}

function startRecording() {
    if (!mediaStream) {
        alert('Please allow camera and microphone access.');
        return;
    }
    
    setupMediaRecorder();
    recordedChunks = [];
    
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(1000);
        isRecording = true;
        
        // Update UI
        document.getElementById('recordBtn').style.display = 'none';
        document.getElementById('recordingControls').style.display = 'flex';
        
        // Start recording timer
        recordingTime = 0;
        recordingInterval = setInterval(() => {
            recordingTime++;
            const minutes = Math.floor(recordingTime / 60);
            const seconds = recordingTime % 60;
            document.getElementById('recTime').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        
        // Clear interval
        if (recordingInterval) {
            clearInterval(recordingInterval);
        }
        
        // Update UI
        document.getElementById('recordBtn').style.display = 'flex';
        document.getElementById('recordingControls').style.display = 'none';
        
        // Save response
        responses.push({
            questionId: questions[currentQuestionIndex].id,
            type: 'video',
            duration: recordingTime
        });
        
        updateResponsesCount();
        markQuestionCompleted(currentQuestionIndex);
        
        // Enable submit button
        document.getElementById('submitBtn').disabled = false;
        
        // Move to next question
        if (currentQuestionIndex < questions.length - 1) {
            setTimeout(() => loadQuestion(currentQuestionIndex + 1), 1000);
        }
    }
}

// ============================================
// TEXT RESPONSE MODAL
// ============================================

function openTextModal() {
    document.getElementById('textModal').classList.add('active');
}

function closeTextModal() {
    document.getElementById('textModal').classList.remove('active');
    document.getElementById('textAnswer').value = '';
}

function submitTextResponse() {
    const textAnswer = document.getElementById('textAnswer');
    
    if (!textAnswer.value.trim()) {
        alert('Please enter your answer');
        return;
    }
    
    // Save response
    responses.push({
        questionId: questions[currentQuestionIndex].id,
        type: 'text',
        content: textAnswer.value
    });
    
    updateResponsesCount();
    markQuestionCompleted(currentQuestionIndex);
    
    // Enable submit button
    document.getElementById('submitBtn').disabled = false;
    
    // Close modal
    closeTextModal();
    
    // Move to next question
    if (currentQuestionIndex < questions.length - 1) {
        loadQuestion(currentQuestionIndex + 1);
    }
}

// ============================================
// QUESTIONS
// ============================================

function populateQuestionsList() {
    const qsList = document.getElementById('qsList');
    if (!qsList) return;
    
    qsList.innerHTML = questions.map((q, index) => `
        <div class="q-item" data-index="${index}">
            <span class="q-number">${index + 1}</span>
            <span class="q-text">${q.text}</span>
            <span class="q-status"></span>
        </div>
    `).join('');
    
    // Add click handlers
    qsList.querySelectorAll('.q-item').forEach(item => {
        item.addEventListener('click', () => {
            loadQuestion(parseInt(item.dataset.index));
            toggleQuestionsSidebar();
        });
    });
    
    // Mark first question as current
    qsList.querySelector('.q-item')?.classList.add('current');
}

function loadQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    
    currentQuestionIndex = index;
    
    // Update question display
    document.getElementById('questionText').textContent = questions[index].text;
    document.getElementById('currentQNum').textContent = index + 1;
    document.getElementById('totalQNum').textContent = questions.length;
    
    // Update questions list
    document.querySelectorAll('.q-item').forEach((item, i) => {
        item.classList.toggle('current', i === index);
    });
}

function markQuestionCompleted(index) {
    const qItem = document.querySelector(`.q-item[data-index="${index}"]`);
    if (qItem) {
        qItem.classList.add('completed');
        qItem.querySelector('.q-status').textContent = '✓';
    }
}

function toggleQuestionsSidebar() {
    document.getElementById('questionsSidebar').classList.toggle('active');
}

function updateResponsesCount() {
    document.getElementById('responsesCount').textContent = responses.length;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function copyRoomCode() {
    const codeInput = document.querySelector('.room-code input');
    if (codeInput) {
        navigator.clipboard.writeText(codeInput.value).then(() => {
            alert('Room code copied to clipboard!');
        });
    }
}

function disconnectInterview() {
    if (confirm('Are you sure you want to disconnect from the interview?')) {
        // Stop all timers
        if (interviewTimer) clearInterval(interviewTimer);
        if (recordingInterval) clearInterval(recordingInterval);
        
        // Stop media
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Redirect or show message
        alert('You have disconnected from the interview.');
        window.location.reload();
    }
}

// ============================================
// THEME TOGGLE (Dark / Light Mode)
// ============================================

(function initTheme() {
    const saved = localStorage.getItem('airoom-theme');
    if (saved === 'light') applyLight();
})();

function applyLight() {
    document.body.classList.add('light-mode');
    const icon  = document.getElementById('toggleIcon');
    const label = document.getElementById('toggleLabel');
    if (icon)  icon.textContent  = '🌙';
    if (label) label.textContent = 'Dark Mode';
}

function applyDark() {
    document.body.classList.remove('light-mode');
    const icon  = document.getElementById('toggleIcon');
    const label = document.getElementById('toggleLabel');
    if (icon)  icon.textContent  = '☀️';
    if (label) label.textContent = 'Light Mode';
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    // Restore saved preference
    if (localStorage.getItem('airoom-theme') === 'light') applyLight();

    btn.addEventListener('click', () => {
        const isLight = document.body.classList.contains('light-mode');
        if (isLight) {
            applyDark();
            localStorage.setItem('airoom-theme', 'dark');
        } else {
            applyLight();
            localStorage.setItem('airoom-theme', 'light');
        }
    });
});
