# AI Interview Room — Blue Planet Solutions

A sophisticated, full-stack, AI-powered interview platform designed to streamline the hiring process with real-time video (WebRTC), automated scoring, and **AI-driven proctoring**. 

The system features a modular architecture, with a decoupled AI model-serving microservice for scalable object detection (using YOLOv8).

---

## 🚀 Key Features

- **🤖 AI Proctoring**: Real-time detection of multiple faces, mobile phones, and suspicious behavior.
- **🎥 WebRTC Interviews**: High-quality, low-latency video and audio for a seamless interview experience.
- **📈 Automated Scoring**: Intelligent analysis and scoring of candidate responses using AI.
- **🛡️ Role-Based Access**: Specialized dashboards for **Administrators** (Interviewer) and **Candidates**.
- **📊 Admin Control Panel**: Manage jobs, candidates, and review premium, AI-scored interview reports with proctoring logs and direct hiring decisions (Select/Reject).
- **✉️ Automated Notifications**: Seamless communication via integrated SMTP email services.

---

## 🔐 Admin Demo Credentials

For testing and demonstration, use the following credentials to access the Admin Dashboard:

| Role  | Email | Password |
|-------|-------|----------|
| **Admin** | `admin@blueplanet.com` | `admin123` |

*Candidates can sign up for a new account directly via the login page.*

---

## 🏗️ Architecture

```text
Ai_Interview_bps/
├── ai-models/                     ← AI Inference Microservice
│   ├── object-detection/          ← Modular detection logic (YOLOv8)
│   └── model-serving/             ← FastAPI Service (Port 8002)
├── backend/                       ← Core Interview API (Port 8001)
│   ├── app/                       ← Business logic, Socket.IO, DB
│   └── data/                      ← Persistent SQLite DB
└── frontend/                      ← Next.js User Interface (Port 3000)
```

---

## 🛠️ Tech Stack

| Layer          | Technology                                                                 |
|----------------|---------------------------------------------------------------------------|
| **Frontend**   | Next.js (Pages Router), React, Socket.IO Client, WebRTC, Axios, CSS Modules |
| **Backend**    | FastAPI, Socket.IO (python-socketio), JWT (Jose), SQLite, Bcrypt           |
| **AI Models**  | Python, YOLOv8 (via Ultralytics), NumPy, Pillow                            |
| **Serving**    | FastAPI, Uvicorn, AsyncIO                                                 |

---

## ⚙️ Setup & Installation

Follow these steps to run the complete system locally.

### 1. AI Model Serving (Port 8002)
Handles real-time object detection during interviews.
```bash
cd ai-models/model-serving
pip install -r requirements.txt
# uvicorn app:app --host 0.0.0.0 --port 8002 --reload
py -m uvicorn app:app --host 0.0.0.0 --port 8002 --reload                   
>> 
```
- **Docs:** `http://localhost:8002/docs`

### 2. Backend API (Port 8001)
The core logic, authentication, and database management.
```bash
cd backend
pip install -r requirements.txt
# Configure your .env file (see below)
python run.py
```
- **Docs:** `http://localhost:8001/docs`

### 3. Frontend (Port 3000)
The web interface for candidates and admins.
```bash
cd frontend
npm install
# Configure your .env.local file (see below)
npm run dev
```
- **Access:** `http://localhost:3000`

---

## 📝 Environment Configuration

Ensure the following configuration files are set up in their respective directories.

### Backend (`backend/.env`)
```env
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# SMTP Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=hr@yourdomain.com
SMTP_FROM_NAME="HR Team"

# Frontend URL for link generation
FRONTEND_URL=http://localhost:3000
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_SOCKET_URL=http://localhost:8001
```

---

## 🛡️ Proctoring & Security

The system implements advanced proctoring to ensure interview integrity:
1. **Face Detection**: Verifies that the candidate is present and একা (alone).
2. **Object Detection**: Detects prohibited devices like mobile phones.
3. **Tab/Window Switching**: Logs and warns when the candidate leaves the interview tab.
4. **Violation Logging**: All suspicious activity is logged and visible to the Admin in the interview report.

---

## 📄 License & Credits

Built by **Akshat** for **Blue Planet InfoSolutions**. © 2026 All rights reserved.
