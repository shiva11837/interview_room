import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io } from 'socket.io-client';
import Navbar from '../components/Navbar';
import QuestionCard from '../components/QuestionCard';
import { statsAPI, interviewsAPI, candidatesAPI, profileAPI, answersAPI, questionsAPI, rolesAPI, applicationsAPI, notificationsAPI } from '../services/api';
import s from '../styles/dashboard.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8001';

const normalizeRoleWorkType = (workType = '') => {
  const normalized = workType.toLowerCase().trim();
  if (!normalized) return '';
  if (normalized.includes('hybrid')) return 'Hybrid';
  if (normalized.includes('remote')) return 'Remote';
  if (normalized.includes('office')) return 'In Office';
  return workType;
};

export default function Dashboard() {
  const router = useRouter();
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
  const [currentPage, setCurrentPage] = useState('overview');
  const [stats, setStats] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Interviews Filters & Video Modal
  const [ivStatusFilter, setIvStatusFilter] = useState(''); // '' | 'In Progress' | 'Completed'
  const [videoModalUrl, setVideoModalUrl] = useState(null);

  // Admin Progress Confirmation Modal
  const [progressConfirmModal, setProgressConfirmModal] = useState(null); // { action, appId, candidateName, roleTitle }

  const [rolesList, setRolesList] = useState([]);
  const [applications, setApplications] = useState([]);
  const [appFilter, setAppFilter] = useState('All');
  const [focusCandidateId, setFocusCandidateId] = useState(null);
  const [focusedAppDetail, setFocusedAppDetail] = useState(null);
  const [focusedProfileDetail, setFocusedProfileDetail] = useState(null);
  const [isFetchingProfileDetail, setIsFetchingProfileDetail] = useState(false);
  const [hoveredCandidateId, setHoveredCandidateId] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [roleForm, setRoleForm] = useState({ title: '', domain: '', description: '', work_type: '' });
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [applyingTo, setApplyingTo] = useState(null);
  const [applyWaitList, setApplyWaitList] = useState([]);
  const [evalExpanded, setEvalExpanded] = useState(null);
  const [evalAnswers, setEvalAnswers] = useState({});
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Profile state
  const [profile, setProfile] = useState({ full_name: '', email: '', mobile: '', skills: [], resume_url: '', profile_picture: '', role_applied: '' });
  const [profileSkillsInput, setProfileSkillsInput] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  // Candidate filter state
  const [candidateSearchTerm, setCandidateSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterSkill, setFilterSkill] = useState('');

  // Roles search & filter (candidate)
  const [roleSearch, setRoleSearch] = useState('');
  const [roleTypeFilter, setRoleTypeFilter] = useState(''); // 'Tech' | 'Non-Tech' | ''
  const [roleWorkFilter, setRoleWorkFilter] = useState(''); // 'Remote' | 'In Office' | 'Hybrid' | ''

  // Admin role edit/delete
  const [editingRole, setEditingRole] = useState(null); // { id, title, domain, description }
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Join interview modal
  const [joinModal, setJoinModal] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('idle');

  // Scheduling modal state
  const [scheduleModal, setScheduleModal] = useState(null); // { appId, candidateName, roleTitle }
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedTopic, setSchedTopic] = useState('');
  const [schedType, setSchedType] = useState('AI'); // 'AI' or 'Admin'
  const [bookedSlots, setBookedSlots] = useState([]);
  const [isScheduling, setIsScheduling] = useState(false);

  // Notifications state (candidate)
  const [notifications, setNotifications] = useState([]);
  
  // Proctoring details state
  const [proctoringModalIv, setProctoringModalIv] = useState(null);
  const [proctoringLogs, setProctoringLogs] = useState([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  
  // Track seen pending counts locally for the admin group notifications
  const [seenPendingCounts, setSeenPendingCounts] = useState({});

  // Empty state toast message 
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('role');
    const uid = localStorage.getItem('userId');
    if (!token) {
      router.push('/login');
      return;
    }
    setRole(userRole || 'candidate');
    setUserId(uid || '');

    if (uid) {
      const storedCounts = localStorage.getItem(`seenPendingCounts_${uid}`);
      if (storedCounts) {
        try {
          setSeenPendingCounts(JSON.parse(storedCounts));
        } catch (e) {}
      }
    }

    const storedTab = localStorage.getItem('dashboardTab');
    if (storedTab) {
      setCurrentPage(storedTab);
    } else if (userRole === 'candidate') {
      setCurrentPage('roles');
    } else {
      setCurrentPage('overview');
    }

    fetchData(userRole, uid);
    if (uid && userRole === 'candidate') {
      loadProfile(uid);
    }

    // Set up Socket.IO connection for real-time dashboard updates
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('[Dashboard Socket] Connected:', socket.id);
    });

    socket.on('dashboard_update', (data) => {
      console.log('[Dashboard Socket] Received update event:', data);
      fetchData(userRole, uid);
    });

    socket.on('new_notification', (data) => {
      console.log('[Dashboard Socket] Received new notification:', data);
      // Silently refresh dashboard data to get the new notification
      fetchData(userRole, uid);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (scheduleModal && schedDate) {
      interviewsAPI.getBookedSlots(schedDate)
        .then(res => setBookedSlots(res.data.booked_slots || []))
        .catch(() => setBookedSlots([]));
    }
  }, [scheduleModal, schedDate]);

  const fetchData = async (userRole, uid) => {
    try {
      const [statsRes, interviewsRes, rolesRes, appsRes] = await Promise.all([
        statsAPI.get(),
        userRole === 'candidate' && uid
          ? interviewsAPI.getForCandidate(uid)
          : interviewsAPI.getAll(),
        rolesAPI.getAll(userRole === 'candidate'),
        userRole === 'candidate' && uid
          ? applicationsAPI.getForCandidate(uid)
          : applicationsAPI.getAll()
      ]);
      setStats(statsRes.data);
      setInterviews(interviewsRes.data || []);
      setRolesList(rolesRes.data || []);
      setApplications(appsRes.data || []);
      if (userRole === 'admin') {
        try {
          const candidatesRes = await candidatesAPI.getAll();
          setCandidates(candidatesRes.data || []);
        } catch (e) { }
      }
      // Fetch notifications for both admin and candidates
      if (uid) {
        try {
          const notifsRes = await notificationsAPI.getForUser(uid);
          setNotifications(notifsRes.data || []);
        } catch (e) { }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
    setLoading(false);
  };

  const loadProfile = async (uid) => {
    try {
      const res = await profileAPI.get(uid);
      if (res.data && !res.data.error) {
        setProfile(res.data);
        setProfileSkillsInput((res.data.skills || []).join(', '));
      }
    } catch (e) { }
  };

  const handleViewProctoringDetails = async (iv) => {
    setProctoringModalIv(iv);
    setIsFetchingLogs(true);
    setProctoringLogs([]);
    try {
      const res = await interviewsAPI.getProctoringLogs(iv.id);
      setProctoringLogs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch proctoring logs:', err);
      showToast('Failed to load proctoring details.');
    }
    setIsFetchingLogs(false);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    localStorage.setItem('dashboardTab', page);
    setHoveredCandidateId(null);
  };

  const getStatusStyle = (status) => {
    const map = {
      'Scheduled': { bg: '#E0F7FA', color: '#00838F', border: '#80DEEA' },
      'In Progress': { bg: '#E0F7FA', color: '#00838F', border: '#00A3E0' },
      'Completed': { bg: '#E8F5E9', color: '#2E7D32', border: '#81C784' },
      'Pending Review': { bg: '#FFF3E0', color: '#E65100', border: '#FFB74D' },
    };
    return map[status] || { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
  };

  const getStatusIcon = (status) => {
    if (status === 'Scheduled') return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    );
    if (status === 'In Progress') return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
    );
    if (status === 'Completed') return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
    );
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    );
  };

  /* ===== OVERVIEW ===== */
  const renderOverview = () => (
    <div className={s.dashContent}>
      <h1 className={s.pageTitle}>Dashboard Overview</h1>
      <p className={s.pageSubtitle}>Track your interview activity and hiring performance</p>
      <div className={s.statsRow}>
        {[
          { label: 'Total Interviews', value: stats?.total_interviews || 0, icon: 'calendar' },
          { label: 'Active Candidates', value: stats?.active_candidates || 0, icon: 'users' },
          { label: 'Completed', value: stats?.completed_this_month || 0, icon: 'check' },
          { label: 'Avg. Interview Time', value: stats?.avg_interview_time ? `${stats.avg_interview_time}m` : '--', icon: 'clock' },
        ].map((st, i) => (
          <div className={s.statCard} key={i}>
            <div className={s.statTop}>
              <div className={s.statIconWrap}>
                {st.icon === 'calendar' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                {st.icon === 'users' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
                {st.icon === 'check' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
                {st.icon === 'clock' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              </div>
            </div>
            <div className={s.statLabel}>{st.label}</div>
            <div className={s.statValue}>{st.value}</div>
          </div>
        ))}
      </div>
      {/* Recent Interviews */}
      {interviews.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 className={s.sectionTitle}>Recent Interviews</h2>
          <div className={s.ivGrid}>
            {interviews.slice(0, 4).map((iv, i) => {
              const st = getStatusStyle(iv.status);
              return (
                <div className={s.ivCard} key={iv.id || i}>
                  <div className={s.ivCardTop}>
                    <div className={s.ivAvatar}>
                      {iv.profile_picture ? (
                        <img src={`${API_URL}${iv.profile_picture}`} alt={iv.candidate_name || 'Candidate'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      )}
                    </div>
                    <div className={s.ivMeta}>
                      <h4 className={s.ivName}>{iv.candidate_name || 'Candidate'}</h4>
                      <span className={s.ivRole}>{iv.role_title}</span>
                    </div>
                    <div className={s.ivStatus} style={{ background: st.bg, color: st.color, borderColor: st.border }}>
                      {getStatusIcon(iv.status)}
                      {iv.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  /* ===== INTERVIEW JOIN MODAL ===== */
  const requestPermissions = async (iv) => {
    setPermissionStatus('requesting');
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPermissionStatus('granted');
      setTimeout(() => {
        setJoinModal(null);
        setPermissionStatus('idle');
        router.push(`/interview?id=${iv.id}`);
      }, 800);
    } catch (err) {
      setPermissionStatus('denied');
    }
  };

  const renderJoinModal = () => {
    if (!joinModal) return null;
    return (
      <div className={s.modalOverlay} onClick={() => { setJoinModal(null); setPermissionStatus('idle'); }}>
        <div className={s.modalBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={s.modalTitle}>Join Interview</h3>
          <div className={s.modalBody}>
            <div className={s.modalRow}>
              <span className={s.modalLabel}>Position:</span>
              <span className={s.modalValue}>{joinModal.role_title}</span>
            </div>
            <div className={s.modalRow}>
              <span className={s.modalLabel}>Domain:</span>
              <span className={s.modalValue}>{joinModal.domain}</span>
            </div>
            {joinModal.scheduled_date && (
              <div className={s.modalRow}>
                <span className={s.modalLabel}>Scheduled:</span>
                <span className={s.modalValue}>{joinModal.scheduled_date} at {joinModal.scheduled_time}</span>
              </div>
            )}
            <p className={s.modalConfirmText}>
              You are about to join this interview room. Camera and microphone access will be requested.
            </p>
            {permissionStatus === 'denied' && (
              <p className={s.modalError}>Camera/microphone permission denied. Please enable permissions and try again.</p>
            )}
          </div>
          <div className={s.modalActions}>
            <button className={s.modalCancelBtn} onClick={() => { setJoinModal(null); setPermissionStatus('idle'); }}>Cancel</button>
            <button
              className={s.modalJoinBtn}
              onClick={() => requestPermissions(joinModal)}
              disabled={permissionStatus === 'requesting' || permissionStatus === 'granted'}
            >
              {permissionStatus === 'requesting' ? 'Requesting Permissions...' : permissionStatus === 'granted' ? 'Joining...' : 'Confirm and Join'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ===== INTERVIEW CARDS ===== */
  const renderInterviews = () => {
    let finalInterviews = interviews;
    if (ivStatusFilter) {
      if (ivStatusFilter === 'In Progress') {
        finalInterviews = finalInterviews.filter(iv => iv.status === 'In Progress' || iv.status === 'Ongoing' || iv.status === 'Scheduled');
      } else if (ivStatusFilter === 'Completed') {
        finalInterviews = finalInterviews.filter(iv => iv.status === 'Completed');
      }
    }

    finalInterviews = [...finalInterviews].sort((a, b) => {
      const rank = {
        'In Progress': 1,
        'Ongoing': 1,
        'Scheduled': 2,
        'Pending Review': 3,
        'Completed': 4
      };

      const rankA = rank[a.status] || 5;
      const rankB = rank[b.status] || 5;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // If ranks are the same, order chronologically by scheduled date and time
      // Parse dates consistently. If missing, put them at the end.
      const parseDateTime = (d, t) => {
        if (!d) return Number.MAX_SAFE_INTEGER;
        // Basic fallback for unformatted time
        const timeStr = t || '00:00';
        const jsDate = new Date(`${d}T${timeStr}`);
        return isNaN(jsDate.getTime()) ? Number.MAX_SAFE_INTEGER : jsDate.getTime();
      };

      // Since scheduled_time format is like "03:00 PM", it won't be parsed properly by standard Date("YYYY-MM-DDTHH:MM PM").
      // We must convert 12h format to 24h format for accurate parsing.
      const formatTime24 = (time12h) => {
        if (!time12h) return "00:00";
        const [time, modifier] = time12h.split(' ');
        if (!time || !modifier) return time12h; // return as is if no modifier
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM' || modifier === 'pm') hours = parseInt(hours, 10) + 12;
        return `${hours}:${minutes}`;
      };

      // For completed interviews, sort by completed_at timestamp
      if (rankA === 4 && rankB === 4) {
        const compA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const compB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return compB - compA; // Most recently completed first
      }

      const dtA = parseDateTime(a.scheduled_date, formatTime24(a.scheduled_time));
      const dtB = parseDateTime(b.scheduled_date, formatTime24(b.scheduled_time));

      return dtA - dtB; // Earliest upcoming first
    });

    return (
      <div className={s.dashContent}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 className={s.pageTitle}>{role === 'admin' ? 'Interview Cards' : 'My Interviews'}</h1>
            <p className={s.pageSubtitle}>{role === 'admin' ? 'All scheduled and completed interviews' : 'Your interview sessions'}</p>
          </div>
          <div className={s.rolesFilters} style={{ marginBottom: 20 }}>
            {['All', 'In Progress', 'Completed'].map(f => (
              <button key={f} className={ivStatusFilter === (f === 'All' ? '' : f) ? s.filterChipActive : s.filterChip} onClick={() => setIvStatusFilter(f === 'All' ? '' : f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {finalInterviews.length === 0 ? (
          <div className={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            <p className={s.emptyStateText}>No interviews match your filter.</p>
          </div>
        ) : (
          <div className={s.ivGrid}>
            {finalInterviews.map((interview, i) => {
              const st = getStatusStyle(interview.status);
              const isAi = interview.is_ai_interview === 1 || interview.is_ai_interview === undefined;
              const hasRecording = !!interview.recording_url;

              return (
                <div className={s.ivCardNew} key={interview.id || i}>
                  {/* Gradient top border */}
                  <div className={s.ivCardGradientTop}></div>

                  {/* Header: Avatar + Title + Status */}
                  <div className={s.ivCardHeader}>
                    <div className={s.ivAvatarLg}>
                      <div className={s.ivAvatarLgInner}>
                        {interview.profile_picture ? (
                          <img src={`${API_URL}${interview.profile_picture}`} alt={interview.candidate_name || 'Candidate'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        )}
                      </div>
                      <span className={s.ivDotLg} style={{ background: '#0284C7' }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" /></svg>
                      </span>
                    </div>
                    <div className={s.ivHeaderMeta}>
                      {role === 'admin' ? (
                        <>
                          <h4 className={s.ivTitleNew}>{interview.candidate_name || 'Candidate'}</h4>
                          <span className={s.ivDomainBadge}>{interview.role_title || 'Role'}</span>
                        </>
                      ) : (
                        <>
                          <h4 className={s.ivTitleNew}>{interview.role_title}</h4>
                          <span className={s.ivDomainBadge}>{interview.domain || 'General'}</span>
                        </>
                      )}
                    </div>
                    <div className={s.ivStatusNew} data-status={interview.status} style={{ borderColor: st.border }}>
                      {getStatusIcon(interview.status)}
                      {interview.status}
                    </div>
                  </div>

                  {/* Body: Date, Time, AI badge */}
                  <div className={s.ivCardBodyNew}>
                    <div className={s.ivScheduleBlock}>
                      {interview.scheduled_date && (
                        <div className={s.ivDetailRow}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                          <span className={s.ivDetailLabel}>Date:</span>
                          <span className={s.ivDetailValue}>{interview.scheduled_date}</span>
                        </div>
                      )}
                      {interview.role_title && (
                        <div className={s.ivDetailRow}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                          <span className={s.ivDetailLabel}>Role:</span>
                          <span className={s.ivDetailValue}>{interview.role_title}</span>
                        </div>
                      )}
                      <div className={s.ivDetailRow}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <span className={s.ivDetailLabel}>Time:</span>
                        <span className={s.ivDetailValue}>
                          {interview.scheduled_time || '--'}
                          {interview.duration_minutes > 0 && <span className={s.ivDurationSep}> • {interview.duration_minutes} minutes</span>}
                          {interview.actual_duration_seconds > 0 && !interview.duration_minutes && <span className={s.ivDurationSep}> • {Math.floor(interview.actual_duration_seconds / 60)}m {interview.actual_duration_seconds % 60}s</span>}
                        </span>
                      </div>

                      {/* Completion Label */}
                      {interview.status === 'Completed' && (
                        <div className={s.ivDetailRow}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                          <span className={s.ivDetailLabel} style={{ color: '#10B981' }}>Completed:</span>
                          <span className={s.ivDetailValue} style={{ color: '#10B981', fontWeight: 600 }}>
                            {interview.completed_at ? new Date(interview.completed_at.replace(' ', 'T') + (interview.completed_at.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (interview.scheduled_date ? `${interview.scheduled_date} ${interview.scheduled_time || ''}` : 'Date captured')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Interview Mode Toggle (Admin) / Mode Indicator (Candidate) */}
                    {role === 'admin' && (
                      <div className={s.ivModeToggleRow}>
                        <span className={`${s.ivModeLabel} ${!isAi ? s.ivModeLabelActive : ''}`}>Admin</span>
                        <label className={`${s.ivToggle} ${interview.status === 'Completed' ? s.ivToggleDisabled : ''}`}>
                          <input
                            type="checkbox"
                            checked={isAi}
                            disabled={interview.status === 'Completed'}
                            onChange={async (e) => {
                              if (e.target.checked) {
                                await interviewsAPI.triggerAi(interview.id);
                                showToast('Mode set to AI Interview.');
                              } else {
                                await interviewsAPI.setLive(interview.id);
                                showToast('Mode set to Admin Interview.');
                              }
                              fetchData(role, userId);
                            }}
                          />
                          <span className={s.ivToggleSlider}></span>
                        </label>
                        <span className={`${s.ivModeLabel} ${isAi ? s.ivModeLabelActive : ''}`}>AI</span>
                        {interview.status === 'Completed' && (
                          <span className={s.ivModeLocked}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            Locked
                          </span>
                        )}
                      </div>
                    )}
                    {role === 'candidate' && (
                      <div className={isAi ? s.ivAiBadge : s.ivAdminBadge}>
                        {isAi ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                            AI Interview
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            Live Interview
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer: Action buttons */}
                  <div className={s.ivCardFooterNew}>
                    {role === 'candidate' && interview.status !== 'Completed' && (
                      <button className={s.ivJoinBtnNew} onClick={() => setJoinModal(interview)}>Join Interview</button>
                    )}
                    {role === 'admin' && (interview.status === 'Scheduled' || interview.status === 'In Progress') && (
                      <button className={s.ivJoinBtnNew} onClick={async () => {
                        if (interview.status === 'Scheduled') {
                          await interviewsAPI.updateStatus(interview.id, 'In Progress');
                        }
                        router.push(`/interview?id=${interview.id}`);
                      }}>
                        {interview.status === 'Scheduled' ? 'Start Interview' : 'Join Interview'}
                      </button>
                    )}
                    {role === 'admin' && hasRecording && (
                      <button
                        className={s.ivRecordingBtn}
                        onClick={() => setVideoModalUrl(`${API_URL}${interview.recording_url}`)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        Watch Recording
                      </button>
                    )}
                    <button className={s.ivDetailsBtnNew} onClick={() => handleViewProctoringDetails(interview)}>Details</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ===== VIDEO PLAYBACK MODAL ===== */
  const renderVideoModal = () => {
    if (!videoModalUrl) return null;
    return (
      <div className={s.videoModalOverlay} onClick={() => setVideoModalUrl(null)}>
        <div className={s.videoModalContainer} onClick={e => e.stopPropagation()}>
          <div className={s.videoModalHeader}>
            <h3 style={{ margin: 0, color: '#FFF' }}>Interview Recording</h3>
            <button className={s.videoModalClose} onClick={() => setVideoModalUrl(null)}>×</button>
          </div>
          <video id="iv-video-player" src={videoModalUrl} className={s.videoPlayerElement} controls controlsList="nodownload"></video>
          <div className={s.videoModalControls}>
            <button onClick={() => { document.getElementById('iv-video-player').currentTime -= 5; }} className={s.videoControlBtn}>-5s</button>
            <button onClick={() => {
              const v = document.getElementById('iv-video-player');
              v.paused ? v.play() : v.pause();
            }} className={s.videoControlBtnPlay}>⏯ Play / Pause</button>
            <button onClick={() => { document.getElementById('iv-video-player').currentTime += 5; }} className={s.videoControlBtn}>+5s</button>
          </div>
        </div>
      </div>
    );
  };

  const renderProctoringModal = () => {
    if (!proctoringModalIv) return null;
    return (
      <div className={s.modalOverlay} onClick={() => setProctoringModalIv(null)}>
        <div className={s.modalBox} style={{ maxWidth: '600px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
          <div className={s.modalHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className={s.modalTitle} style={{ margin: 0 }}>Proctoring Summary</h3>
            <button style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748B' }} onClick={() => setProctoringModalIv(null)}>×</button>
          </div>
          
          <div className={s.modalBody}>
            <div style={{ marginBottom: '20px', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: '#1E293B' }}>Candidate:</span>
                <span>{proctoringModalIv.candidate_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: '#1E293B' }}>Role:</span>
                <span>{proctoringModalIv.role_title}</span>
              </div>
            </div>

            <h4 style={{ marginBottom: '12px', color: '#475569' }}>Violation Logs</h4>
            
            {isFetchingLogs ? (
              <p style={{ textAlign: 'center', color: '#64748B' }}>Loading logs...</p>
            ) : proctoringLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', background: '#F1F5F9', borderRadius: '8px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" style={{ marginBottom: '8px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                <p style={{ color: '#64748B', margin: 0 }}>No violations recorded for this session.</p>
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#64748B' }}>Time</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#64748B' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#64748B' }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proctoringLogs.map((log, index) => (
                      <tr key={log.id} style={{ borderBottom: index === proctoringLogs.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px', fontSize: '13px' }}>
                          {new Date(log.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px' }}>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '11px', 
                            fontWeight: 600,
                            background: log.type === 'TERMINATE' ? '#FEE2E2' : '#FFEDD5',
                            color: log.type === 'TERMINATE' ? '#991B1B' : '#9A3412'
                          }}>
                            {log.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#334155' }}>
                          {log.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className={s.modalActions} style={{ marginTop: '24px' }}>
            <button className={s.modalJoinBtn} onClick={() => setProctoringModalIv(null)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  /* ===== CANDIDATES (admin only) ===== */
  const renderCandidates = () => {
    let filtered = candidates;
    if (candidateSearchTerm) {
      filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(candidateSearchTerm.toLowerCase()));
    }
    if (filterRole) {
      filtered = filtered.filter(c => (c.role_applied || '').toLowerCase().includes(filterRole.toLowerCase()));
    }
    if (filterSkill) {
      filtered = filtered.filter(c => (c.skills || []).some(sk => sk.toLowerCase().includes(filterSkill.toLowerCase())));
    }

    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>Candidate Profiles</h1>
        <p className={s.pageSubtitle}>View registered candidate details and profile data</p>
        <div className={s.filterBar}>
          <input className={s.filterInput} placeholder="Search by name..." value={candidateSearchTerm} onChange={(e) => setCandidateSearchTerm(e.target.value)} />
          <input className={s.filterInput} placeholder="Filter by role..." value={filterRole} onChange={(e) => setFilterRole(e.target.value)} />
          <input className={s.filterInput} placeholder="Filter by skill..." value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <p className={s.emptyStateText}>No candidates have registered yet. Candidates will appear here after they sign up.</p>
          </div>
        ) : (
          <div className={s.candGrid}>
            {filtered.map((c) => (
              <div className={s.candCard} key={c.id}>

                {/* Top Gradient Banner */}
                <div className={s.candBanner}></div>

                {/* Avatar Section overlapping banner */}
                <div className={s.candAvatarWrap}>
                  <div className={s.candAvatarInner}>
                    {c.profile_picture ? (
                      <img className={s.candAvatarImg} src={`${API_URL}${c.profile_picture}`} alt={c.name} />
                    ) : (
                      <div className={s.candAvatarPlaceholder}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      </div>
                    )}
                    <div className={s.candAvatarBadge}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" /></svg>
                    </div>
                  </div>
                </div>

                {/* Main Body */}
                <div className={s.candBody}>
                  <h4 className={s.candName}>{c.name}</h4>
                  {c.role_applied && <p className={s.candRoleTitle}>{c.role_applied}</p>}

                  {(c.location || c.experience || c.education || c.mobile) && (
                    <div className={s.candInfoList}>
                      {c.mobile && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                          <span>{c.mobile}</span>
                        </div>
                      )}
                      {c.location && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          <span>{c.location}</span>
                        </div>
                      )}
                      {c.experience && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                          <span>{c.experience}</span>
                        </div>
                      )}
                      {c.education && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                          <span>{c.education}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Key Skills */}
                  {c.skills && c.skills.length > 0 && (
                    <div className={s.candSkillsBlock}>
                      <span className={s.candSkillsTitle}>Key Skills</span>
                      <div className={s.candSkillsList}>
                        {c.skills.map((skill, j) => (
                          <span className={s.candSkillPill} key={j}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Availability Block */}
                  {c.availability && (
                    <div className={s.candAvailBlock}>
                      <strong>Availability:</strong> {c.availability === 'Both (Remote + In Office)' ? 'Remote, In Office' : c.availability}
                    </div>
                  )}

                  {/* Social / Contact Links Row */}
                  <div className={s.candSocialRow}>
                    {c.linkedin_url ? (
                      <a className={s.candSocialBtn} href={c.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                      </a>
                    ) : (
                      <button className={s.candSocialBtn} onClick={() => showToast('No data available.')} title="LinkedIn (No Data)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                      </button>
                    )}
                    {c.github_url ? (
                      <a className={s.candSocialBtn} href={c.github_url} target="_blank" rel="noopener noreferrer" title="GitHub">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                      </a>
                    ) : (
                      <button className={s.candSocialBtn} onClick={() => showToast('No data available.')} title="GitHub (No Data)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                      </button>
                    )}
                    {c.email ? (
                      <a className={s.candSocialBtn} href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(c.email)}`} target="_blank" rel="noopener noreferrer" title="Compose in Gmail">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      </a>
                    ) : (
                      <button className={s.candSocialBtn} onClick={() => showToast('No data available.')} title="Email (No Data)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      </button>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className={s.candActionRow}>
                    <button
                      className={s.candBtnSchedule}
                      onClick={() => {
                        let candidateApp = applications.find(a =>
                          (a.candidate_id === c.user_id || a.candidate_id === c.id) &&
                          (a.role_title === c.role_applied)
                        );
                        if (!candidateApp) {
                          candidateApp = applications.find(a =>
                            a.candidate_id === c.user_id || a.candidate_id === c.id
                          );
                        }

                        if (candidateApp) {
                          setScheduleModal({
                            appId: candidateApp.id,
                            candidateName: c.name || candidateApp.candidate_name,
                            roleTitle: candidateApp.role_title
                          });
                        } else {
                          // No application exists — allow direct scheduling
                          setScheduleModal({
                            appId: null,
                            candidateId: c.user_id || c.id,
                            candidateName: c.name,
                            roleTitle: c.role_applied || ''
                          });
                        }
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        const tomorrowStr = tomorrow.toISOString().split('T')[0];
                        setSchedDate(tomorrowStr);
                        setSchedTime('');
                        setSchedTopic(c.role_applied || (candidateApp ? candidateApp.role_title : '') || '');
                        setSchedType('AI');
                        setBookedSlots([]);
                      }}
                    >
                      Schedule Interview
                    </button>
                    {c.resume_url ? (
                      <a className={s.candBtnResume} href={`${API_URL}${c.resume_url}`} target="_blank" rel="noopener noreferrer">View Resume</a>
                    ) : (
                      <button className={s.candBtnResume}>View Resume</button>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ===== CANDIDATE PROFILE HANDLERS ===== */
  const handleProfileSave = async () => {
    setProfileMsg('');
    try {
      await profileAPI.update(userId, {
        full_name: profile.full_name,
        email: profile.email,
        mobile: profile.mobile,
        skills: profileSkillsInput,
        role_applied: profile.role_applied || '',
        location: profile.location || '',
        experience: profile.experience || '',
        education: profile.education || '',
        availability: profile.availability || '',
        linkedin_url: profile.linkedin_url || '',
        github_url: profile.github_url || ''
      });
      setProfileMsg('Profile saved successfully.');
      fetchData(role, userId);
    } catch (e) {
      setProfileMsg('Failed to save profile.');
    }
  };

  const handleProfileFieldChangeOrSave = (field, value) => {
    if (field === '_save') {
      handleProfileSave();
    } else if (field === '_skillsInput') {
      setProfileSkillsInput(value);
    } else {
      setProfile(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setProfileMsg('Only PDF files are accepted for resume.');
      return;
    }
    try {
      const res = await profileAPI.uploadResume(userId, file);
      if (res.data.error) {
        setProfileMsg(res.data.error);
      } else {
        setProfile(prev => ({ ...prev, resume_url: res.data.resume_url }));
        setProfileMsg('Resume uploaded successfully.');
      }
    } catch (e) {
      setProfileMsg('Failed to upload resume.');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await profileAPI.uploadPhoto(userId, file);
      setProfile(prev => ({ ...prev, profile_picture: res.data.profile_picture }));
      setProfileMsg('Profile picture updated.');
    } catch (e) {
      setProfileMsg('Failed to upload photo.');
    }
  };

  /* ===== Q&A PANEL (admin) ===== */
  const [qaQuestions, setQaQuestions] = useState([]);
  const [qaResponses, setQaResponses] = useState([]);
  const [qaLoaded, setQaLoaded] = useState(false);
  const [qaTab, setQaTab] = useState('questions'); // 'questions' | 'responses'

  const loadQaQuestions = async () => {
    if (qaLoaded) return;
    try {
      const completed = interviews.filter(iv => iv.status === 'Completed');
      const allQuestions = [];
      const allResponses = [];
      for (const iv of completed.slice(0, 5)) {
        try {
          const [qRes, aRes] = await Promise.all([
            questionsAPI.getByInterview(iv.id),
            answersAPI.getByInterview(iv.id)
          ]);
          const questions = qRes.data || [];
          const answers = aRes.data || [];
          questions.forEach((q, idx) => {
            allQuestions.push({
              id: q.id,
              category: q.category || 'General',
              difficulty: q.difficulty || 'Medium',
              text: q.text,
              asked_at: q.asked_at || null,
            });
          });
          answers.forEach((a, idx) => {
            const matchQ = questions.find(q => q.id === a.question_id) || questions[idx];
            allResponses.push({
              id: a.id,
              category: matchQ ? matchQ.category : 'General',
              questionText: matchQ ? matchQ.text : `Question ${idx + 1}`,
              answerText: a.text || '',
              score: a.score || 0,
              feedback: a.feedback || '',
            });
          });
        } catch (e) { }
      }
      setQaQuestions(allQuestions);
      setQaResponses(allResponses);
    } catch (e) { }
    setQaLoaded(true);
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Technical': { bg: '#E0F2FE', text: '#0284C7', border: '#7DD3FC' },
      'System Design': { bg: '#E0F2FE', text: '#0284C7', border: '#7DD3FC' },
      'Leadership': { bg: '#ECFDF5', text: '#059669', border: '#6EE7B7' },
      'Soft Skills': { bg: '#FFF7ED', text: '#EA580C', border: '#FDBA74' },
      'Best Practices': { bg: '#ECFDF5', text: '#059669', border: '#6EE7B7' },
      'Problem Solving': { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' },
      'Introduction': { bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
      'Experience': { bg: '#FFF1F2', text: '#E11D48', border: '#FDA4AF' },
      'Behavioral': { bg: '#FFF7ED', text: '#EA580C', border: '#FDBA74' },
      'Closing': { bg: '#F0FDF4', text: '#16A34A', border: '#86EFAC' },
    };
    return colors[category] || { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };
  };

  const getDifficultyColor = (diff) => {
    if (diff === 'Hard') return { bg: '#FEE2E2', text: '#DC2626' };
    if (diff === 'Easy') return { bg: '#ECFDF5', text: '#059669' };
    return { bg: '#FEF3C7', text: '#D97706' };
  };

  const renderQA = () => {
    if (!qaLoaded) loadQaQuestions();
    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>Question & Answer Panel</h1>
        <p className={s.pageSubtitle}>AI-generated domain-aware questions with response tracking</p>

        <div className={s.qaPanel}>
          {/* Tabs */}
          <div className={s.qaTabs}>
            <button className={`${s.qaTab} ${qaTab === 'questions' ? s.qaTabActive : ''}`} onClick={() => setQaTab('questions')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
              AI Questions
            </button>
            <button className={`${s.qaTab} ${qaTab === 'responses' ? s.qaTabActive : ''}`} onClick={() => setQaTab('responses')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Responses
            </button>
          </div>

          {/* AI Questions Tab */}
          {qaTab === 'questions' && (
            <div className={s.qaContent}>
              {qaQuestions.length === 0 ? (
                <div className={s.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <p className={s.emptyStateText}>No questions generated yet.</p>
                </div>
              ) : (
                <>
                  {qaQuestions.map((q, i) => {
                    const catColor = getCategoryColor(q.category);
                    const diffColor = getDifficultyColor(q.difficulty);
                    return (
                      <div className={s.qaQuestionCard} key={q.id || i}>
                        <div className={s.qaQuestionHeader}>
                          <div className={s.qaQuestionBadges}>
                            <span className={s.qaBadge} style={{ background: catColor.bg, color: catColor.text, border: `1px solid ${catColor.border}` }}>{q.category}</span>
                            {q.difficulty && <span className={s.qaBadge} style={{ background: diffColor.bg, color: diffColor.text }}>{q.difficulty}</span>}
                          </div>
                          <div className={s.qaQuestionActions}>
                            <button className={s.qaActionBtn} title="Thumbs up">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
                            </button>
                            <button className={s.qaActionBtn} title="Flag">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                            </button>
                          </div>
                        </div>
                        <p className={s.qaQuestionText}>{q.text}</p>
                        {q.asked_at && (
                          <span className={s.qaQuestionTime}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            Asked at {q.asked_at}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <button className={s.qaGenerateBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                    Generate Next Question
                  </button>
                </>
              )}
            </div>
          )}

          {/* Responses Tab */}
          {qaTab === 'responses' && (
            <div className={s.qaContent}>
              {qaResponses.length === 0 ? (
                <div className={s.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <p className={s.emptyStateText}>No responses yet. Responses will appear after candidates complete interviews.</p>
                </div>
              ) : (
                qaResponses.map((r, i) => {
                  const catColor = getCategoryColor(r.category);
                  const scoreVal = Math.round((r.score / 100) * 10 * 10) / 10;
                  return (
                    <div key={r.id || i}>
                      <div className={s.qaResponseHeader}>
                        <span className={s.qaResponseQNum}>Q{i + 1}</span>
                        <span className={s.qaResponseCategory}>{r.category}</span>
                        <p className={s.qaResponseQuestion}>{r.questionText}</p>
                      </div>
                      <div className={s.qaResponseBody}>
                        <div className={s.qaResponseLabelRow}>
                          <span className={s.qaResponseLabel}>Candidate Response</span>
                          <span className={s.qaAiScore}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                            AI Score: {scoreVal}/10
                          </span>
                        </div>
                        <p className={s.qaResponseText}>{r.answerText || 'No answer provided.'}</p>
                        <div className={s.qaResponseActions}>
                          <button className={s.qaGoodBtn}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
                            Good
                          </button>
                          <button className={s.qaNeedsWorkBtn}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
                            Needs Work
                          </button>
                          <button className={s.qaAddNoteBtn}>Add Note</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Ready to Record footer */}
          <div className={s.qaReadyFooter}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            <div>
              <strong>Ready to Record</strong>
              <span style={{ display: 'block', fontSize: 12, color: '#9CA3AF' }}>AI analysis will be provided automatically</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ===== PROGRESS (candidate only) ===== */
  const [reviewInterviewId, setReviewInterviewId] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const handleReviewResponses = async (interviewId) => {
    if (reviewInterviewId === interviewId) {
      setReviewInterviewId(null);
      setReviewData(null);
      return;
    }
    setReviewInterviewId(interviewId);
    setReviewLoading(true);
    try {
      const [qRes, aRes] = await Promise.all([
        questionsAPI.getByInterview(interviewId),
        answersAPI.getByInterview(interviewId)
      ]);
      const questions = qRes.data || [];
      const answers = aRes.data || [];
      const items = questions.map((q, idx) => {
        const ans = answers.find(a => a.question_id === q.id) || answers[idx];
        return {
          questionText: q.text,
          category: q.category || 'General',
          answerText: ans ? ans.text : '',
          score: ans ? (ans.score || 0) : 0,
          feedback: ans ? (ans.feedback || '') : '',
        };
      });
      const avgScore = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length) : 0;
      setReviewData({ items, avgScore });
    } catch (e) {
      setReviewData({ items: [], avgScore: 0 });
    }
    setReviewLoading(false);
  };

  const renderProgress = () => {
    const completedCount = interviews.filter(iv => iv.status === 'Completed').length;
    const totalCount = interviews.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>My Progress</h1>
        <p className={s.pageSubtitle}>Track your interview history and performance</p>
        <div className={s.progCard}>
          <div className={s.progHeader}>
            <div className={s.progHeaderLeft}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <h3 className={s.progHeaderTitle}>Interview Progress</h3>
            </div>
            <span className={s.progStage}>{completedCount} of {totalCount} completed</span>
          </div>
          <div className={s.progBarWrap}>
            <div className={s.progBar}>
              <div className={s.progBarFill} style={{ width: `${progressPct}%` }}></div>
            </div>
            <div className={s.progBarLabels}>
              <span>{progressPct}% Complete</span>
              <span>{totalCount - completedCount} remaining</span>
            </div>
          </div>
          {interviews.length === 0 ? (
            <div className={s.emptyState} style={{ padding: '24px 0' }}>
              <p className={s.emptyStateText}>No interviews completed yet. Your progress will be tracked here.</p>
            </div>
          ) : (
            <div className={s.progTimeline}>
              {interviews.map((iv, i) => (
                <div className={s.tlItem} key={iv.id || i}>
                  <div className={s.tlLeft}>
                    <div className={iv.status === 'Completed' ? s.tlDone : iv.status === 'In Progress' ? s.tlCurrent : s.tlPending}>
                      {iv.status === 'Completed' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>
                    {i < interviews.length - 1 && <div className={iv.status === 'Completed' ? s.tlLineDone : s.tlLine}></div>}
                  </div>
                  <div className={iv.status === 'In Progress' ? s.tlActive : s.tlContent}>
                    <div className={s.tlContentHead}>
                      <h4 className={s.tlContentTitle}>{iv.role_title || 'Interview'}</h4>
                      <span className={iv.status === 'Completed' ? s.tlBadgeDone : iv.status === 'In Progress' ? s.tlBadgeCurrent : s.tlBadgePending}>{iv.status}</span>
                    </div>
                    <p className={s.tlDesc}>{iv.domain || 'General'}</p>
                    {iv.actual_duration_seconds > 0 && (
                      <span className={s.tlTime}>Duration: {Math.floor(iv.actual_duration_seconds / 60)}m {iv.actual_duration_seconds % 60}s</span>
                    )}
                    {iv.status === 'Completed' && (
                      <button className={s.reviewResponsesBtn} onClick={() => handleReviewResponses(iv.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        {reviewInterviewId === iv.id ? 'Hide Responses' : 'Review Responses'}
                      </button>
                    )}
                    {/* Review Responses Panel */}
                    {reviewInterviewId === iv.id && (
                      <div className={s.reviewPanel}>
                        {reviewLoading ? (
                          <p style={{ color: '#9CA3AF', fontSize: 14 }}>Loading responses...</p>
                        ) : reviewData && reviewData.items.length > 0 ? (
                          <>
                            <div className={s.reviewSummary}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                              <span>Overall Score: <strong>{reviewData.avgScore}%</strong> ({reviewData.items.length} questions)</span>
                            </div>
                            {reviewData.items.map((item, idx) => (
                              <div className={s.reviewItem} key={idx}>
                                <div className={s.reviewQuestionRow}>
                                  <span className={s.reviewQNum}>Q{idx + 1}</span>
                                  <span className={s.reviewCategory}>{item.category}</span>
                                  <span className={s.reviewScore} style={{ color: item.score >= 70 ? '#059669' : item.score >= 40 ? '#D97706' : '#DC2626' }}>{Math.round(item.score)}%</span>
                                </div>
                                <p className={s.reviewQuestionText}>{item.questionText}</p>
                                <div className={s.reviewAnswerBlock}>
                                  <span className={s.reviewAnswerLabel}>Your Answer</span>
                                  <p className={s.reviewAnswerText}>{item.answerText || 'No answer provided.'}</p>
                                </div>
                                {item.feedback && (
                                  <div className={s.reviewFeedback}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                                    <span>AI Feedback: {item.feedback}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </>
                        ) : (
                          <p style={{ color: '#9CA3AF', fontSize: 14 }}>No responses found for this interview.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };


  /* ===== ADMIN EVALUATION ===== */
  const [evalQuestions, setEvalQuestions] = useState({});

  const toggleEvalExpanded = async (interviewId) => {
    console.log('[Dashboard] Toggling evaluation for ID:', interviewId);
    if (evalExpanded === interviewId) {
      setEvalExpanded(null);
      return;
    }
    setEvalExpanded(interviewId);

    // Fetch answers and questions if not already cached
    if (!evalAnswers[interviewId]) {
      try {
        console.log('[Dashboard] Fetching data for interview:', interviewId);
        const [ansRes, qRes] = await Promise.all([
          answersAPI.getByInterview(interviewId),
          questionsAPI.getByInterview(interviewId)
        ]);
        console.log('[Dashboard] Answers:', ansRes.data);
        console.log('[Dashboard] Questions:', qRes.data);
        setEvalAnswers(prev => ({ ...prev, [interviewId]: ansRes.data || [] }));
        setEvalQuestions(prev => ({ ...prev, [interviewId]: qRes.data || [] }));
      } catch (err) {
        console.error('[Dashboard] Error fetching evaluation data:', err);
        setEvalAnswers(prev => ({ ...prev, [interviewId]: [] }));
        setEvalQuestions(prev => ({ ...prev, [interviewId]: [] }));
      }
    }
  };

  const handleDirectDecision = async (decision, ev, targetAppId) => {
    let appId = targetAppId;
    
    if (!appId) {
      const matchedRole = rolesList.find(r => (r.title || '').toLowerCase() === (ev.role_title || '').toLowerCase());
      if (matchedRole) {
        try {
          const res = await applicationsAPI.apply({ candidate_id: ev.candidate_id, role_id: matchedRole.id });
          appId = res.data.id;
        } catch (e) {
          showToast('Failed to link candidate application.');
          return;
        }
      } else {
        showToast('Role no longer exists, impossible to make decision.');
        return;
      }
    }
    
    setProgressConfirmModal({
      action: decision,
      appId: appId,
      candidateName: ev.candidate_name || 'Candidate',
      roleTitle: ev.role_title
    });
  };

  const renderPremiumQACard = (ans, idx, questions) => {
    let question = questions.find(q => q.id === ans.question_id);
    if (!question && idx < questions.length) {
      question = questions[idx];
    }
    const category = question ? (question.category || 'General') : 'General';
    const scoreNum = Math.round(ans.score || 0);

    let scoreColor = '#10B981';
    let scoreBg = '#ECFDF5';
    let scoreLabel = 'Excellent';
    if (scoreNum < 70) { scoreColor = '#F59E0B'; scoreBg = '#FFFBEB'; scoreLabel = 'Average'; }
    if (scoreNum < 40) { scoreColor = '#EF4444'; scoreBg = '#FEF2F2'; scoreLabel = 'Needs Work'; }

    return (
      <div key={ans.id || idx} style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }} onMouseOver={e => e.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.06)'} onMouseOut={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.03)'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{
              background: 'linear-gradient(135deg, #00A3E0, #0284C7)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: '20px',
              letterSpacing: '0.5px'
            }}>Q{idx + 1}</span>
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {category}
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: scoreBg,
            color: scoreColor,
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: 700,
            border: `1px solid ${scoreColor}33`
          }}>
            <span>Score: {scoreNum}%</span>
            <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>• {scoreLabel}</span>
          </div>
        </div>

        <h4 style={{ fontSize: '17px', color: '#0F172A', fontWeight: 700, margin: '0 0 20px 0', lineHeight: 1.4 }}>
          {question ? question.text : 'Question text not available'}
        </h4>

        <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', marginBottom: '16px', borderLeft: '4px solid #CBD5E1' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>
            Candidate's Answer
          </span>
          <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: 1.7 }}>
            {ans.text || <span style={{ fontStyle: 'italic', color: '#94A3B8' }}>No answer provided.</span>}
          </p>
        </div>

        {ans.feedback && (
          <div style={{ background: 'linear-gradient(to right, #F0F9FF, #FFFFFF)', borderRadius: '12px', padding: '16px', border: '1px solid #E0F2FE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Review</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#0F172A', lineHeight: 1.6, fontWeight: 500 }}>
              {ans.feedback}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderDecisionActions = (ev, appStatus, targetAppId) => {
    if (appStatus === 'Accepted' || appStatus === 'Selected') {
      return (
        <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669', padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, border: '1px solid #A7F3D0', marginTop: '24px' }}>
          <div style={{ background: '#10B981', color: '#FFF', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
          Candidate Selected for this Role
        </div>
      );
    }
    if (appStatus === 'Rejected') {
      return (
        <div style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)', color: '#DC2626', padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, border: '1px solid #FECACA', marginTop: '24px' }}>
          <div style={{ background: '#EF4444', color: '#FFF', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</div>
          Candidate Rejected for this Role
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', gap: '16px', marginTop: '28px', paddingTop: '28px', borderTop: '1px solid #E2E8F0', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
         <span style={{ flex: '1 1 100%', fontSize: '14px', color: '#64748B', fontWeight: 500, '@media (minWidth: 600px)': { flex: 1} }}>Make a final decision for this candidate:</span>
         <button
            onClick={() => handleDirectDecision('Rejected', ev, targetAppId)}
            style={{ padding: '12px 24px', background: '#FFFFFF', color: '#DC2626', border: '1.5px solid #FECACA', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.05)' }}
            onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#FECACA'; }}
         >
           Reject Candidate
         </button>
         <button
            onClick={() => handleDirectDecision('Selected', ev, targetAppId)}
            style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)'; }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)'; }}
         >
           Accept for Role
         </button>
      </div>
    );
  };

  const renderEvaluation = () => {
    const completedInterviews = interviews
      .filter(iv => iv.status === 'Completed')
      .sort((a, b) => {
        // Sort by completed_at (ISO string from SQLite datetime('now')) descending
        if (a.completed_at && b.completed_at) {
          return b.completed_at.localeCompare(a.completed_at);
        }
        // Fallback to scheduled time if completed_at is missing
        const timeA = (a.scheduled_date || '') + ' ' + (a.scheduled_time || '');
        const timeB = (b.scheduled_date || '') + ' ' + (b.scheduled_time || '');
        return timeB.localeCompare(timeA);
      });
    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>Post-Interview Evaluation</h1>
        <p className={s.pageSubtitle}>Review completed interviews</p>
        {completedInterviews.length === 0 ? (
          <div className={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            <p className={s.emptyStateText}>No completed interviews yet. Evaluations will appear after candidates finish their interviews.</p>
          </div>
        ) : (
          <div className={s.evalList}>
            {completedInterviews.map((ev) => {
              let app = applications.find(a =>
                a.candidate_id === ev.candidate_id &&
                (a.role_title || '').toLowerCase() === (ev.role_title || '').toLowerCase()
              );
              if (!app) {
                const candApps = applications.filter(a => a.candidate_id === ev.candidate_id);
                if (candApps.length === 1) app = candApps[0];
              }
              const isReviewed = app && (app.status === 'Accepted' || app.status === 'Selected' || app.status === 'Rejected');

              return (
              <div className={s.evalCard} key={ev.id} id={`eval-card-${ev.id}`}>
                <div className={s.evalTop}>
                  <div className={s.evalAvatar}>
                    {ev.profile_picture ? (
                      <img src={`${API_URL}${ev.profile_picture}`} alt={ev.candidate_name || 'Candidate'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    )}
                  </div>
                  <div className={s.evalInfo}>
                    <h4 className={s.evalName}>{ev.candidate_name || 'Candidate'}</h4>
                    <span className={s.evalRole}>{ev.role_title}</span>
                  </div>
                  {ev.actual_duration_seconds > 0 && (
                    <div className={s.evalScoreBig} style={{ color: '#00A3E0' }}>
                      {Math.floor(ev.actual_duration_seconds / 60)}m
                      <span className={s.evalScoreUnit}> duration</span>
                    </div>
                  )}
                </div>
                <div className={s.evalActions}>
                  {isReviewed ? (
                    <span style={{ fontSize: '13px', color: app.status === 'Rejected' ? '#DC2626' : '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {app.status === 'Rejected' ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> : <polyline points="20 6 9 17 4 12" />}
                      </svg>
                      {app.status === 'Rejected' ? 'Rejected' : 'Selected'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Completed
                    </span>
                  )}
                  <button
                    className={s.viewAnswersBtn}
                    onClick={() => toggleEvalExpanded(ev.id)}
                  >
                    {evalExpanded === ev.id ? 'Hide Responses' : (isReviewed ? 'Reviewed' : 'Review Responses')}
                  </button>
                </div>

                {evalExpanded === ev.id && (
                  <div className={s.evalExpandedArea}>
                    <h5 className={s.evalExpTitle}>Interview Review</h5>

                    {!evalAnswers[ev.id] ? (
                      <p className={s.evalExpLoading}>Loading responses...</p>
                    ) : evalAnswers[ev.id].length === 0 ? (
                      <p className={s.evalExpLoading}>No responses recorded for this interview.</p>
                    ) : (
                      <>
                        {/* Overall Score Summary - matching candidate progress layout */}
                        {(() => {
                          const answers = evalAnswers[ev.id] || [];
                          const questions = evalQuestions[ev.id] || [];
                          const totalScore = answers.reduce((sum, a) => sum + (a.score || 0), 0);
                          const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
                          return (
                            <div className={s.reviewSummary}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                              <span>Overall Score: <strong>{avgScore}%</strong> ({answers.length} questions)</span>
                            </div>
                          );
                        })()}

                        {/* Per-question review items - matching candidate progress layout */}
                        {evalAnswers[ev.id].map((ans, idx) => (
                           renderPremiumQACard(ans, idx, evalQuestions[ev.id] || [])
                        ))}

                        {/* AI Evaluation Summary */}
                        {(() => {
                          const answers = evalAnswers[ev.id] || [];
                          const totalScore = answers.reduce((sum, a) => sum + (a.score || 0), 0);
                          const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
                          const highScores = answers.filter(a => (a.score || 0) >= 70).length;
                          const lowScores = answers.filter(a => (a.score || 0) < 40).length;
                          return (
                            <div style={{ background: 'linear-gradient(135deg, #F8FAFC, #EBF8FF)', border: '1px solid #E0F2FE', borderRadius: '12px', padding: '16px 20px', marginTop: '16px' }}>
                              <h5 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                                AI Evaluation Summary
                              </h5>
                              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '24px', fontWeight: 800, color: avgScore >= 70 ? '#10B981' : avgScore >= 40 ? '#F59E0B' : '#EF4444' }}>{avgScore}%</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Avg Score</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#10B981' }}>{highScores}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Strong Answers</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#EF4444' }}>{lowScores}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Weak Answers</div>
                                </div>
                              </div>
                              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                                {avgScore >= 70 ? 'The candidate demonstrated strong overall performance with well-articulated responses. Recommended for further consideration.' :
                                  avgScore >= 40 ? 'The candidate showed moderate performance with mixed quality responses. Some areas need improvement. Consider for follow-up assessment.' :
                                    'The candidate showed below-average performance. Multiple responses lacked depth or relevance. May not be suitable for this role.'}
                              </p>
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {/* Admin Decision Actions */}
                    {renderDecisionActions(ev, app ? app.status : null, app ? app.id : null)}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ===== ROLES (Admin & Candidate) ===== */
  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.title) return;
    setIsSubmittingRole(true);
    try {
      await rolesAPI.create({
        ...roleForm,
        work_type: normalizeRoleWorkType(roleForm.work_type),
      });
      setRoleForm({ title: '', domain: '', description: '', work_type: '' });
      fetchData(role, userId);
    } catch (err) { }
    setIsSubmittingRole(false);
  };

  const handleApply = async (roleId) => {
    setApplyingTo(roleId);
    try {
      await applicationsAPI.apply({ candidate_id: userId, role_id: roleId });
      showToast('Application submitted successfully! ✓');
      fetchData(role, userId);
    } catch (err) { }
    setApplyingTo(null);
  };

  const handleEditRole = async () => {
    if (!editingRole) return;
    setIsSavingRole(true);
    try {
      await rolesAPI.update(editingRole.id, {
        title: editingRole.title,
        domain: editingRole.domain,
        description: editingRole.description,
        work_type: normalizeRoleWorkType(editingRole.work_type || ''),
      });
      setEditingRole(null);
      showToast('Role updated successfully.');
      fetchData(role, userId);
    } catch (err) { }
    setIsSavingRole(false);
  };

  const handleDeleteRole = async (roleId) => {
    try {
      await rolesAPI.delete(roleId);
      setDeleteConfirmId(null);
      showToast('Role deleted.');
      fetchData(role, userId);
    } catch (err) { }
  };

  const renderRoles = () => {
    // determine filtered list
    const techKeywords = ['engineer', 'developer', 'ml', 'ai', 'data', 'software', 'frontend', 'backend', 'fullstack', 'devops', 'cloud', 'security', 'qa', 'tech', 'science', 'analyst'];
    let filteredRoles = rolesList.filter(r => {
      const titleLower = (r.title || '').toLowerCase();
      const domainLower = (r.domain || '').toLowerCase();
      const workType = normalizeRoleWorkType(r.work_type || '');
      const workTypeLower = workType.toLowerCase();
      // search
      if (roleSearch) {
        const searchValue = roleSearch.toLowerCase();
        if (!titleLower.includes(searchValue) && !domainLower.includes(searchValue) && !workTypeLower.includes(searchValue)) {
          return false;
        }
      }
      // type filter
      if (roleTypeFilter === 'Tech') {
        const isTech = techKeywords.some(k => titleLower.includes(k) || domainLower.includes(k));
        if (!isTech) return false;
      } else if (roleTypeFilter === 'Non-Tech') {
        const isTech = techKeywords.some(k => titleLower.includes(k) || domainLower.includes(k));
        if (isTech) return false;
      }
      // location/work filter
      if (roleWorkFilter && workType !== roleWorkFilter) {
        return false;
      }
      return true;
    });

    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>{role === 'admin' ? 'Job Roles Management' : 'Available Roles'}</h1>
        <p className={s.pageSubtitle}>
          {role === 'admin' ? 'Create and manage positions available for interviews' : 'Discover and apply for open positions'}
        </p>

        {/* Admin: Create new role form */}
        {role === 'admin' && !editingRole && (
          <div className={s.formCard}>
            <h3 className={s.formTitle}>Create New Role</h3>
            <form onSubmit={handleRoleSubmit} className={s.roleForm}>
              <div className={s.formGroup}>
                <label>Job Title</label>
                <input required value={roleForm.title} onChange={e => setRoleForm({ ...roleForm, title: e.target.value })} placeholder="e.g. Senior Frontend Engineer" />
              </div>
              <div className={s.formGroup}>
                <label>Domain</label>
                <input value={roleForm.domain} onChange={e => setRoleForm({ ...roleForm, domain: e.target.value })} placeholder="e.g. Engineering, Sales" />
              </div>
              <div className={s.formGroup}>
                <label>Description</label>
                <textarea rows="3" value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Brief role description..." />
              </div>
              <div className={s.formGroup}>
                <label>Job Type</label>
                <select value={roleForm.work_type} onChange={e => setRoleForm({ ...roleForm, work_type: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit' }}>
                  <option value="">Select job type</option>
                  <option value="Remote">Remote</option>
                  <option value="In Office">In Office</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <button type="submit" className={s.primaryBtn} disabled={isSubmittingRole}>
                {isSubmittingRole ? 'Creating...' : 'Create Role'}
              </button>
            </form>
          </div>
        )}

        {/* Admin: Inline Edit Form */}
        {role === 'admin' && editingRole && (
          <div className={s.formCard} style={{ borderLeft: '3px solid #00A3E0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={s.formTitle} style={{ margin: 0 }}>Edit Role</h3>
              <button onClick={() => setEditingRole(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 20 }}>×</button>
            </div>
            <div className={s.roleForm}>
              <div className={s.formGroup}>
                <label>Job Title</label>
                <input value={editingRole.title} onChange={e => setEditingRole({ ...editingRole, title: e.target.value })} />
              </div>
              <div className={s.formGroup}>
                <label>Domain</label>
                <input value={editingRole.domain} onChange={e => setEditingRole({ ...editingRole, domain: e.target.value })} />
              </div>
              <div className={s.formGroup}>
                <label>Description</label>
                <textarea rows="3" value={editingRole.description} onChange={e => setEditingRole({ ...editingRole, description: e.target.value })} />
              </div>
              <div className={s.formGroup}>
                <label>Job Type</label>
                <select value={editingRole.work_type || ''} onChange={e => setEditingRole({ ...editingRole, work_type: e.target.value })} style={{ padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit' }}>
                  <option value="">Select job type</option>
                  <option value="Remote">Remote</option>
                  <option value="In Office">In Office</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className={s.primaryBtn} onClick={handleEditRole} disabled={isSavingRole}>
                  {isSavingRole ? 'Saving...' : 'Save Changes'}
                </button>
                <button className={s.rejectBtn} style={{ borderRadius: 8 }} onClick={() => setEditingRole(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Candidate: Search + Filter Bar */}
        {role === 'candidate' && (
          <div className={s.rolesFilterBar}>
            <div className={s.rolesSearchWrap}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                className={s.rolesSearchInput}
                type="text"
                placeholder="Search roles by title or domain…"
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
              />
              {roleSearch && <button className={s.rolesSearchClear} onClick={() => setRoleSearch('')}>×</button>}
            </div>
            <div className={s.rolesFilters}>
              {['', 'Tech', 'Non-Tech'].map(f => (
                <button key={f} className={roleTypeFilter === f ? s.filterChipActive : s.filterChip} onClick={() => setRoleTypeFilter(f)}>
                  {f || 'All Types'}
                </button>
              ))}
              <span className={s.filterDivider}></span>
              {['', 'Remote', 'In Office', 'Hybrid'].map(f => (
                <button key={f} className={roleWorkFilter === f ? s.filterChipActive : s.filterChip} onClick={() => setRoleWorkFilter(f)}>
                  {f || 'All Locations'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Admin: Delete confirmation modal */}
        {deleteConfirmId && (
          <div className={s.deleteModal}>
            <div className={s.deleteModalBox}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
              <h4 style={{ margin: '12px 0 4px', color: '#0A2540' }}>Delete Role?</h4>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>This action cannot be undone. All associated applications may be affected.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className={s.rejectCandBtn} onClick={() => handleDeleteRole(deleteConfirmId)}>Yes, Delete</button>
                <button className={s.approveBtn} onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {filteredRoles.length === 0 ? (
          <div className={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            <p className={s.emptyStateText}>
              {roleSearch || roleTypeFilter || roleWorkFilter ? 'No roles match your search or filters. Try clearing filters.' : 'No roles available yet.'}
            </p>
          </div>
        ) : (
          <div className={s.rolesGrid}>
            {filteredRoles.map(r => {
              const app = role === 'candidate' ? applications.find(a => a.role_id === r.id) : null;
              const applied = !!app;
              const status = app ? app.status : null;
              const rejected = status === 'Rejected';
              const accepted = status === 'Approved' || status === 'Accepted';
              const roleWorkType = normalizeRoleWorkType(r.work_type || '');
              const hasInterview = interviews.some(iv =>
                iv.candidate_id === userId &&
                (iv.role_title || '').toLowerCase() === (r.title || '').toLowerCase()
              );

              const techKeywords = ['engineer', 'developer', 'ml', 'ai', 'data', 'software', 'frontend', 'backend', 'fullstack', 'devops', 'cloud', 'security', 'qa', 'tech', 'science', 'analyst'];
              const isTech = techKeywords.some(k => (r.title || '').toLowerCase().includes(k) || (r.domain || '').toLowerCase().includes(k));

              return (
                <div className={s.roleCard} key={r.id}>
                  <div className={s.roleCardHeader}>
                    <div className={s.roleTitleContainer}>
                      <h4 className={s.roleCardTitle} title={r.title}>{r.title}</h4>
                      <span className={s.roleCategoryBadge}>{isTech ? 'Tech' : 'Non-Tech'}</span>
                    </div>
                    {/* Admin edit/delete buttons */}
                    {role === 'admin' && (
                      <div className={s.roleAdminBtns}>
                        <button className={s.roleEditBtn} title="Edit role" onClick={() => setEditingRole({ id: r.id, title: r.title, domain: r.domain || '', description: r.description || '', work_type: normalizeRoleWorkType(r.work_type || '') })}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button className={s.roleDeleteBtn} title="Delete role" onClick={() => setDeleteConfirmId(r.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={s.roleBadgesRow}>
                    {roleWorkType && (
                      <span className={s.roleWorkBadge} data-type={roleWorkType}>
                        {roleWorkType}
                      </span>
                    )}
                    {r.domain && r.domain.toLowerCase() !== 'tech' && r.domain.toLowerCase() !== 'non-tech' && (
                      <span className={s.roleDomainBadge}>{r.domain}</span>
                    )}
                  </div>

                  <p className={s.roleDesc}>{r.description || 'No description provided.'}</p>

                  {role === 'candidate' && (() => {
                    const app = applications.find(a => a.role_id === r.id);
                    if (app && app.status === 'Selected') {
                      return (
                        <div className={s.roleActions}>
                          <div className={s.roleStateWrap}>
                            <div className={s.roleSelectedStatus}>
                              Selected
                            </div>
                            <p className={s.roleHelperMsg} style={{ color: '#059669' }}>Congratulations! You’ve been selected.</p>
                          </div>
                        </div>
                      );
                    }

                    const completedInterview = interviews.find(iv =>
                      iv.candidate_id === userId &&
                      (iv.role_title || '').toLowerCase() === (r.title || '').toLowerCase() &&
                      iv.status === 'Completed'
                    );

                    if (completedInterview) {
                      return (
                        <div className={s.roleActions}>
                          <div className={s.roleStateWrap}>
                            <button className={s.roleScheduledBtn} style={{ cursor: 'default', opacity: 1 }} disabled>
                              Interview Completed
                            </button>
                            <p className={s.roleHelperMsg} style={{ fontWeight: 600 }}>Under Review</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className={s.roleActions}>
                        {hasInterview ? (
                          <div className={s.roleStateWrap}>
                            <button className={s.roleScheduledBtn} disabled>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              Interview Scheduled
                            </button>
                            <button className={s.roleHelperLink} onClick={() => handlePageChange('interviews')}>Go to My Interviews →</button>
                          </div>
                        ) : accepted ? (
                          <div className={s.roleStateWrap}>
                            <button className={s.roleAcceptedBtn} disabled>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                              Application Accepted
                            </button>
                            <p className={s.roleHelperMsg}>You will be notified when the interview is scheduled.</p>
                          </div>
                        ) : rejected ? (
                          <button className={s.roleRejectedBtn} disabled>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            Application Rejected
                          </button>
                        ) : applied ? (
                          <button className={s.roleAppliedBtn} disabled>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                            Applied
                          </button>
                        ) : (
                          <button
                            className={applyingTo === r.id ? s.roleApplyBtnLoading : s.roleApplyBtn}
                            onClick={() => handleApply(r.id)}
                            disabled={applyingTo === r.id}
                          >
                            {applyingTo === r.id ? (
                              <><span className={s.roleBtnSpinner}></span> Applying…</>
                            ) : (
                              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Apply for Role</>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ===== APPLICATIONS (Admin) ===== */
  const handleAppStatusUpdate = async (appId, status, scheduleData = null) => {
    try {
      const payload = { status };
      if (scheduleData) {
        payload.scheduled_date = scheduleData.scheduled_date;
        payload.scheduled_time = scheduleData.scheduled_time;
        payload.interview_type = scheduleData.interview_type;
        payload.topic_name = scheduleData.topic_name;
        payload.role_title = scheduleData.role_title;
        payload.domain = scheduleData.domain;
      }
      await applicationsAPI.updateStatus(appId, payload);
      fetchData(role, userId);
      // Refresh notifications for candidate
      if (role === 'candidate' && userId) {
        try {
          const nRes = await notificationsAPI.getForUser(userId);
          setNotifications(nRes.data || []);
        } catch (e) { }
      }
    } catch (err) { }
  };

  const renderApplications = () => {
    const filteredApps = applications.filter(app => appFilter === 'All' || app.status === appFilter);

    const handleAvatarMouseEnter = (e, candId) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const popupHeight = 480; // Estimated popup height
      const popupWidth = 320;

      // Position to the right of the avatar, vertically centered
      let xPos = rect.right + 12;
      let yPos = rect.top + (rect.height / 2) - (popupHeight / 2);

      // If it offscreens to the right, put it on the left of the avatar instead
      if (xPos + popupWidth > window.innerWidth - 20) {
        xPos = rect.left - popupWidth - 12;
      }

      // If it would go off the bottom of the screen, force it to fit
      if (yPos + popupHeight > window.innerHeight - 20) {
        yPos = window.innerHeight - popupHeight - 20;
      }

      // Prevent off-screen top (e.g. going under the navbar)
      if (yPos < 80) {
        yPos = 80;
      }

      setPopupPos({ x: xPos, y: yPos });
      setHoveredCandidateId(candId);
    };

    const handleAvatarMouseLeave = () => {
      setHoveredCandidateId(null);
    };

    return (
      <div className={s.dashContent}>
        <h1 className={s.pageTitle}>Candidate Applications</h1>
        <p className={s.pageSubtitle}>Review and manage candidate applications. Approving creates an interview.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {['All', 'Pending', 'Approved', 'Selected', 'Rejected'].map(lbl => (
            <button
              key={lbl}
              style={{ padding: '6px 16px', borderRadius: '20px', border: appFilter === lbl ? 'none' : '1px solid #E2E8F0', background: appFilter === lbl ? '#00A3E0' : '#FFF', color: appFilter === lbl ? '#FFF' : '#64748B', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => setAppFilter(lbl)}
            >
              {lbl}
            </button>
          ))}
        </div>

        {filteredApps.length === 0 ? (
          <div className={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
            <p className={s.emptyStateText}>No applications found for this filter.</p>
          </div>
        ) : (
          <div className={s.appGridNew}>
            {filteredApps.map(app => {
              const initials = (app.candidate_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              return (
                <div className={s.appCardNew} key={app.id}>
                  <div className={s.appCardGradient}></div>
                  <div
                    className={s.appCardHeaderNew}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setFocusedAppDetail(app);
                      handlePageChange('candidateDetail');
                    }}
                    title="Click to view full candidate details"
                  >
                    <div
                      className={s.appAvatarNew}
                      onMouseEnter={(e) => handleAvatarMouseEnter(e, app.candidate_id)}
                      onMouseLeave={handleAvatarMouseLeave}
                      style={app.profile_picture ? { padding: 0, overflow: 'hidden' } : {}}
                    >
                      {app.profile_picture ? (
                        <img src={`${API_URL}${app.profile_picture}`} alt={app.candidate_name || 'Candidate'} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : initials}
                    </div>
                    <div className={s.appHeaderMeta}>
                      <h4 className={s.appNameNew} style={{ transition: 'color 0.2s' }} onMouseOver={(e) => e.target.style.color = '#00A3E0'} onMouseOut={(e) => e.target.style.color = '#0A2540'}>{app.candidate_name || 'Unknown Candidate'}</h4>
                      {app.candidate_email && <span className={s.appEmailNew}>{app.candidate_email}</span>}
                    </div>
                    <div className={`${s.appStatusPill} ${s[`appStatus${app.status}`]}`}>{app.status}</div>
                  </div>
                  <div className={s.appCardBodyNew}>
                    <div className={s.appInfoRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                      <span className={s.appInfoLabel}>Role:</span>
                      <span className={s.appInfoValue}>{app.role_title}</span>
                    </div>
                    {app.applied_at && (
                      <div className={s.appInfoRow}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span className={s.appInfoLabel}>Applied:</span>
                        <span className={s.appInfoValue}>{new Date(app.applied_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  <div className={s.appCardFooterNew}>
                    {app.status === 'Pending' && (
                      <>
                        <button className={s.appApproveBtn} onClick={() => {
                          // Open scheduling modal instead of direct approve
                          setScheduleModal({ appId: app.id, candidateName: app.candidate_name, roleTitle: app.role_title });
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          const tomorrowStr = tomorrow.toISOString().split('T')[0];
                          setSchedDate(tomorrowStr);
                          setSchedTime('');
                          setSchedTopic(app.role_title || '');
                          setSchedType('AI');
                          setBookedSlots([]);
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                          Approve
                        </button>
                        <button className={s.appRejectBtnNew} onClick={() => handleAppStatusUpdate(app.id, 'Rejected')}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          Reject
                        </button>
                      </>
                    )}
                    {app.status === 'Approved' && (
                      <span className={s.appApprovedTag}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        Interview Assigned
                      </span>
                    )}
                    {app.status === 'Rejected' && (
                      <span className={s.appRejectedTag}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        Application Rejected
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Hover Profile Popup matching 'Candidates' layout */}
        {hoveredCandidateId && (() => {
          const c = candidates.find(cand => cand.id === hoveredCandidateId);
          if (!c) return null;
          return (
            <div
              style={{
                position: 'fixed',
                top: popupPos.y,
                left: popupPos.x,
                zIndex: 999999,
                width: '320px',
                pointerEvents: 'none',
              }}
            >
              <div className={s.candCard} style={{ margin: 0, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', height: 'fit-content' }}>
                <div className={s.candBanner}></div>
                <div className={s.candAvatarWrap}>
                  <div className={s.candAvatarInner}>
                    {c.profile_picture ? (
                      <img className={s.candAvatarImg} src={`${API_URL}${c.profile_picture}`} alt={c.name} />
                    ) : (
                      <div className={s.candAvatarPlaceholder}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      </div>
                    )}
                    <div className={s.candAvatarBadge}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" /></svg>
                    </div>
                  </div>
                </div>
                <div className={s.candBody} style={{ paddingBottom: '20px', flex: 'none' }}>
                  <h4 className={s.candName}>{c.name}</h4>
                  {c.role_applied && <p className={s.candRoleTitle}>{c.role_applied}</p>}

                  {(c.location || c.experience || c.education || c.mobile) && (
                    <div className={s.candInfoList}>
                      {c.mobile && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                          <span>{c.mobile}</span>
                        </div>
                      )}
                      {c.location && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          <span>{c.location}</span>
                        </div>
                      )}
                      {c.experience && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                          <span>{c.experience}</span>
                        </div>
                      )}
                      {c.education && (
                        <div className={s.candInfoItem}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                          <span>{c.education}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {c.skills && c.skills.length > 0 && (
                    <div className={s.candSkillsBlock}>
                      <span className={s.candSkillsTitle}>Key Skills</span>
                      <div className={s.candSkillsList}>
                        {c.skills.map((skill, j) => (
                          <span className={s.candSkillPill} key={j}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.availability && (
                    <div className={s.candAvailBlock}>
                      <strong>Availability:</strong> {c.availability === 'Both (Remote + In Office)' ? 'Remote, In Office' : c.availability}
                    </div>
                  )}

                  {/* Non-interactive Mock Footer since we just need hover details */}
                  <div className={s.candSocialRow} style={{ marginTop: '16px', marginBottom: 0 }}>
                    <div className={s.candSocialBtn} style={{ cursor: 'default' }} title="LinkedIn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></div>
                    <div className={s.candSocialBtn} style={{ cursor: 'default' }} title="GitHub"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg></div>
                    <div className={s.candSocialBtn} style={{ cursor: 'default' }} title="Email"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
        }
      </div >
    );
  };

  const renderCandidateDetail = () => {
    if (!focusedAppDetail) {
      return (
        <div className={s.dashContent}>
          <p className={s.emptyStateText}>No candidate application selected.</p>
          <button className={s.primaryBtn} onClick={() => handlePageChange('applications')}>Back</button>
        </div>
      );
    }

    const app = focusedAppDetail;
    const profileData = focusedProfileDetail;

    // We check if this candidate completed an interview for this role
    const candInterview = interviews.find(iv =>
      iv.candidate_id === app.candidate_id &&
      (iv.role_title || '').toLowerCase() === (app.role_title || '').toLowerCase() &&
      iv.status === 'Completed'
    );

    return (
      <div className={s.dashContent}>
        <button
          onClick={() => handlePageChange('applications')}
          style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 500 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Applications
        </button>

        <div className={s.evalCard} style={{ cursor: 'default' }}>
          <div className={s.evalTop} style={{ flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className={s.evalAvatar} style={{ width: '64px', height: '64px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </div>
              <div className={s.evalInfo}>
                <h2 style={{ margin: '0 0 4px 0', color: '#0A2540', fontSize: '24px' }}>{profileData?.full_name || app.candidate_name || 'Candidate Name'}</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>{profileData?.email || app.candidate_email}</span>
                  <div className={`${s.appStatusPill} ${s[`appStatus${app.status}`]}`}>{app.status}</div>
                </div>
              </div>
            </div>
            {candInterview && (
              <div className={s.evalScoreBig} style={{ color: '#00A3E0', padding: '12px 24px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                {Math.floor(candInterview.actual_duration_seconds / 60)}m
                <span className={s.evalScoreUnit} style={{ display: 'block', fontSize: '12px', color: '#64748B', marginTop: '4px' }}> Interview Duration</span>
              </div>
            )}
          </div>

          <div style={{ padding: '24px 0', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0', marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0A2540', marginBottom: '16px' }}>Applicant Background</h3>
            {isFetchingProfileDetail ? (
              <p style={{ color: '#64748B', fontSize: '14px' }}>Loading profile details...</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Applied Role</label>
                  <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px', fontWeight: 500 }}>{app.role_title}</p>
                </div>
                {app.applied_at && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Applied On</label>
                    <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px' }}>{new Date(app.applied_at).toLocaleDateString()}</p>
                  </div>
                )}
                {profileData?.mobile && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Phone</label>
                    <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px' }}>{profileData.mobile}</p>
                  </div>
                )}
                {profileData?.location && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Location</label>
                    <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px' }}>{profileData.location}</p>
                  </div>
                )}
                {profileData?.experience && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Experience</label>
                    <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px' }}>{profileData.experience}</p>
                  </div>
                )}
                {profileData?.education && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Education</label>
                    <p style={{ margin: '4px 0 0 0', color: '#0A2540', fontSize: '14px' }}>{profileData.education}</p>
                  </div>
                )}
                {profileData?.resume_url && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>Resume</label>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px' }}>
                      <a href={`http://localhost:8001${profileData.resume_url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#00A3E0', fontWeight: 500, textDecoration: 'none' }}>Download PDF</a>
                    </p>
                  </div>
                )}
              </div>
            )}
            {!isFetchingProfileDetail && profileData?.skills && profileData.skills.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Declared Skills</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {profileData.skills.map(skill => (
                    <span key={skill} style={{ background: '#F1F5F9', color: '#334155', padding: '6px 14px', borderRadius: '16px', fontSize: '13px', fontWeight: 500, border: '1px solid #E2E8F0' }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '24px 0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0A2540', marginBottom: '16px' }}>Interview Assessment</h3>
            {!candInterview ? (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '24px', borderRadius: '12px', textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" style={{ margin: '0 auto 12px auto' }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <p style={{ color: '#64748B', margin: 0, fontSize: '15px' }}>This candidate has not completed their AI Interview yet.</p>
              </div>
            ) : (
              <div className={s.evalExpandedArea} style={{ marginTop: 0, padding: 0, background: 'transparent', border: 'none' }}>
                {!evalAnswers[candInterview.id] ? (
                  <button className={s.viewAnswersBtn} onClick={() => toggleEvalExpanded(candInterview.id)}>Load Interview Responses</button>
                ) : evalAnswers[candInterview.id].length === 0 ? (
                  <p className={s.evalExpLoading}>No responses recorded for this interview.</p>
                ) : (
                  <>
                    {/* Overall Score Summary */}
                    {(() => {
                      const answers = evalAnswers[candInterview.id] || [];
                      const questions = evalQuestions[candInterview.id] || [];
                      const totalScore = answers.reduce((sum, a) => sum + (a.score || 0), 0);
                      const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
                      return (
                        <div className={s.reviewSummary}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                          <span>Overall Score: <strong>{avgScore}%</strong> ({answers.length} questions)</span>
                        </div>
                      );
                    })()}

                    {/* Per-question review items */}
                    {evalAnswers[candInterview.id].map((ans, idx) => (
                       renderPremiumQACard(ans, idx, evalQuestions[candInterview.id] || [])
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Admin Decision Actions */}
          {renderDecisionActions({ candidate_name: app.candidate_name, candidate_id: app.candidate_id, role_title: app.role_title }, app.status, app.id)}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (currentPage === 'candidateDetail' && focusedAppDetail) {
      const fetchProfile = async () => {
        setIsFetchingProfileDetail(true);
        try {
          const res = await profileAPI.getByUserId(focusedAppDetail.candidate_id);
          setFocusedProfileDetail(res.data);
        } catch (err) {
          console.error('Failed to load profile details log:', err);
          setFocusedProfileDetail(null);
        } finally {
          setIsFetchingProfileDetail(false);
        }
      };

      fetchProfile();

      // Auto-load answers if they finished the interview
      const candInterview = interviews.find(iv =>
        iv.candidate_id === focusedAppDetail.candidate_id &&
        iv.status === 'Completed'
      );
      if (candInterview && !evalAnswers[candInterview.id]) {
        toggleEvalExpanded(candInterview.id);
      }
    }
  }, [currentPage, focusedAppDetail, interviews]);

  useEffect(() => {
    if (currentPage === 'evaluation' && focusCandidateId) {
      const targetIv = interviews.find(iv =>
        (iv.candidate_id && focusCandidateId && iv.candidate_id.toString() === focusCandidateId.toString()) ||
        (iv.candidate_name && focusCandidateId && iv.candidate_name === focusCandidateId)
      );
      if (targetIv && targetIv.status === 'Completed') {
        if (evalExpanded !== targetIv.id) {
          toggleEvalExpanded(targetIv.id);
        }

        // Timeout to allow DOM to render before scrolling
        setTimeout(() => {
          const el = document.getElementById(`eval-card-${targetIv.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      setFocusCandidateId(null);
    }
  }, [currentPage, focusCandidateId, interviews]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className={s.dashContent} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <div className={s.loadingScreen} style={{ background: 'transparent' }}>
            <div className={s.spinner}></div>
            <p style={{ color: '#0A2540' }}>Loading Data...</p>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'overview': return renderOverview();
      case 'roles': return renderRoles();
      case 'applications': return renderApplications();
      case 'candidateDetail': return renderCandidateDetail();
      case 'interviews': return renderInterviews();
      case 'candidates': return renderCandidates();
      case 'qa': return renderQA();
      case 'progress':
        if (role === 'admin') return renderEvaluation();
        return renderProgress();
      case 'videoroom': return renderOverview();
      default: return role === 'candidate' ? renderRoles() : renderOverview();
    }
  };

  // Build notification objects for the Navbar (with id, message, is_read)
  let unreadNotifications = [];
  if (role === 'admin') {
    // DB notifications for admin
    const dbNotifs = notifications
      .filter(n => !(n.message && n.message.includes('has applied for')))
      .map(n => ({ id: n.id, message: n.message, is_read: parseInt(n.is_read) === 1 }));
    // Also show pending app count summaries (synthetic, no DB id)
    const counts = {};
    applications.forEach(a => {
      if (a.status === 'Pending') {
        const title = a.role_title || 'Unknown Role';
        counts[title] = (counts[title] || 0) + 1;
      }
    });
    const appCountNotifs = Object.entries(counts).map(([t, c]) => ({
      id: null, message: `${c} new application${c > 1 ? 's' : ''} for ${t}`, is_read: seenPendingCounts[t] === c
    }));
    unreadNotifications = [...dbNotifs, ...appCountNotifs];
  } else {
    // Candidate: use real notifications from DB
    const dbNotifs = notifications.map(n => ({ id: n.id, message: n.message, is_read: parseInt(n.is_read) === 1 }));
    unreadNotifications = [...dbNotifs];
  }

  const handleNotificationsOpened = async () => {
    // Mark all unread DB notifications as read
    const unreadDbNotifs = notifications.filter(n => !n.is_read && !(n.message && n.message.includes('has applied for')));
    for (const n of unreadDbNotifs) {
      try {
        await notificationsAPI.markRead(n.id);
      } catch (e) { }
    }
    // Update local state
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));

    // Mark synthetic appCountNotifs as read by saving current counts locally
    if (role === 'admin') {
      const counts = {};
      applications.forEach(a => {
        if (a.status === 'Pending') {
          const title = a.role_title || 'Unknown Role';
          counts[title] = (counts[title] || 0) + 1;
        }
      });
      setSeenPendingCounts(counts);
      if (userId) {
        localStorage.setItem(`seenPendingCounts_${userId}`, JSON.stringify(counts));
      }
    }
  };

  const renderStatusConfirmModal = () => {
    if (!progressConfirmModal) return null;
    const { action, appId, candidateName, roleTitle } = progressConfirmModal;
    return (
      <div className={s.modalOverlay} onClick={() => setProgressConfirmModal(null)}>
        <div className={s.modalBox} onClick={(e) => e.stopPropagation()}>
          <h3 className={s.modalTitle}>{action === 'Selected' ? 'Confirm Selection' : 'Confirm Rejection'}</h3>
          <div className={s.modalBody}>
            <p className={s.modalConfirmText}>
              Are you sure you want to <strong>{action.toLowerCase()}</strong> <strong>{candidateName}</strong> for the <strong>{roleTitle}</strong> position?
            </p>
            <p style={{ fontSize: '13px', color: '#64748B', marginTop: '12px' }}>
              This will update their application status and notify the candidate.
            </p>
          </div>
          <div className={s.modalActions}>
            <button className={s.modalCancelBtn} onClick={() => setProgressConfirmModal(null)}>Cancel</button>
            <button
              className={action === 'Selected' ? s.modalJoinBtn : s.appRejectBtnNew}
              style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              onClick={async () => {
                await handleAppStatusUpdate(appId, action);
                setProgressConfirmModal(null);
                if (currentPage === 'candidateDetail') {
                   // Refresh current app detail if on detail page
                   fetchData(role, userId);
                }
              }}
            >
              Confirm {action}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderScheduleModal = () => {
    if (!scheduleModal) return null;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    // Time Slots for scheduling
    const TIME_SLOTS = [
      '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
      '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'
    ];

    const handleDateChange = async (date) => {
      setSchedDate(date);
      setSchedTime('');
      try {
        const res = await interviewsAPI.getBookedSlots(date);
        setBookedSlots(res.data.booked_slots || []);
      } catch (e) {
        setBookedSlots([]);
      }
    };

    const handleConfirm = async () => {
      if (!schedDate || !schedTime || !schedTopic.trim()) {
        showToast('Please provide a Date, Time, and Role.');
        return;
      }
      const selectedRoleObj = rolesList.find(r => r.title === schedTopic);
      setIsScheduling(true);

      try {
        if (scheduleModal.appId) {
          // Normal flow: approve application + create interview
          await handleAppStatusUpdate(scheduleModal.appId, 'Approved', {
            scheduled_date: schedDate,
            scheduled_time: schedTime,
            role_title: selectedRoleObj ? selectedRoleObj.title : schedTopic,
            domain: selectedRoleObj ? selectedRoleObj.domain : '',
            interview_type: schedType
          });
        } else {
          // Direct scheduling: create interview without application
          const is_ai = schedType === 'AI' ? 1 : 0;
          await interviewsAPI.create({
            candidate_id: scheduleModal.candidateId,
            candidate_name: scheduleModal.candidateName,
            role_title: selectedRoleObj ? selectedRoleObj.title : schedTopic,
            domain: selectedRoleObj ? selectedRoleObj.domain : '',
            scheduled_date: schedDate,
            scheduled_time: schedTime,
            duration_minutes: 60,
            is_ai_interview: is_ai
          });
          fetchData(role, userId);
        }
        showToast(`Interview scheduled for ${scheduleModal.candidateName} on ${schedDate} at ${schedTime}`);
      } catch (err) {
        console.error('Failed to schedule interview:', err);
        showToast('Failed to create interview. Please try again.');
      }
      setIsScheduling(false);
      setScheduleModal(null);
    };

    return (
      <div className={s.schedOverlay} onClick={() => setScheduleModal(null)}>
        <div className={s.schedModal} onClick={e => e.stopPropagation()}>
          <div className={s.schedHeader}>
            <h3 className={s.schedTitle}>Schedule Interview</h3>
            <button className={s.schedCloseBtn} onClick={() => setScheduleModal(null)}>×</button>
          </div>
          <p className={s.schedSubtext}>
            Scheduling interview for <strong>{scheduleModal.candidateName}</strong>
          </p>

          {/* Select Role */}
          <div className={s.schedSection}>
            <label className={s.schedLabel}>Select Role (Topic)</label>
            <select
              className={s.schedDateInput}
              value={schedTopic}
              onChange={e => setSchedTopic(e.target.value)}
            >
              <option value="">Select a role...</option>
              {rolesList.map((r, i) => (
                <option key={r.id || i} value={r.title}>{r.title}</option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className={s.schedSection}>
            <label className={s.schedLabel}>Select Date</label>
            <input
              type="date"
              className={s.schedDateInput}
              min={minDate}
              value={schedDate}
              onChange={e => handleDateChange(e.target.value)}
            />
          </div>

          {/* Time Slots */}
          {schedDate && (
            <div className={s.schedSection}>
              <label className={s.schedLabel}>Select Time Slot</label>
              <div className={s.schedTimeGrid}>
                {TIME_SLOTS.map(slot => {
                  const isBooked = bookedSlots.includes(slot);
                  const isSelected = schedTime === slot;
                  return (
                    <button
                      key={slot}
                      className={`${s.schedTimeSlot} ${isBooked ? s.schedTimeBooked : ''} ${isSelected ? s.schedTimeSelected : ''}`}
                      disabled={isBooked}
                      onClick={() => setSchedTime(slot)}
                      title={isBooked ? 'This slot is already booked' : ''}
                    >
                      {slot}
                      {isBooked && <span className={s.schedBookedBadge}>Booked</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interview Type Toggle */}
          <div className={s.schedSection}>
            <label className={s.schedLabel}>Interview Type</label>
            <div className={s.schedToggleWrap}>
              <button
                className={`${s.schedToggleBtn} ${schedType === 'AI' ? s.schedToggleActive : ''}`}
                onClick={() => setSchedType('AI')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" /></svg>
                AI Interview
              </button>
              <button
                className={`${s.schedToggleBtn} ${schedType === 'Admin' ? s.schedToggleActive : ''}`}
                onClick={() => setSchedType('Admin')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Admin Interview
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className={s.schedActions}>
            <button
              className={s.schedConfirmBtn}
              onClick={handleConfirm}
              disabled={!schedDate || !schedTime || isScheduling}
            >
              {isScheduling ? 'Scheduling...' : 'Confirm & Approve'}
            </button>
            <button className={s.schedCancelBtn} onClick={() => setScheduleModal(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Dashboard - AI Interview Room</title>
        <meta name="description" content="AI Interview Room Dashboard - Blue Planet InfoSolutions" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={s.dashWrapper}>
        <Navbar 
          currentPage={currentPage}
          onPageChange={handlePageChange}
          role={role}
          userName={profile?.full_name || 'User'}
          notifications={unreadNotifications}
          onNotificationsOpened={handleNotificationsOpened}
          profileData={{ ...profile, _skillsInput: profileSkillsInput }}
          onProfileSave={handleProfileFieldChangeOrSave}
          onResumeUpload={handleResumeUpload}
          onPhotoUpload={handlePhotoUpload}
          profileMsg={profileMsg}
        />

        <main className={s.dashMain}>
          {renderContent()}

          {renderJoinModal()}
          {renderVideoModal()}
          {renderProctoringModal()}
          {renderStatusConfirmModal()}
          {renderScheduleModal()}
          
          {toastMsg && (
            <div className={s.toast}>
              <div className={s.toastInner}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                {toastMsg}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
