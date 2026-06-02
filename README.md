# AutoTestify 🚀 (AI-Powered API Test Generator)

AutoTestify is a full-stack developer tool designed to automate and accelerate REST API testing. By uploading or pasting an OpenAPI/Swagger specification (JSON or YAML), AutoTestify parses all endpoint routes, generates standard testing suites (happy-path, boundary violations, missing parameters, invalid datatypes), executing those assertions dynamically against a running target API, and reporting structural logs and pass rates in a glassmorphic dashboard interface.

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite SPA) + TypeScript + Vanilla CSS (Custom Design System) + Lucide Icons.
- **Backend**: Node.js + Express + TypeScript + Swagger Parser (`@apidevtools/swagger-parser`) + Axios.
- **Database**: Zero-dependency local JSON file store client.
- **AI Engine**: Google Gemini API (`gemini-1.5-flash`) via the `@google/generative-ai` SDK.
- **Deployment**: Docker, Docker Compose multi-stage configurations.
- **CI/CD**: GitHub Actions workflows.

---

## 📂 Project Structure

```
autotestify/
│
├── frontend/                     # React Single Page App
│   ├── src/
│   │   ├── App.tsx               # Main state controller & panels
│   │   ├── index.css             # Vanilla CSS design tokens & animations
│   │   └── main.tsx              # React mounting root
│   ├── Dockerfile                # Multi-stage nginx server build
│   └── package.json
│
├── backend/                      # Node.js Express REST API
│   ├── src/
│   │   ├── parser/               # Swagger & OpenAPI parsing service
│   │   ├── generator/            # Rule-based & Gemini-based test generators
│   │   ├── runner/               # Axios execution engine & schema assertions
│   │   ├── routes/               # Express endpoints router
│   │   ├── server.ts             # Express HTTP startup configs
│   │   └── db.ts                 # JSON persistence layer
│   ├── Dockerfile                # Multi-stage alpine build configuration
│   └── package.json
│
├── samples/                      # Example specification files
│   └── petstore.json             # Sample spec for easy verification
│
├── .github/workflows/
│   └── ci.yml                    # CI build/test validation workflow
│
├── docker-compose.yml            # Multi-service container orchestration
└── README.md
```

---

## ⚙️ Prerequisites

1. **Node.js**: Version 20.x or higher installed locally.
2. **Docker**: Docker and Docker Compose installed (if running containerized).
3. **Gemini API Key** *(Optional)*: Required to use the AI-assisted test synthesis. Fallback rule-based generation is active automatically if no key is configured.

---

## 🚀 Getting Started

### Option A: Local Dev Execution (Concurrently)

1. **Configure Backend Environment**:
   Create a `.env` file in the `backend/` folder:
   ```env
   PORT=5001
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

2. **Start Backend**:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

---

### Option B: Dockerized Deployment

To spin up the entire application locally inside containers (Frontend on port `80`, Backend on port `5001`):

1. **Configure Environment Variables**:
   Export your Gemini API Key in your shell environment:
   ```bash
   export GEMINI_API_KEY="your_gemini_api_key_here"
   ```

2. **Boot up Docker Compose**:
   From the root folder:
   ```bash
   docker compose up --build
   ```

3. **Access Application**:
   Navigate to `http://localhost` in your browser.

---

## 📖 Step-by-Step Testing Walkthrough

1. **Upload Specification**:
   - Go to the **Upload Spec** panel in the sidebar.
   - Drag and drop or browse the `samples/petstore.json` file.
   - Alternatively, copy and paste the raw JSON spec into the editor text field and click **Parse Specification**.

2. **Configure & Generate Suite**:
   - Review the parsed endpoints shown at the bottom.
   - Choose a suite name (e.g., "Petstore Integration Tests").
   - Toggle **Use Gemini AI for Test Synthesis** (if your API key is configured) or leave it disabled for strict schema rule-based generation.
   - Click **Generate and Save Test Suite**.

3. **Launch Execution**:
   - On the **Dashboard**, find your new suite under *Configured API Test Suites* and click **Run**.
   - A configuration modal will open requesting a *Target Base URL*.
   - If testing against the backend mock, set the target URL to `http://localhost:5001/api` (this will verify the backend's internal health and parser mock routes).
   - Click **Execute Suite**.

4. **Inspect Execution Logs**:
   - You will be redirected to the **Run Details** view.
   - Review live execution reports showing the HTTP methods, paths, and total pass/fail rates.
   - Click on any test case to expand it, displaying full **Request configuration**, **Response payloads**, and **Assertion Failures** (status codes, response latencies, schema violations).
