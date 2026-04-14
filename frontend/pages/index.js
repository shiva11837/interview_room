import { useRouter } from 'next/router';
import Head from 'next/head';
import BrandLockup from '../components/BrandLockup';
import LandingVisualCarousel from '../components/LandingVisualCarousel';

export default function Home() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>AI Interview Room - Blue Planet InfoSolutions</title>
        <meta name="description" content="Blue Planet InfoSolutions AI Interview Platform - Global hiring made smarter with AI-powered interviews." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="landing">
        {/* Header */}
        <header className="landing-header">
          <div className="header-left">
            <BrandLockup className="landing-brand" theme="dark" size="md" />
          </div>
          <div className="header-right">
            <button className="btn-ghost" onClick={() => router.push('/login')}>Log In</button>
            <button className="btn-primary" onClick={() => router.push('/login')}>Get Started</button>
          </div>
        </header>

        {/* Hero */}
        <section className="hero">
          <div className="hero-content">
            <div className="hero-badge">AI-Powered Interview Platform</div>
            <h1 className="hero-title">
              Smarter Hiring with
              <span className="highlight"> AI Interviews</span>
            </h1>
            <p className="hero-desc">
              Streamline your global hiring process with AI-powered interviews.
              Real-time video, intelligent question generation, and automated
              candidate scoring - all in one platform.
            </p>
            <div className="hero-actions">
              <button className="btn-primary large" onClick={() => router.push('/login')}>
                Start Interviewing
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
              <button className="btn-outline large" onClick={() => router.push('/login')}>
                View Demo
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-value">247+</span>
                <span className="stat-label">Interviews Conducted</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat">
                <span className="stat-value">89+</span>
                <span className="stat-label">Active Candidates</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat">
                <span className="stat-value">34+</span>
                <span className="stat-label">Countries Reached</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <LandingVisualCarousel />
          </div>
        </section>

        {/* Features */}
        <section className="features">
          <h2 className="section-title">Why Choose Our Platform</h2>
          <p className="section-desc">Everything you need to conduct smart, efficient, and fair interviews</p>
          <div className="features-grid">
            {[
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                ),
                title: 'Real-Time Video',
                desc: 'High-quality WebRTC video conferencing with live AI analysis and recording capabilities.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ),
                title: 'AI-Generated Questions',
                desc: 'Domain-aware questions automatically generated and categorized by technical depth and topic.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                ),
                title: 'Smart Scoring',
                desc: 'Automated candidate assessment with detailed feedback and scoring across multiple dimensions.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: 'Live Monitoring',
                desc: 'Admins can monitor candidate interviews in real-time with live video and progress tracking.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                title: 'Secure & Private',
                desc: 'JWT-authenticated sessions with role-based access control for admins and candidates.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A3E0" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
                  </svg>
                ),
                title: 'Global Reach',
                desc: 'Interview candidates from 34+ countries with multi-timezone scheduling and support.',
              },
            ].map((f, i) => (
              <div className="feature-card" key={i}>
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <BrandLockup theme="dark" size="sm" clickable={false} />
            </div>
            <p className="footer-text">AI-Powered Interview Platform for Global Hiring</p>
          </div>
          <div className="copyright">
            &copy; 2026 Blue Planet InfoSolutions. All rights reserved.
          </div>
        </footer>
      </div>

      <style jsx>{`
        .landing {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(0, 163, 224, 0.08), transparent 28%),
            linear-gradient(180deg, #f8fbff 0%, #f6f8fc 38%, #ffffff 100%);
          font-family: 'Inter', sans-serif;
        }

        /* Header */
        .landing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 48px;
          background: rgba(10, 37, 64, 0.94);
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          backdrop-filter: blur(18px);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .landing-brand {
          flex-shrink: 0;
        }

        .header-right {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .btn-ghost {
          padding: 10px 20px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .btn-ghost:hover {
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .btn-primary {
          padding: 10px 24px;
          border: none;
          background: linear-gradient(135deg, #00A3E0 0%, #0284C7 100%);
          color: #FFFFFF;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(2, 132, 199, 0.22);
        }

        .btn-primary.large {
          padding: 14px 32px;
          font-size: 16px;
          border-radius: 10px;
        }

        .btn-outline {
          padding: 10px 24px;
          border: 1px solid rgba(2, 132, 199, 0.22);
          background: rgba(255, 255, 255, 0.82);
          color: #0369A1;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .btn-outline.large {
          padding: 14px 32px;
          font-size: 16px;
          border-radius: 10px;
        }

        .btn-outline:hover {
          background: #FFFFFF;
          border-color: rgba(2, 132, 199, 0.36);
        }

        /* Hero */
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
          gap: clamp(36px, 4vw, 60px);
          padding: 72px 48px 56px;
          max-width: 1400px;
          margin: 0 auto;
          align-items: center;
        }

        .hero-content {
          min-width: 0;
          max-width: 620px;
          align-self: start;
          padding-top: 10px;
        }

        .hero-badge {
          display: inline-block;
          padding: 7px 16px;
          background: rgba(255, 255, 255, 0.72);
          color: #0369A1;
          font-size: 12px;
          font-weight: 700;
          border-radius: 999px;
          margin-bottom: 22px;
          border: 1px solid rgba(2, 132, 199, 0.14);
          box-shadow: 0 12px 26px rgba(148, 163, 184, 0.12);
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .hero-title {
          font-size: clamp(42px, 5.2vw, 60px);
          font-weight: 800;
          color: #0A2540;
          line-height: 1.03;
          letter-spacing: -0.04em;
          margin: 0 0 24px 0;
        }

        .highlight {
          color: #00A3E0;
        }

        .hero-desc {
          max-width: 580px;
          font-size: 18px;
          color: #526173;
          line-height: 1.75;
          margin: 0 0 36px 0;
        }

        .hero-actions {
          display: flex;
          gap: 16px;
          margin-bottom: 40px;
        }

        .hero-stats {
          display: flex;
          gap: 32px;
          align-items: center;
          width: fit-content;
          padding: 18px 22px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.76);
          box-shadow: 0 22px 40px rgba(148, 163, 184, 0.12);
          backdrop-filter: blur(14px);
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 30px;
          font-weight: 800;
          color: #0A2540;
          letter-spacing: -0.03em;
        }

        .stat-label {
          font-size: 12px;
          color: #64748B;
          margin-top: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .stat-divider {
          width: 1px;
          height: 40px;
          background: #E5E7EB;
        }

        /* Hero Visual */
        .hero-visual {
          display: flex;
          justify-content: flex-end;
          align-items: flex-start;
          min-width: 0;
          margin-top: -40px;
        }

        .visual-card {
          width: 100%;
          max-width: 520px;
          background: #0A2540;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(10, 37, 64, 0.3);
        }

        .visual-topbar {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.1);
        }

        .dots {
          display: flex;
          gap: 6px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot.red { background: #EF4444; }
        .dot.yellow { background: #F59E0B; }
        .dot.green { background: #10B981; }

        .visual-content {
          display: grid;
          grid-template-columns: 1fr 160px;
          min-height: 300px;
        }

        .visual-video-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px;
          gap: 8px;
        }

        .visual-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(0, 163, 224, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .visual-name {
          color: #FFFFFF;
          font-size: 16px;
          font-weight: 600;
        }

        .visual-role {
          color: #7EC8E3;
          font-size: 13px;
        }

        .visual-sidebar {
          background: rgba(255, 255, 255, 0.05);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        .visual-q {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .vq-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 10px;
          background: rgba(0, 163, 224, 0.2);
          color: #00A3E0;
        }

        .vq-badge.green {
          background: rgba(16, 185, 129, 0.2);
          color: #10B981;
        }

        .vq-badge.orange {
          background: rgba(245, 158, 11, 0.2);
          color: #F59E0B;
        }

        .vq-text {
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          font-weight: 600;
        }

        /* Features */
        .features {
          padding: 52px 48px 88px;
          max-width: 1400px;
          margin: 0 auto;
          text-align: center;
        }

        .section-title {
          font-size: 36px;
          font-weight: 800;
          color: #0A2540;
          margin: 0 0 14px 0;
          letter-spacing: -0.03em;
        }

        .section-desc {
          font-size: 17px;
          color: #64748B;
          margin: 0 0 48px 0;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 22px;
          padding: 32px;
          text-align: left;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
          box-shadow: 0 18px 36px rgba(148, 163, 184, 0.08);
          backdrop-filter: blur(12px);
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 48px rgba(148, 163, 184, 0.14);
          border-color: rgba(2, 132, 199, 0.26);
        }

        .feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(0, 163, 224, 0.12), rgba(2, 132, 199, 0.04));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
        }

        .feature-title {
          font-size: 18px;
          font-weight: 700;
          color: #0A2540;
          margin: 0 0 10px 0;
        }

        .feature-desc {
          font-size: 14px;
          color: #64748B;
          line-height: 1.7;
          margin: 0;
        }

        /* Footer */
        .landing-footer {
          background: #0A2540;
          padding: 40px 48px;
        }

        .footer-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-brand {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .footer-text {
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
          margin: 0;
        }

        .copyright {
          text-align: center;
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          letter-spacing: 0.02em;
        }

        @media (max-width: 768px) {
          .landing-header {
            padding: 16px 20px;
            gap: 12px;
            flex-wrap: wrap;
          }
          .header-right {
            width: 100%;
            justify-content: flex-end;
          }
          .hero {
            grid-template-columns: 1fr;
            padding: 40px 24px;
          }
          .hero-content {
            padding-top: 0;
          }
          .features-grid {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 32px;
          }
          .hero-actions,
          .hero-stats,
          .footer-content {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </>
  );
}
