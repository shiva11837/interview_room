import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io } from 'socket.io-client';
import { interviewsAPI, questionsAPI } from '../services/api';
import iv from '../styles/interview.module.css';
import VideoRecorder from '../components/VideoRecorder';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const DEFAULT_QUESTIONS = [
  { category: 'Technical', text: 'Tell me about your experience with cloud architecture and how you have used it to solve scalability challenges.' },
  { category: 'Leadership', text: 'Describe a challenging project you led recently. What was your approach and what did you learn from the outcome?' },
  { category: 'Problem Solving', text: 'Walk me through how you would debug a production issue that only occurs under heavy load.' },
];

const QUESTION_TIME_LIMIT = 120; // seconds per question

export default function Interview() {
  const router = useRouter();
  const { id } = router.query;

  // Camera & audio
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const frameIntervalRef = useRef(null);

  // WebRTC for live mode
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);

  // Interview data
  const [interviewId, setInterviewId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  // Timer & Progress
  const [interviewTime, setInterviewTime] = useState(0);
  const [questionTime, setQuestionTime] = useState(QUESTION_TIME_LIMIT);

  // Timer persistence: load from localStorage
  useEffect(() => {
    if (id && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`interview_timer_${id}`);
      if (stored && !isNaN(stored)) {
        setInterviewTime(parseInt(stored, 10));
      }
    }
  }, [id]);

  // AI speaking
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const synthRef = useRef(null);

  // Candidate speaking
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);

  // Socket
  const [socket, setSocket] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);

  // MediaRecorder for recording
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // AI info banner
  const [showAiBanner, setShowAiBanner] = useState(true);

  // Gate: AI voice/timers only start after candidate clicks "Start Interview"
  const [interviewStarted, setInterviewStarted] = useState(false);

  // Admin finish interview confirmation
  const [finishConfirm, setFinishConfirm] = useState(false);

  // Interview mode & scheduling
  const [interviewDetails, setInterviewDetails] = useState(null);
  const [tooEarly, setTooEarly] = useState(false);
  const [countdown, setCountdown] = useState('');
  
  // Custom Modal States from interviewer finishing
  const [adminEndedInterview, setAdminEndedInterview] = useState(false);
  const [adminEndedSeconds, setAdminEndedSeconds] = useState(60);

  // ===== MEDIA CONTROLS STATE =====
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);

  const userName = typeof window !== 'undefined' ? (localStorage.getItem('userName') || 'Candidate') : 'Candidate';
  const userId = typeof window !== 'undefined' ? (localStorage.getItem('userId') || '') : '';
  const userRole = typeof window !== 'undefined' ? (localStorage.getItem('role') || 'candidate') : 'candidate';

  const [proctorWarning, setProctorWarning] = useState(null);

  const initialized = useRef(false);

  // Tab switching / application shifting penalty detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && userRole === 'candidate') {
        if (socket && typeof socket.emit === 'function') {
          socket.emit('tab_switched');
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [socket, userRole]);

  // Determine live mode (used in effects and JSX)
  // True when admin set the interview to live/admin mode
  const isLiveMode = interviewDetails && interviewDetails.is_ai_interview === 0;

  // ===== INIT EFFECT =====
  useEffect(() => {
    let isActive = true;
    let initialStream = null;
    let sessionSocket = null; // local ref for this session's socket

    if (!router.isReady) return;
    if (initialized.current) return;
    initialized.current = true;

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.push('/login'); return; }

    // Capture roomId into a stable local variable for all async callbacks
    const roomId = id || 'demo-interview';

    initInterview();

    // ===== WebRTC helpers =====
    const iceConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    // ICE candidate buffer — holds candidates that arrive before remote description is set
    let iceCandidateBuffer = [];
    let remoteDescSet = false;

    const flushIceCandidates = async (pc) => {
      for (const c of iceCandidateBuffer) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn('ICE flush err:', e); }
      }
      iceCandidateBuffer = [];
    };

    const closePeer = () => {
      if (peerRef.current) {
        peerRef.current.ontrack = null;
        peerRef.current.onicecandidate = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }
      remoteDescSet = false;
      iceCandidateBuffer = [];
    };

    const makePeer = (stream, s) => {
      closePeer();
      const pc = new RTCPeerConnection(iceConfig);
      peerRef.current = pc;

      // Add all local tracks
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // When we get the remote stream — show it
      pc.ontrack = (e) => {
        console.log('[WebRTC] ontrack — remote stream received');
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
          setRemoteConnected(true);
        }
      };

      // Relay ICE candidates to the other side
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[WebRTC] sending ICE candidate');
          s.emit('webrtc_signal', { interview_id: roomId, signal: { type: 'candidate', candidate: e.candidate } });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') setRemoteConnected(true);
        if (pc.connectionState === 'failed') {
          console.warn('[WebRTC] connection failed — attempting ICE restart');
          if (pc === peerRef.current) pc.restartIce();
        }
      };

      return pc;
    };

    // ===== Camera + Audio =====
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!isActive) { stream.getTracks().forEach(t => t.stop()); return; }

        initialStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Initial play failed:', e));
        }

        // Speaking detection
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;
        detectSpeaking();

        // Recording
        try {
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
          recordedChunksRef.current = [];
          recorder.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data); };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch (recErr) { console.warn('MediaRecorder not supported:', recErr); }

        // ===== Socket — always create a FRESH connection per session =====
        // (The module singleton gets killed by disconnectSocket() on cleanup,
        //  causing silent failures on subsequent visits.)
        const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8001';
        const s = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });
        sessionSocket = s;  // store for cleanup
        setSocket(s);

        const emitJoin = () => {
          console.log('[Socket] emitting join_interview, room:', roomId, 'role:', userRole);
          s.emit('join_interview', { interview_id: roomId, role: userRole, name: userName });
        };

        s.on('connect', () => {
          console.log('[Socket] connected, sid:', s.id);
          emitJoin();
        });

        s.on('connect_error', (err) => {
          console.error('[Socket] connection error:', err.message);
        });

        // Start connecting
        s.connect();

        // ===== participant_joined: WE were already in the room, THEY just joined =====
        // WE become the OFFERER
        s.on('participant_joined', async (data) => {
          if (!isActive) return;
          console.log('[Socket] participant_joined — we are the offerer', data);

          const pc = makePeer(streamRef.current, s);

          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log('[WebRTC] sending offer');
            s.emit('webrtc_signal', { interview_id: roomId, signal: { type: 'offer', sdp: pc.localDescription } });
          } catch (err) {
            console.error('[WebRTC] offer creation failed:', err);
          }
        });

        // ===== AI Real-Time Detections =====
        s.on('ai_detection_result', (data) => {
          if (!isActive) return;
          // Silently log/process detection results in background without affecting UI
          console.log('[AI Detection]', data);
          
          // Example: Check if a phone is detected or face is missing
          if (data.detections) {
            const hasPhone = data.detections.some(d => d.label === 'phone');
            const hasFace = data.detections.some(d => d.label === 'face');
            const faceCount = data.detections.filter(d => d.label === 'face').length;
            
            if (hasPhone) console.warn('⚠️ AI ALERT: Mobile phone detected');
            if (!hasFace) console.warn('⚠️ AI ALERT: No face detected in frame');
            if (faceCount > 1) console.warn(`⚠️ AI ALERT: Multiple faces detected (${faceCount})`);
          }
        });

        // ===== PROCTORING SYSTEM ALERTS =====
        s.on('proctoring_event', (eventData) => {
          if (!isActive || userRole === 'admin') return;

          if (eventData.type === 'WARNING') {
            setProctorWarning(eventData.message);
            setTimeout(() => setProctorWarning(null), 5000);
          } else if (eventData.type === 'TERMINATE') {
            setProctorWarning(`🚫 INTERVIEW TERMINATED: ${eventData.message}`);
            
            // Cleanup and End
            window.speechSynthesis.cancel();
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            if (streamRef.current) {
               streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (videoRef.current) {
               videoRef.current.srcObject = null;
            }
            
            const finalId = id || 'demo-interview';
            if (typeof window !== 'undefined') {
              localStorage.removeItem(`interview_timer_${finalId}`);
            }
            
            setTimeout(() => {
              router.push('/dashboard');
            }, 5000);
          }
        });

        // ===== webrtc_signal: relay messages (offer / answer / ICE) =====
        s.on('webrtc_signal', async (data) => {
          if (!isActive) return;
          const signal = data.signal;
          if (!signal) return;
          console.log('[WebRTC] received signal type:', signal.type);

          if (signal.type === 'offer') {
            // WE are the ANSWERER
            const pc = makePeer(streamRef.current, s);

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              remoteDescSet = true;
              await flushIceCandidates(pc);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log('[WebRTC] sending answer');
              s.emit('webrtc_signal', { interview_id: roomId, signal: { type: 'answer', sdp: pc.localDescription } });
            } catch (err) {
              console.error('[WebRTC] answer creation failed:', err);
            }

          } else if (signal.type === 'answer') {
            if (!peerRef.current) return;
            try {
              await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              remoteDescSet = true;
              await flushIceCandidates(peerRef.current);
              console.log('[WebRTC] remote description (answer) set');
            } catch (err) {
              console.error('[WebRTC] setRemoteDescription (answer) failed:', err);
            }

          } else if (signal.type === 'candidate') {
            if (!peerRef.current) return;
            if (remoteDescSet) {
              try {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } catch (err) {
                console.warn('[WebRTC] addIceCandidate failed:', err);
              }
            } else {
              // Buffer until remote desc is set
              iceCandidateBuffer.push(signal.candidate);
            }
          }
        });

        // Admin ends interview for everyone
        s.on('end_interview', () => {
          if (!isActive) return;
          setAdminEndedInterview(true);
        });
      })
      .catch((err) => {
        console.error('[Camera] getUserMedia error:', err);
      });

    return () => {
      isActive = false;
      closePeer();

      if (sessionSocket) {
        sessionSocket.off('connect');
        sessionSocket.off('connect_error');
        sessionSocket.off('participant_joined');
        sessionSocket.off('webrtc_signal');
        sessionSocket.off('end_interview');
        sessionSocket.disconnect();
        sessionSocket = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (initialStream) initialStream.getTracks().forEach(t => t.stop());
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (synthRef.current) window.speechSynthesis.cancel();
      // Allow re-initialization on the actual mount (React Strict Mode runs cleanup/re-mount)
      initialized.current = false;
    };
  }, [router.isReady, id, userRole]);



  const initInterview = async () => {
    try {
      if (id) {
        setInterviewId(id);

        try {
          const detRes = await interviewsAPI.getOne(id);
          if (detRes.data && detRes.data.id) {
            setInterviewDetails(detRes.data);
            // If admin, skip AI banner and start immediately
            if (userRole === 'admin') {
              setShowAiBanner(false);
              setInterviewStarted(true);
            }
            // If it's a live interview (admin present), skip AI banner and start immediately
            if (detRes.data.is_ai_interview === 0) {
              setShowAiBanner(false);
              setInterviewStarted(true);
            }

            // Check scheduling - candidate only
            if (userRole === 'candidate' && detRes.data.scheduled_date && detRes.data.scheduled_time) {
              const scheduledStr = `${detRes.data.scheduled_date} ${detRes.data.scheduled_time}`;
              const scheduled = new Date(scheduledStr);
              const now = new Date();
              const allowedTime = new Date(scheduled.getTime() - 5 * 60 * 1000);
              if (now < allowedTime) {
                setTooEarly(true);
              }
            }
          }
        } catch (e) { }

        try {
          const qRes = await questionsAPI.getByInterview(id);
          if (qRes.data && qRes.data.length > 0) {
            // Always use at most 3 questions
            setQuestions(qRes.data.slice(0, 3).map(q => ({ id: q.id, category: q.category, text: q.text })));
            setLoading(false);
            return;
          }
        } catch (e) { }

        setQuestions(DEFAULT_QUESTIONS.map((q, i) => ({ id: `q-${i}`, ...q })));
      } else {
        setQuestions(DEFAULT_QUESTIONS.map((q, i) => ({ id: `q-${i}`, ...q })));
      }
    } catch (e) {
      setQuestions(DEFAULT_QUESTIONS.map((q, i) => ({ id: `q-${i}`, ...q })));
    }
    setLoading(false);
  };

  // Detect candidate speaking
  const detectSpeaking = useCallback(() => {
    const check = () => {
      if (!analyserRef.current) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setCandidateSpeaking(avg > 15);
      animFrameRef.current = requestAnimationFrame(check);
    };
    check();
  }, []);

  // Attach video stream whenever videoRef mounts or layout changes
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      const targetStream = (screenSharing && screenStreamRef.current) ? screenStreamRef.current : streamRef.current;
      if (videoRef.current.srcObject !== targetStream) {
        videoRef.current.srcObject = targetStream;
        videoRef.current.play().catch(e => console.warn('Video play failed:', e));
      }
    }
  }); // Run on every render to ensure it catches if videoRef.current is attached late


  // Countdown timer for too-early arrival
  useEffect(() => {
    if (!tooEarly || !interviewDetails) return;
    const tick = () => {
      const scheduledStr = `${interviewDetails.scheduled_date} ${interviewDetails.scheduled_time}`;
      const scheduled = new Date(scheduledStr);
      const allowedTime = new Date(scheduled.getTime() - 5 * 60 * 1000);
      const now = new Date();
      const diff = allowedTime - now;
      if (diff <= 0) { setTooEarly(false); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tooEarly, interviewDetails]);

  // Question timer (count down) — AI mode only, after interview is started
  useEffect(() => {
    let interval;
    if (interviewStarted && !finished && !loading && !tooEarly) {
      interval = setInterval(() => {
        setInterviewTime(prev => {
          const newTime = prev + 1;
          if (id && typeof window !== 'undefined') {
            localStorage.setItem(`interview_timer_${id}`, newTime.toString());
          }
          return newTime;
        });
        if (isLiveMode) return; // Only AI mode uses question timer
        if (aiSpeaking) return;
        setQuestionTime(prev => {
          if (prev <= 1) {
            handleSubmitAnswer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [interviewStarted, finished, loading, tooEarly, isLiveMode, aiSpeaking, id, questions.length, currentQIndex]);

  // Admin ended interview countdown timer
  useEffect(() => {
    if (adminEndedInterview && adminEndedSeconds > 0) {
      const timer = setTimeout(() => setAdminEndedSeconds(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else if (adminEndedInterview && adminEndedSeconds === 0) {
      router.push('/dashboard');
    }
  }, [adminEndedInterview, adminEndedSeconds, router]);

  // AI speaks the question — ONLY in AI interview mode, after interview is started
  useEffect(() => {
    if (isLiveMode) return; // *** GUARD: no AI voice in admin/live room ***
    if (finished || loading || questions.length === 0 || !interviewStarted) return;
    speakQuestion(questions[currentQIndex]?.text);
  }, [currentQIndex, finished, loading, questions.length, isLiveMode, interviewStarted]);

  const speakQuestion = (text) => {
    if (!text || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setAiSpeaking(true);
    utterance.onend = () => setAiSpeaking(false);
    utterance.onerror = () => setAiSpeaking(false);
    synthRef.current = utterance;
    setTimeout(() => window.speechSynthesis.speak(utterance), 500);
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setCandidateSpeaking(false);
  };

  const stopAndUploadRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    await new Promise(r => setTimeout(r, 500));
    if (recordedChunksRef.current.length > 0 && interviewId) {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      try {
        await interviewsAPI.uploadRecording(interviewId, blob);
      } catch (e) {
        console.error('Failed to upload recording:', e);
      }
    }
  };

  const saveAnswerToBackend = async (questionIndex) => {
    const finalId = id || interviewId;
    if (!finalId || !answer.trim()) return;
    const q = questions[questionIndex];
    try {
      await interviewsAPI.saveAnswer(finalId, {
        question_id: q.id,
        question_text: q.text,
        answer_text: answer,
        candidate_id: userId,
      });
    } catch (e) {
      console.error('Failed to save answer:', e);
    }
  };

  const handleSubmitAnswer = async () => {
    await saveAnswerToBackend(currentQIndex);

    const finalId = id || interviewId;
    if (currentQIndex >= questions.length - 1) {
      setFinished(true);
      window.speechSynthesis.cancel();
      setAiSpeaking(false);
      await stopAndUploadRecording();
      stopMediaStream();
      if (finalId) {
        try {
          await interviewsAPI.complete(finalId, interviewTime);
        } catch (e) { }
      }
      return;
    }
    setAnswer('');
    setCurrentQIndex(prev => prev + 1);
    setQuestionTime(QUESTION_TIME_LIMIT); // Reset timer for the next question
  };

  const handleEndInterview = async () => {
    window.speechSynthesis.cancel();
    await stopAndUploadRecording();
    stopMediaStream();
    const finalId = id || interviewId;
    if (finalId && typeof window !== 'undefined') {
      localStorage.removeItem(`interview_timer_${finalId}`);
    }
    if (finalId) {
      try {
        await interviewsAPI.complete(finalId, interviewTime);
      } catch (e) { }
    }
    if (socket) socket.emit('end_interview', { interview_id: finalId || 'demo-interview' });
    router.push('/dashboard');
  };

  const handleDisconnectOnly = () => {
    window.speechSynthesis.cancel();
    stopMediaStream();
    const finalId = id || interviewId;
    if (socket && finalId) {
      socket.emit('leave_interview', { interview_id: finalId });
    }
    router.push('/dashboard');
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ===== REAL-TIME AI FRAME HANDLER =====
  const roomId = id || interviewId || 'demo-interview';

  useEffect(() => {
    if (interviewStarted && socket && !finished && roomId && !camOff && !isLiveMode) {
      console.log('[Debug] Starting native frame capture loop in interview.js');
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      
      frameIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !hiddenCanvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = hiddenCanvasRef.current;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        
        const targetWidth = 320;
        const targetHeight = 240;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        
        const base64Data = canvas.toDataURL('image/jpeg', 0.6);
        socket.emit('video_frame', {
          interview_id: roomId,
          frame_data: base64Data
        });
      }, 500);
    } else {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }
    
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [interviewStarted, socket, finished, roomId, camOff, isLiveMode]);

  // ===== MEDIA CONTROL HANDLERS =====

  const toggleMic = () => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach(t => {
      t.enabled = micMuted; // flip: if currently muted → enable
    });
    setMicMuted(prev => !prev);
  };

  const toggleCam = () => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach(t => {
      t.enabled = camOff; // flip: if currently off → enable
    });
    setCamOff(prev => !prev);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share, restore camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Restore camera to videoRef
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(e => console.warn('Stop share play failed:', e));
      }
      // Replace track in peer connection
      if (peerRef.current && streamRef.current) {
        const camTrack = streamRef.current.getVideoTracks()[0];
        if (camTrack) {
          const sender = peerRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(camTrack);
        }
      }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Show screen in local video
        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
        }

        // Replace video track in peer connection (live mode)
        if (peerRef.current) {
          const sender = peerRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }

        // Auto-stop when user stops sharing via browser UI
        screenTrack.onended = () => {
          setScreenSharing(false);
          screenStreamRef.current = null;
          if (videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(e => console.warn('Ended share play failed:', e));
          }
          if (peerRef.current && streamRef.current) {
            const camTrack = streamRef.current.getVideoTracks()[0];
            if (camTrack) {
              const sender = peerRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
              if (sender) sender.replaceTrack(camTrack);
            }
          }
        };

        setScreenSharing(true);
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  };

  // ===== SHARED CONTROLS BAR JSX =====
  const renderControlsBar = (showShareBtn = true) => (
    <div className={iv.controlsBar}>
      {/* Mic */}
      <button
        className={`${iv.ctrlBtn} ${micMuted ? iv.ctrlBtnMuted : iv.ctrlBtnActive}`}
        onClick={toggleMic}
        title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {micMuted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        <span>{micMuted ? 'Unmute' : 'Mute'}</span>
      </button>

      {/* Camera */}
      <button
        className={`${iv.ctrlBtn} ${camOff ? iv.ctrlBtnMuted : iv.ctrlBtnActive}`}
        onClick={toggleCam}
        title={camOff ? 'Turn Camera On' : 'Turn Camera Off'}
      >
        {camOff ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34" />
            <path d="M23 7l-7 5 7 5V7z" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        )}
        <span>{camOff ? 'Start Video' : 'Stop Video'}</span>
      </button>

      {/* Screen Share */}
      {showShareBtn && (
        <button
          className={`${iv.ctrlBtn} ${screenSharing ? iv.ctrlBtnSharing : ''}`}
          onClick={toggleScreenShare}
          title={screenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>{screenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>
      )}

      {/* End Interview / Leave */}
      <button
        className={`${iv.ctrlBtn} ${iv.ctrlBtnDanger}`}
        onClick={handleDisconnectOnly}
        title="Leave Interview"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
        </svg>
        <span>End Interview</span>
      </button>
    </div>
  );

  // ===== LOADING SCREEN =====
  if (loading) {
    return (
      <>
        <Head>
          <title>Loading Interview - AI Interview Room</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </Head>
        <div className={iv.interviewPage}>
          <div className={iv.finishedScreen}>
            <p style={{ color: '#FFF', fontSize: '16px' }}>Preparing interview...</p>
          </div>
        </div>
      </>
    );
  }

  // ===== TOO EARLY SCREEN =====
  if (tooEarly) {
    return (
      <>
        <Head>
          <title>Interview Not Started Yet</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </Head>
        <div className={iv.interviewPage}>
          <div className={iv.aiBannerOverlay}>
            <div className={iv.aiBannerCard}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <h2 className={iv.aiBannerTitle} style={{ marginTop: 16 }}>Interview Not Started Yet</h2>
              <p className={iv.aiBannerSubtitle}>
                Your interview is scheduled for <strong>{interviewDetails?.scheduled_date}</strong> at <strong>{interviewDetails?.scheduled_time}</strong>.
              </p>
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '16px 24px', marginBottom: 24 }}>
                <p style={{ color: '#F59E0B', fontSize: 13, margin: '0 0 6px', fontWeight: 600 }}>You can join in:</p>
                <p style={{ color: '#FFF', fontSize: 28, fontWeight: 800, margin: 0, fontFamily: 'monospace' }}>{countdown}</p>
              </div>
              <p className={iv.aiBannerSubtitle} style={{ fontSize: 12 }}>You may join up to 5 minutes before the scheduled time.</p>
              <button className={iv.aiBannerBtn} onClick={() => router.push('/dashboard')}>Return to Dashboard</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const currentQuestion = questions[currentQIndex];
  const progressPercent = ((questionTime / QUESTION_TIME_LIMIT) * 100);

  // ===== FINISHED SCREEN =====
  if (finished) {
    return (
      <>
        <Head>
          <title>Interview Complete - AI Interview Room</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </Head>
        <div className={iv.interviewPage}>
          <div className={iv.finishedScreen}>
            <div className={iv.finishedIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </div>
            <h2 className={iv.finishedTitle}>Interview Complete</h2>
            <p className={iv.finishedText}>All questions have been answered. Your responses are being processed.</p>
            <p className={iv.finishedTime}>Total Duration: {formatTimer(interviewTime)}</p>
            <button className={iv.finishedBtn} onClick={() => router.push('/dashboard')}>Return to Dashboard</button>
          </div>
        </div>
      </>
    );
  }

  // ===== AI INFO BANNER (AI mode only) =====
  if (showAiBanner) {
    return (
      <>
        <Head>
          <title>AI Interview - Getting Ready</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </Head>
        <div className={iv.interviewPage}>
          <div className={iv.aiBannerOverlay}>
            <div className={iv.aiBannerCard}>
              <div className={iv.aiBannerIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
              </div>
              <h2 className={iv.aiBannerTitle}>AI-Powered Interview</h2>
              <p className={iv.aiBannerSubtitle}>Your interviewer today is our AI assistant. Here&apos;s what to expect:</p>
              <ul className={iv.aiBannerList}>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                  <span>AI-generated questions will be asked one by one</span>
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>
                  <span>This interview will be <strong>fully recorded</strong></span>
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  <span>The admin can watch the recording from the dashboard</span>
                </li>
                <li>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  <span>AI will provide an intelligent analysis of your responses</span>
                </li>
              </ul>
              <button className={iv.aiBannerBtn} onClick={() => { setShowAiBanner(false); setInterviewStarted(true); }}>
                Got it, Start Interview
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const proctorToast = proctorWarning ? (
    <div style={{
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#EF4444',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontFamily: "'Inter', sans-serif",
      animation: 'toastFadeIn 0.3s ease-out'
    }}>
      <style>{`
        @keyframes toastFadeIn {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>⚠️ PROCTORING WARNING</div>
        <div style={{ fontSize: '13px', marginTop: '4px', fontWeight: 500, opacity: 0.9 }}>{proctorWarning}</div>
      </div>
    </div>
  ) : null;

  if (!currentQuestion) return null;

  // ========== ADMIN / LIVE INTERVIEW ROOM ==========
  // Shown when is_ai_interview === 0 (admin toggled to "Admin/Interviewer Interview")
  if (isLiveMode) {
    return (
      <>
        <Head>
          <title>Interview Room - Live Interview</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </Head>

        <div className={iv.interviewPage}>
          {proctorToast}
          {/* Top Bar */}
          <div className={iv.topBar}>
            <div className={iv.topLeft}>
              <div className={iv.liveBadge}>
                <span className={iv.liveDot}></span>
                LIVE
              </div>
              <span className={iv.interviewLabel}>
                {userRole === 'admin' ? 'Live Interview (Admin View)' : 'Live Interview'}
              </span>
            </div>
            <div className={iv.topCenter}>
              <div className={iv.interviewTimer}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {formatTimer(interviewTime)}
              </div>
            </div>
            <div className={iv.topRight}>
              <div className={iv.recIndicator}>
                <span className={iv.recDot}></span>
                REC
              </div>
              {userRole === 'admin' && (
                <button
                  onClick={() => setFinishConfirm(true)}
                  style={{
                    padding: '6px 14px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s',
                    fontFamily: "'Inter', sans-serif",
                    marginLeft: '10px',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#DC2626'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#EF4444'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
                  Finish
                </button>
              )}
            </div>
          </div>

          {/* Live Interview - Grid + Controls wrapper */}
          <div className={iv.liveRoomWrapper}>
            <div
              className={iv.mainLayout}
              style={userRole === 'admin' ? {} : { gridTemplateColumns: '1fr' }}
            >
              {/* Video Section with PiP */}
              <div className={iv.videoSection}>
                {/* Primary: Remote video — NOT mirrored (this is the other person) */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`${iv.videoFeed} ${iv.noMirror}`}
                />
                <div className={iv.videoNameTag}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  {userRole === 'admin' ? 'Candidate' : 'Interviewer'}
                </div>

                {/* Connecting overlay if no remote stream yet */}
                {!remoteConnected && (
                  <div className={iv.liveConnecting}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <p>Waiting for {userRole === 'admin' ? 'candidate' : 'interviewer'} to connect...</p>
                  </div>
                )}

                {/* PiP: Self video — mirrored */}
                <div className={iv.pipContainer}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={iv.pipVideo}
                  />
                  <div className={iv.pipLabel}>
                    <span className={`${iv.micIndicator} ${candidateSpeaking && !micMuted ? iv.micActive : ''}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
                    </span>
                    You
                  </div>
                  <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />
                </div>
              </div>

              {/* Right Panel: Question reference (admin only) */}
              {userRole === 'admin' && (
                <div className={iv.questionPanel}>
                  <div className={iv.qpHeader}>
                    <div className={iv.qpHeaderLeft}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                      <span className={iv.qpTitle}>Question Reference</span>
                    </div>
                    <span className={iv.qpProgress}>{questions.length} Questions</span>
                  </div>
                  <div className={iv.qpBody} style={{ overflowY: 'auto' }}>
                    {questions.map((q, idx) => (
                      <div className={iv.qCard} key={q.id || idx} style={{ marginBottom: 12 }}>
                        <div className={iv.qCardTop}>
                          <span className={iv.qCategory} data-cat={q.category}>{q.category}</span>
                          <span className={iv.qNumber}>Q{idx + 1}</span>
                        </div>
                        <p className={iv.qText}>{q.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Controls Bar — OUTSIDE the grid, always visible at bottom */}
            {renderControlsBar(true)}
          </div>

        </div>

        {/* Custom Confirmation Modal */}
        {finishConfirm && (
          <div className={iv.modalOverlay}>
            <div className={iv.modalContent}>
              <div className={iv.modalIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                </svg>
              </div>
              <h3 className={iv.modalTitle}>Finish Interview?</h3>
              <p className={iv.modalText}>
                Are you sure you want to finish this interview? This will mark it as completed and record the final completion time.
              </p>
              <div className={iv.modalActions}>
                <button 
                  className={iv.modalBtnCancel} 
                  onClick={() => setFinishConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className={iv.modalBtnConfirm} 
                  onClick={() => {
                    setFinishConfirm(false);
                    handleEndInterview();
                  }}
                >
                  Confirm Finish
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Ended Interview Modal */}
        {adminEndedInterview && (
          <div className={iv.modalOverlay}>
            <div className={iv.modalContent}>
              <div className={iv.modalIcon} style={{ background: '#ECFDF5', color: '#10B981' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <h3 className={iv.modalTitle}>Interview Completed</h3>
              <p className={iv.modalText}>The interviewer has finished and marked this interview as completed.</p>
              <p className={iv.modalText} style={{ marginTop: '8px', color: '#64748B', fontSize: '13px' }}>
                Disconnecting automatically in {adminEndedSeconds}s...
              </p>
              <div className={iv.modalActions}>
                <button 
                  className={iv.modalBtnConfirm}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => router.push('/dashboard')}
                >
                  Leave Right Now
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ========== AI INTERVIEW ROOM ==========
  // Shown when is_ai_interview === 1 (admin toggled to "AI Interview")
  return (
    <>
      <Head>
        <title>Interview Room - AI Interview</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={iv.interviewPage}>
        {proctorToast}
        {/* Top Bar */}
        <div className={iv.topBar}>
          <div className={iv.topLeft}>
            <div className={iv.liveBadge}>
              <span className={iv.liveDot}></span>
              LIVE
            </div>
            <span className={iv.interviewLabel}>Interview Room</span>
          </div>
          <div className={iv.topCenter}>
            <div className={iv.interviewTimer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {formatTimer(interviewTime)}
            </div>
          </div>
          <div className={iv.topRight}>
            <div className={iv.recIndicator}>
              <span className={iv.recDot}></span>
              REC
            </div>
          </div>
        </div>

        {/* Main Layout: 2/3 video + 1/3 questions */}
        <div className={iv.mainLayout}>
          {/* Video Section (2/3) */}
          <div className={iv.videoSection}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={iv.videoFeed}
            />
            <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />
            <div className={iv.videoNameTag}>
              <span className={`${iv.micIndicator} ${candidateSpeaking && !micMuted ? iv.micActive : ''}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
              </span>
              {userName}
            </div>

            {/* AI Speaking Popup */}
            {aiSpeaking && (
              <div className={iv.aiPopup}>
                <div className={iv.aiPopupIcon}>
                  <div className={iv.aiWave}></div>
                  <div className={iv.aiWave}></div>
                  <div className={iv.aiWave}></div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                </div>
                <div className={iv.aiPopupText}>
                  <span className={iv.aiPopupLabel}>AI Interviewer</span>
                  <span className={iv.aiPopupStatus}>Speaking...</span>
                </div>
              </div>
            )}

            {/* Controls Bar (no screen share for AI room — candidate only interview) */}
            {renderControlsBar(false)}
          </div>

          {/* Question Panel (1/3) */}
          <div className={iv.questionPanel}>
            <div className={iv.qpHeader}>
              <div className={iv.qpHeaderLeft}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                <span className={iv.qpTitle}>Interview Questions</span>
              </div>
              <span className={iv.qpProgress}>Question {currentQIndex + 1} of {questions.length}</span>
            </div>

            <div className={iv.qpBody}>
              <div className={iv.qCard}>
                <div className={iv.qCardTop}>
                  <span className={iv.qCategory} data-cat={currentQuestion.category}>{currentQuestion.category}</span>
                  <span className={iv.qNumber}>Q{currentQIndex + 1}</span>
                </div>
                <p className={iv.qText}>{currentQuestion.text}</p>
              </div>

              <div className={iv.answerArea}>
                <label className={iv.answerLabel}>Your Response</label>
                <textarea
                  className={iv.answerInput}
                  placeholder="Type your answer here..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={5}
                />
              </div>

              <button
                className={iv.submitBtn}
                onClick={handleSubmitAnswer}
                disabled={!answer.trim()}
              >
                {currentQIndex >= questions.length - 1 ? 'Submit & Finish' : 'Submit Answer'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>

              <div className={iv.qTimerArea}>
                <div className={iv.qTimerBar}>
                  <div className={iv.qTimerFill} style={{ width: `${progressPercent}%` }}></div>
                </div>
                <span className={iv.qTimerText}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  {formatTimer(questionTime)} remaining
                </span>
              </div>
            </div>

            <div className={iv.qpFooter}>
              <button className={iv.endBtn} onClick={handleEndInterview}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /></svg>
                End Interview
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Ended Interview Modal */}
      {adminEndedInterview && (
        <div className={iv.modalOverlay}>
          <div className={iv.modalContent}>
            <div className={iv.modalIcon} style={{ background: '#ECFDF5', color: '#10B981' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h3 className={iv.modalTitle}>Interview Completed</h3>
            <p className={iv.modalText}>The interviewer has finished and marked this interview as completed.</p>
            <p className={iv.modalText} style={{ marginTop: '8px', color: '#64748B', fontSize: '13px' }}>
              Disconnecting automatically in {adminEndedSeconds}s...
            </p>
            <div className={iv.modalActions}>
              <button 
                className={`${iv.modalBtnConfirm}`}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => router.push('/dashboard')}
              >
                Leave Right Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
