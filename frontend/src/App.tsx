import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Trash2, 
  UploadCloud, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  Activity, 
  Layers, 
  Database,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight,
  FileCode,
  Sliders
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

// Interface Definitions
interface TestCase {
  id: string;
  name: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  requestBody?: any;
  assertions: {
    expectedStatus?: number;
    schemaValidation?: boolean;
    durationLessThanMs?: number;
    requiredFields?: string[];
  };
}

interface TestSuite {
  id: string;
  name: string;
  createdAt: string;
  endpointsCount: number;
  spec?: any;
  testCases?: TestCase[];
}

interface TestCaseResult {
  testCaseId: string;
  name: string;
  method: string;
  path: string;
  url: string;
  status: 'passed' | 'failed';
  durationMs: number;
  request: {
    headers: Record<string, string>;
    body: any;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  };
  errors: string[];
}

interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  targetUrl: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  results?: TestCaseResult[];
}

interface Stats {
  totalSuites: number;
  totalRuns: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageDurationMs: number;
  successRate: number;
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'run-details'>('dashboard');
  
  // Dashboard Data State
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalSuites: 0,
    totalRuns: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    averageDurationMs: 0,
    successRate: 0
  });

  // Uploader State
  const [dragActive, setDragActive] = useState(false);
  const [parsedSpec, setParsedSpec] = useState<any>(null);
  const [customSpecText, setCustomSpecText] = useState('');
  const [suiteTitle, setSuiteTitle] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Runner Configuration State
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Active Run Logger State
  const [activeRun, setActiveRun] = useState<TestRun | null>(null);
  
  // Split pane detailed view states (Postman style)
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'headers' | 'params' | 'reqBody' | 'response' | 'assertions'>('assertions');

  // Loading States
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  // Load Dashboard Data
  const loadDashboardData = async () => {
    try {
      setLoadingDashboard(true);
      const [suitesRes, runsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/suites`),
        fetch(`${API_BASE}/runs`),
        fetch(`${API_BASE}/stats`)
      ]);
      
      const suitesData = await suitesRes.json();
      const runsData = await runsRes.json();
      const statsData = await statsRes.json();
      
      setSuites(suitesData);
      setRuns(runsData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await parseFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await parseFile(e.target.files[0]);
    }
  };

  // Upload and Parse Spec
  const parseFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setParsedSpec(null);

    const formData = new FormData();
    formData.append('specFile', file);

    try {
      const res = await fetch(`${API_BASE}/upload-spec`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse specification file');
      
      setParsedSpec(data);
      setSuiteTitle(data.title || 'Parsed Test Suite');
      if (data.servers && data.servers.length > 0) {
        setTargetUrl(data.servers[0]);
      }
    } catch (err: any) {
      setParseError(err.message || 'Parsing failed');
    } finally {
      setIsParsing(false);
    }
  };

  // Parse pasted JSON spec
  const handlePasteParse = async () => {
    if (!customSpecText.trim()) return;
    setIsParsing(true);
    setParseError(null);
    setParsedSpec(null);

    try {
      let parsedObj;
      try {
        parsedObj = JSON.parse(customSpecText);
      } catch {
        throw new Error('Invalid JSON format. Please paste valid OpenAPI JSON spec.');
      }

      const res = await fetch(`${API_BASE}/upload-spec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedObj)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse pasted specification');

      setParsedSpec(data);
      setSuiteTitle(data.title || 'Parsed Test Suite');
      if (data.servers && data.servers.length > 0) {
        setTargetUrl(data.servers[0]);
      }
    } catch (err: any) {
      setParseError(err.message || 'Parsing failed');
    } finally {
      setIsParsing(false);
    }
  };

  // Generate Test Suite
  const handleGenerateSuite = async () => {
    if (!parsedSpec) return;
    setIsGenerating(true);

    try {
      const res = await fetch(`${API_BASE}/suites/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: suiteTitle,
          spec: parsedSpec,
          useAI
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setParsedSpec(null);
      setCustomSpecText('');
      await loadDashboardData();
      setActiveTab('dashboard');
    } catch (err: any) {
      alert(`Error generating suite: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete Suite
  const handleDeleteSuite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this test suite and all associated test runs?')) return;
    try {
      await fetch(`${API_BASE}/suites/${id}`, { method: 'DELETE' });
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to delete suite:', err);
    }
  };

  // Open config to Run Suite
  const openRunConfig = (suiteId: string, defaultUrl: string) => {
    setSelectedSuiteId(suiteId);
    setTargetUrl(defaultUrl || 'http://localhost:8080');
    setShowConfigModal(true);
  };

  // Execute Test Suite
  const handleExecuteSuite = async () => {
    if (!selectedSuiteId || !targetUrl) return;
    setShowConfigModal(false);
    setIsRunning(true);
    setActiveTab('run-details');
    setActiveRun(null);
    setSelectedTestCaseId(null);

    // Initial placeholder run state
    const matchedSuite = suites.find(s => s.id === selectedSuiteId);
    setActiveRun({
      id: 'pending',
      suiteId: selectedSuiteId,
      suiteName: matchedSuite?.name || 'API Test Suite',
      targetUrl,
      status: 'running',
      createdAt: new Date().toISOString(),
      durationMs: 0,
      totalTests: matchedSuite?.endpointsCount || 0,
      passed: 0,
      failed: 0,
      results: []
    });

    try {
      const res = await fetch(`${API_BASE}/runs/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suiteId: selectedSuiteId,
          targetUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');

      setActiveRun(data);
      if (data.results && data.results.length > 0) {
        setSelectedTestCaseId(data.results[0].testCaseId);
        setInspectorTab('assertions');
      }
      loadDashboardData();
    } catch (err: any) {
      alert(`Execution failed: ${err.message}`);
      setIsRunning(false);
    } finally {
      setIsRunning(false);
    }
  };

  // View detailed past run
  const viewRunDetails = async (runId: string) => {
    setActiveTab('run-details');
    setActiveRun(null);
    setSelectedTestCaseId(null);
    try {
      const res = await fetch(`${API_BASE}/runs/${runId}`);
      const data = await res.json();
      setActiveRun(data);
      if (data.results && data.results.length > 0) {
        setSelectedTestCaseId(data.results[0].testCaseId);
        setInspectorTab('assertions');
      }
    } catch (err) {
      console.error('Failed to fetch run details:', err);
    }
  };

  // Find currently selected test result
  const activeResult = activeRun?.results?.find(r => r.testCaseId === selectedTestCaseId);

  // Formatter for JSON responses
  const renderJSON = (obj: any) => {
    if (!obj) return <span className="json-null">null</span>;
    const jsonStr = JSON.stringify(obj, null, 2);
    return (
      <pre className="mono">
        {jsonStr.split('\n').map((line, idx) => {
          let lineElem = <span>{line}</span>;
          if (line.includes(':')) {
            const parts = line.split(':');
            const key = parts[0];
            const val = parts.slice(1).join(':');
            lineElem = (
              <span>
                <span className="json-key">{key}</span>:
                <span className="json-string">{val}</span>
              </span>
            );
          }
          return <div key={idx}>{lineElem}</div>;
        })}
      </pre>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Activity className="nav-icon text-secondary" style={{ width: '22px', height: '22px' }} />
          </div>
          <span className="brand-name">AutoTestify</span>
        </div>

        <nav style={{ flex: 1 }}>
          <ul className="nav-menu">
            <li>
              <button 
                onClick={() => { setActiveTab('dashboard'); loadDashboardData(); }}
                className={`nav-item w-full text-left ${activeTab === 'dashboard' ? 'active' : ''}`}
              >
                <Layers className="nav-icon" />
                <span>Dashboard</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => { setActiveTab('upload'); setParsedSpec(null); setParseError(null); }}
                className={`nav-item w-full text-left ${activeTab === 'upload' ? 'active' : ''}`}
              >
                <UploadCloud className="nav-icon" />
                <span>Upload Spec</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActiveTab('run-details')}
                className={`nav-item w-full text-left ${activeTab === 'run-details' ? 'active' : ''}`}
                disabled={!activeRun}
              >
                <Terminal className="nav-icon" />
                <span>Run Details</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>AutoTestify v1.0</span>
            <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>Open Source</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
            <Database size={10} /> Local Persistence
          </div>
        </div>
      </aside>

      {/* Main Panel wrapper */}
      <main className="main-wrapper">
        <header className="header">
          <div className="header-title">
            {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'upload' && 'Upload OpenAPI / Swagger Spec'}
            {activeTab === 'run-details' && 'Test Execution Workspace'}
          </div>
          <div className="header-actions">
            {isRunning && (
              <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '10px' }}>
                <RefreshCw className="spinner" size={12} /> Executing Tests...
              </span>
            )}
            <button className="btn btn-secondary" onClick={loadDashboardData} title="Refresh data">
              <RefreshCw className="spinner" style={{ animationPlayState: loadingDashboard ? 'running' : 'paused' }} />
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="content-container">
          
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Analytics Metric Cards Grid */}
              <div className="grid-cols-4">
                <div className="glass-card metric-card">
                  <span className="metric-label">Total Suites</span>
                  <span className="metric-value">{stats.totalSuites}</span>
                  <div className="metric-footer">
                    <Database size={12} /> Created API specifications
                  </div>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Total Runs</span>
                  <span className="metric-value">{stats.totalRuns}</span>
                  <div className="metric-footer">
                    <Terminal size={12} /> Suite executions
                  </div>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Success Rate</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="metric-value">{stats.successRate}%</span>
                    {/* SVG circular mini chart */}
                    <svg width="22" height="22" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1F2937"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="4"
                        strokeDasharray={`${stats.successRate}, 100`}
                      />
                    </svg>
                  </div>
                  <div className="metric-footer">
                    <span>Assertion pass rate</span>
                  </div>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Avg Latency</span>
                  <span className="metric-value">{stats.averageDurationMs}ms</span>
                  <div className="metric-footer">
                    <Clock size={12} /> Round-trip response time
                  </div>
                </div>
              </div>

              {/* Main lists */}
              <div className="grid-cols-2">
                
                {/* Suites list */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={16} className="text-secondary" />
                    <span>Configured API Test Suites</span>
                  </h3>
                  
                  {loadingDashboard ? (
                    <div style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>Loading suites...</div>
                  ) : suites.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center', fontSize: '0.85rem' }}>
                      No API specifications uploaded yet. Go to "Upload Spec" to start!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {suites.map(suite => (
                        <div 
                          key={suite.id} 
                          className="glass-card" 
                          style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}
                        >
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{suite.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Endpoints: <span className="text-white font-medium">{suite.endpointsCount}</span> • Created: {new Date(suite.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              onClick={() => openRunConfig(suite.id, suite.spec?.servers?.[0] || '')}
                            >
                              <Play size={10} /> Run
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px' }}
                              onClick={(e) => handleDeleteSuite(suite.id, e)}
                            >
                              <Trash2 size={10} className="text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Runs list */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={16} className="text-secondary" />
                    <span>Recent Test Executions</span>
                  </h3>

                  {loadingDashboard ? (
                    <div style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>Loading executions...</div>
                  ) : runs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center', fontSize: '0.85rem' }}>
                      No test executions recorded. Run a test suite to view results here.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                      {runs.map(run => (
                        <div 
                          key={run.id} 
                          className="glass-card" 
                          style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}
                          onClick={() => viewRunDetails(run.id)}
                        >
                          <div style={{ maxWidth: '70%' }}>
                            <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.suiteName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Target: <span className="mono text-white">{run.targetUrl}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Date: {new Date(run.createdAt).toLocaleString()}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span className={`badge ${run.failed > 0 ? 'badge-error' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                              {run.passed}/{run.totalTests} Passed
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                              Details <ArrowRight size={8} />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* UPLOAD & PARSE SPEC TAB */}
          {activeTab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {!parsedSpec ? (
                /* Two-Column Workspace Layout */
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px', alignItems: 'start' }}>
                  
                  {/* Left Column: Drag & Drop Zone and paste text area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div 
                      className={`upload-zone ${dragActive ? 'dragging' : ''}`}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-picker')?.click()}
                    >
                      <input 
                        id="file-picker" 
                        type="file" 
                        style={{ display: 'none' }} 
                        accept=".json,.yaml,.yml"
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="upload-icon text-secondary" />
                      <div className="upload-text">
                        <p className="upload-title">Drag & drop Swagger/OpenAPI specification</p>
                        <p style={{ marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Supports Swagger 2.0 or OpenAPI 3.x (JSON/YAML)</p>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Browse File</button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <hr style={{ flex: '1', borderColor: 'var(--card-border)' }} />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '600' }}>OR PASTE SPECIFICATION</span>
                      <hr style={{ flex: '1', borderColor: 'var(--card-border)' }} />
                    </div>

                    <div className="glass-card" style={{ padding: '16px' }}>
                      <div className="form-group" style={{ margin: '0' }}>
                        <label className="form-label" style={{ marginBottom: '8px' }}>OpenAPI Spec JSON</label>
                        <textarea
                          className="input-field mono"
                          rows={8}
                          placeholder='Paste raw JSON specification here e.g. { "openapi": "3.0.0", ... }'
                          value={customSpecText}
                          onChange={(e) => setCustomSpecText(e.target.value)}
                          style={{ resize: 'vertical', fontSize: '0.8rem', background: '#07090E' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Execution settings and parser control */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="glass-card" style={{ padding: '20px' }}>
                      <h4 style={{ fontFamily: 'Outfit', fontWeight: '600', fontSize: '0.95rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sliders size={14} className="text-secondary" />
                        <span>SPEC PARSER ACTIONS</span>
                      </h4>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
                        Input an API spec file to extract endpoints and configure automatic integration test case assertions.
                      </div>

                      <button 
                        className="btn btn-primary w-full"
                        onClick={handlePasteParse}
                        disabled={isParsing || !customSpecText.trim()}
                        style={{ height: '38px' }}
                      >
                        {isParsing ? <RefreshCw className="spinner" /> : <Play size={12} />}
                        Parse JSON Specification
                      </button>
                    </div>

                    {parseError && (
                      <div 
                        className="glass-card" 
                        style={{ background: 'var(--color-error-bg)', borderColor: 'rgba(239,68,68,0.2)', color: '#FCA5A5', padding: '16px' }}
                      >
                        <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={14} /> Parsing Failure
                        </div>
                        <p style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>{parseError}</p>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                
                /* Once spec is parsed, show configure and generate view in clean 2-column layout */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '20px', alignItems: 'start' }}>
                    
                    {/* Left: Spec info */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <span className="badge badge-success" style={{ marginBottom: '8px' }}>OpenAPI Spec Parsed</span>
                        <h3 style={{ fontFamily: 'Outfit', fontSize: '1.2rem', fontWeight: '700' }}>{parsedSpec.title}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Version: <span className="text-white">{parsedSpec.version}</span> • Server Base: <span className="mono text-white">{parsedSpec.servers?.[0] || 'none'}</span>
                        </p>
                      </div>
                      <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '10px' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setParsedSpec(null)}>
                          Upload Different Spec
                        </button>
                      </div>
                    </div>

                    {/* Right: Generation configs */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h4 style={{ fontFamily: 'Outfit', fontWeight: '600', fontSize: '0.9rem' }}>
                        Generate Test Suite
                      </h4>

                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Suite Name</label>
                        <input
                          type="text"
                          className="input-field"
                          value={suiteTitle}
                          onChange={(e) => setSuiteTitle(e.target.value)}
                          placeholder="e.g. Petstore Prod Tests"
                          style={{ fontSize: '0.8rem', height: '34px' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            className="toggle-input"
                            checked={useAI}
                            onChange={(e) => setUseAI(e.target.checked)}
                          />
                          <div className="toggle-slider"></div>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={12} className="text-secondary" />
                              <span>Gemini AI Synthesis</span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                              Generates semantic payload constraints using Gemini.
                            </div>
                          </div>
                        </label>
                      </div>

                      <button 
                        className="btn btn-primary w-full"
                        onClick={handleGenerateSuite}
                        disabled={isGenerating || !suiteTitle.trim()}
                        style={{ height: '36px' }}
                      >
                        {isGenerating ? <RefreshCw className="spinner" /> : <Play size={12} />}
                        {isGenerating ? 'Synthesizing Suite...' : 'Generate Suite'}
                      </button>
                    </div>

                  </div>

                  {/* Endpoints List underneath */}
                  <div className="glass-card" style={{ padding: '0' }}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--card-border)' }}>
                      <h4 style={{ fontFamily: 'Outfit', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileCode size={14} className="text-secondary" />
                        <span>Parsed Endpoints ({parsedSpec.endpoints.length})</span>
                      </h4>
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {parsedSpec.endpoints.map((ep: any, idx: number) => (
                        <div key={idx} className="endpoint-item">
                          <div className="endpoint-info">
                            <span className={`method-badge method-${ep.method}`}>{ep.method}</span>
                            <span className="endpoint-path">{ep.path}</span>
                          </div>
                          <span className="endpoint-summary">{ep.summary || ep.description || 'No description'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* RUN LOGS & EXECUTION DETAILS TAB */}
          {activeTab === 'run-details' && (
            <div>
              {activeRun ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Status header card */}
                  <div className="glass-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', fontWeight: '700' }}>{activeRun.suiteName}</h3>
                        <span className={`badge ${activeRun.status === 'running' ? 'badge-warning' : activeRun.failed > 0 ? 'badge-error' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                          {activeRun.status}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Target Server: <span className="mono text-white" style={{ fontSize: '0.75rem' }}>{activeRun.targetUrl}</span>
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Executed: {new Date(activeRun.createdAt).toLocaleString()} • Duration: {activeRun.durationMs}ms
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.35rem', fontWeight: '800', color: activeRun.failed > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {activeRun.passed} / {activeRun.totalTests}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TESTS PASSED</div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {activeRun.status === 'running' && (
                    <div className="progress-bar-container" style={{ margin: '0' }}>
                      <div 
                        className="progress-bar-fill" 
                        style={{ width: `${activeRun.totalTests > 0 ? (activeRun.results!.length / activeRun.totalTests) * 100 : 0}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Split Pane Layout */}
                  <div className="workspace-layout">
                    
                    {/* Left Pane: Test case results tree */}
                    <div className="workspace-sidebar">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>TEST SUITE RUN TREE</span>
                        <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{activeRun.results?.length} cases</span>
                      </div>

                      <div className="workspace-tree">
                        {activeRun.results?.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
                            Waiting for results...
                          </div>
                        ) : (
                          activeRun.results?.map((result) => (
                            <div 
                              key={result.testCaseId}
                              className={`tree-item ${selectedTestCaseId === result.testCaseId ? 'active' : ''}`}
                              onClick={() => setSelectedTestCaseId(result.testCaseId)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '80%' }}>
                                {result.status === 'passed' ? (
                                  <CheckCircle className="text-emerald-400" size={14} style={{ flexShrink: 0 }} />
                                ) : (
                                  <XCircle className="text-red-400" size={14} style={{ flexShrink: 0 }} />
                                )}
                                <div style={{ overflow: 'hidden' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '500', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{result.name}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                    <span className={`method-badge method-${result.method}`} style={{ minWidth: '40px', padding: '1px 3px', fontSize: '0.55rem' }}>{result.method}</span>
                                    <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{result.path}</span>
                                  </div>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{result.durationMs}ms</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Right Pane: Interactive Postman inspection tabs */}
                    <div className="workspace-panel">
                      {activeResult ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          
                          {/* Top endpoint descriptor */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', marginBottom: '12px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={`method-badge method-${activeResult.method}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>{activeResult.method}</span>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '700' }}>{activeResult.name}</h4>
                              </div>
                              <div className="mono text-secondary" style={{ fontSize: '0.75rem', marginTop: '4px', wordBreak: 'break-all' }}>
                                {activeResult.url}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span className={`badge ${activeResult.status === 'passed' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>
                                {activeResult.status}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                                <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                {activeResult.durationMs} ms
                              </span>
                            </div>
                          </div>

                          {/* Postman Sub Tabs */}
                          <div className="tab-bar">
                            <button 
                              className={`tab-btn ${inspectorTab === 'assertions' ? 'active' : ''}`}
                              onClick={() => setInspectorTab('assertions')}
                            >
                              Assertions ({activeResult.errors.length === 0 ? 'Passed' : activeResult.errors.length})
                            </button>
                            <button 
                              className={`tab-btn ${inspectorTab === 'response' ? 'active' : ''}`}
                              onClick={() => setInspectorTab('response')}
                            >
                              Response {activeResult.response ? `(${activeResult.response.status})` : ''}
                            </button>
                            <button 
                              className={`tab-btn ${inspectorTab === 'reqBody' ? 'active' : ''}`}
                              onClick={() => setInspectorTab('reqBody')}
                            >
                              Request Body
                            </button>
                            <button 
                              className={`tab-btn ${inspectorTab === 'headers' ? 'active' : ''}`}
                              onClick={() => setInspectorTab('headers')}
                            >
                              Headers
                            </button>
                          </div>

                          {/* Sub Tab content panels */}
                          <div style={{ flex: 1, overflowY: 'auto' }}>
                            
                            {/* ASSERTIONS PANEL */}
                            {inspectorTab === 'assertions' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '500' }}>
                                  Test suite rules and status evaluations:
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  
                                  {/* Status Assertions */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--card-border)' }}>
                                    {!activeResult.errors.some(e => e.includes('status')) ? (
                                      <CheckCircle className="text-emerald-400" size={14} />
                                    ) : (
                                      <XCircle className="text-red-400" size={14} />
                                    )}
                                    <span>Verify Status Code expectation matches {activeResult.response?.status || 'any'}</span>
                                  </div>

                                  {/* Duration Assertions */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--card-border)' }}>
                                    {activeResult.durationMs < 2000 ? (
                                      <CheckCircle className="text-emerald-400" size={14} />
                                    ) : (
                                      <XCircle className="text-red-400" size={14} />
                                    )}
                                    <span>Benchmark duration response time falls under limit (2000ms)</span>
                                  </div>

                                  {/* JSON Schema validation */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--card-border)' }}>
                                    {!activeResult.errors.some(e => e.toLowerCase().includes('schema')) ? (
                                      <CheckCircle className="text-emerald-400" size={14} />
                                    ) : (
                                      <XCircle className="text-red-400" size={14} />
                                    )}
                                    <span>Validate response parameters against defined OpenAPI Schema</span>
                                  </div>

                                </div>

                                {activeResult.errors.length > 0 && (
                                  <div style={{ marginTop: '16px', background: 'var(--color-error-bg)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                                    <h5 style={{ fontWeight: '600', fontSize: '0.8rem', color: 'var(--color-error)', marginBottom: '6px' }}>
                                      FAILURE TRACE
                                    </h5>
                                    <ul style={{ listStyleType: 'disc', paddingLeft: '16px', fontSize: '0.75rem', color: '#FCA5A5', lineHeight: '1.4' }}>
                                      {activeResult.errors.map((err, errIdx) => (
                                        <li key={errIdx}>{err}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* RESPONSE PANEL */}
                            {inspectorTab === 'response' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {activeResult.response ? (
                                  <div>
                                    <div style={{ display: 'flex', justifyItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status:</span>
                                      <span className={`mono font-bold ${activeResult.response.status >= 400 ? 'text-red-400' : 'text-emerald-400'}`} style={{ fontSize: '0.75rem' }}>
                                        {activeResult.response.status} {activeResult.response.statusText}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>BODY</div>
                                    <div className="json-viewer">{renderJSON(activeResult.response.body)}</div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <XCircle size={14} /> No response received from server.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* REQUEST BODY PANEL */}
                            {inspectorTab === 'reqBody' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>PAYLOAD BODY</div>
                                {activeResult.request.body ? (
                                  <div className="json-viewer">{renderJSON(activeResult.request.body)}</div>
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    This request does not contain a body (e.g. standard GET/DELETE operation).
                                  </div>
                                )}
                              </div>
                            )}

                            {/* HEADERS PANEL */}
                            {inspectorTab === 'headers' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>REQUEST HEADERS</div>
                                  <div className="json-viewer" style={{ maxHeight: '150px' }}>{renderJSON(activeResult.request.headers)}</div>
                                </div>
                                
                                {activeResult.response?.headers && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>RESPONSE HEADERS</div>
                                    <div className="json-viewer" style={{ maxHeight: '150px' }}>{renderJSON(activeResult.response.headers)}</div>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '10px' }}>
                          <Terminal size={32} />
                          <span style={{ fontSize: '0.85rem' }}>Select a test case from the run tree on the left to inspect logs.</span>
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              ) : (
                <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>
                  No execution details selected. Select a past execution run from the dashboard.
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Target URL Run Configuration Modal */}
      {showConfigModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '420px', background: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px' }}>
              Launch Execution Runner
            </h3>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Target Base URL</label>
              <input
                type="text"
                className="input-field"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="e.g. http://localhost:8080"
                style={{ fontSize: '0.85rem', height: '36px' }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.3' }}>
                All endpoints will execute sequentially against this host environment.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setShowConfigModal(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                onClick={handleExecuteSuite}
                disabled={!targetUrl.trim()}
              >
                <Play size={10} /> Launch Run
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
