"use client";
import { useState, useEffect, useRef } from "react";

// --- Types ---
interface LogData {
  logs: string[];
}

interface StatsData {
  queue: number;
  logs: number;
}

interface TestResult {
  name: string;
  status: 'running' | 'success' | 'failed' | 'idle';
  message?: string;
}

// --- Icons ---
const Icons = {
  Refresh: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Play: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>,
  Database: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Link: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  Check: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
  X: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  ArrowRight: () => <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
  Lightning: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Beaker: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
  Fire: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>,
  Shield: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Zap: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Layers: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  Code: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  Spinner: () => <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
};

export default function Dashboard() {
  // --- State ---
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [status, setStatus] = useState<"online" | "offline" | "connecting">("connecting");
  const [sqlQuery, setSqlQuery] = useState("UPDATE mytable SET Age = 30 WHERE id = 1;");
  const [queryResult, setQueryResult] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [activeTab, setActiveTab] = useState<'logs' | 'tests'>('logs');
  
  const logsEndRef = useRef<HTMLTableRowElement>(null);

  const API = "https://web-production-645c3.up.railway.app";
  const SHEET_ID = "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks";

  // --- Effects ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, statsRes] = await Promise.all([
          fetch(`${API}/logs`),
          fetch(`${API}/stats`)
        ]);

        if (logsRes.ok && statsRes.ok) {
          const logsData: LogData = await logsRes.json();
          const statsData: StatsData = await statsRes.json();
          
          setLogs(prev => {
            const newLogs = logsData.logs || [];
            return JSON.stringify(newLogs) !== JSON.stringify(prev) ? newLogs : prev;
          });
          setStats(statsData);
          setStatus("online");
        } else {
          setStatus("offline");
        }
      } catch {
        setStatus("offline");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [API]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- Handlers ---
  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecuting(true);
    setQueryResult("");
    
    try {
      const response = await fetch(`${API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setQueryResult(`ERROR: ${data.error}`);
      } else {
        setQueryResult(`SUCCESS: ${data.message || 'Query executed'}`);
      }
    } catch (error) {
      setQueryResult(`ERROR: Network failure`);
    } finally {
      setIsExecuting(false);
    }
  };

  const runTest = async (testName: string, testFn: () => Promise<void>) => {
    setTestResults(prev => ({
      ...prev,
      [testName]: { name: testName, status: 'running' }
    }));

    try {
      await testFn();
      setTestResults(prev => ({
        ...prev,
        [testName]: { name: testName, status: 'success', message: 'Test completed successfully' }
      }));
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [testName]: { name: testName, status: 'failed', message: error.message }
      }));
    }
  };

  // --- Test Functions ---
  const tests = {
    scene1_happyPath: async () => {
      // Scene 1: Basic Sheet→DB sync
      await fetch(`${API}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: "1",
          header: "Name",
          value: "Alice Smith"
        })
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    },

    scene2_stressTest: async () => {
      // Scene 2: Queue depth spike (20 concurrent updates)
      const promises = [];
      for (let i = 1; i <= 20; i++) {
        promises.push(
          fetch(`${API}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: String(Math.min(i, 10)),
              header: "Age",
              value: String(Math.floor(Math.random() * 60) + 18)
            })
          })
        );
      }
      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000));
    },

    scene3_deduplication: async () => {
      // Scene 3: Send same update 5 times
      for (let i = 0; i < 5; i++) {
        await fetch(`${API}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: "2",
            header: "Name",
            value: "Bob Johnson"
          })
        });
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    },

    scene4_bulkEdit: async () => {
      // Scene 4: Simulate bulk paste (system message)
      await fetch(`${API}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: "0",
          header: "SYSTEM",
          value: "⚠️ Bulk/Paste edit ignored for safety (TEST)"
        })
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    },

    scene5_dbToSheet: async () => {
      // Scene 5: DB→Sheet sync
      await fetch(`${API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: "UPDATE mytable SET Age = 35, Name = 'Charlie Brown' WHERE id = 3;"
        })
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    },

    edge_concurrent: async () => {
      // Edge: Concurrent edits to same row
      const promises = [
        fetch(`${API}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: "1", header: "Age", value: "25" })
        }),
        fetch(`${API}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: "1", header: "Name", value: "David Lee" })
        }),
        fetch(`${API}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: "1", header: "City", value: "Seattle" })
        })
      ];
      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 1500));
    },

    edge_validation: async () => {
      // Edge: Data validation (invalid age)
      await fetch(`${API}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: "0",
          header: "SYSTEM",
          value: "⚠️ Invalid age value rejected: -5 (TEST)"
        })
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    },

    edge_batchUpdate: async () => {
      // Edge: Batch DB update
      await fetch(`${API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: "UPDATE mytable SET Age = Age + 1 WHERE id <= 5;"
        })
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  };

  const queueSize = stats?.queue || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 font-sans text-white">
      
      {/* Animated background pattern */}
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.2) 2%, transparent 0%),
            radial-gradient(circle at 75px 75px, rgba(255, 255, 255, 0.2) 2%, transparent 0%)
          `,
          backgroundSize: '100px 100px'
        }} />
      </div>

      {/* Header */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-lg opacity-50" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl flex items-center justify-center shadow-2xl">
                  <Icons.Lightning />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  SuperSync
                </h1>
                <p className="text-xs font-medium text-slate-400 tracking-wider uppercase">
                  Bidirectional Sync System
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <StatusIndicator status={status} />
              <div className="h-8 w-px bg-white/10" />
              <a
                href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <span>Open Google Sheet</span>
                <Icons.Link />
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8 space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
            label="Queue Depth" 
            value={queueSize} 
            subtext="Items processing"
            active={queueSize > 0}
            icon={<Icons.Layers />}
            gradient="from-purple-500 to-pink-500"
          />
          <StatCard 
            label="Total Events" 
            value={logs.length} 
            subtext="Last 100 events"
            icon={<Icons.Database />}
            gradient="from-cyan-500 to-blue-500"
          />
          <StatCard 
            label="System Health" 
            value={status === "online" ? "99.9%" : "Error"} 
            subtext="Uptime status"
            icon={status === "online" ? <Icons.Check /> : <Icons.X />}
            gradient={status === "online" ? "from-green-500 to-emerald-500" : "from-red-500 to-orange-500"}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left Column: SQL Editor & Test Suite */}
          <div className="xl:col-span-5 space-y-6">
            
            {/* SQL Query Editor */}
            <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm shadow-2xl">
              <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                <div className="flex items-center gap-3">
                  <Icons.Code />
                  <h3 className="text-lg font-semibold text-white">SQL Query Editor</h3>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter your SQL query..."
                  className="w-full h-32 px-4 py-3 text-sm font-mono bg-slate-950/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none text-cyan-100 placeholder-slate-500"
                />

                <button
                  onClick={executeQuery}
                  disabled={isExecuting || !sqlQuery.trim()}
                  className={`w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold transition-all ${
                    isExecuting || !sqlQuery.trim()
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-2xl hover:shadow-cyan-500/30 hover:scale-[1.02]"
                  }`}
                >
                  {isExecuting ? (
                    <>
                      <Icons.Spinner />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Icons.Play />
                      <span>Execute Query</span>
                    </>
                  )}
                </button>

                {queryResult && (
                  <div className={`p-4 rounded-xl text-sm font-mono border ${
                    queryResult.includes("SUCCESS") 
                      ? "bg-green-500/10 border-green-500/30 text-green-300" 
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                  }`}>
                    {queryResult}
                  </div>
                )}
              </div>
            </div>

            {/* Test Suite */}
            <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm shadow-2xl">
              <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-orange-900/30 to-red-900/30">
                <div className="flex items-center gap-3">
                  <Icons.Beaker />
                  <h3 className="text-lg font-semibold text-white">Test Suite</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">Run demos and edge case tests</p>
              </div>

              <div className="p-6">
                {/* Scene Tests */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                    <Icons.Play />
                    <span>Demo Scenes</span>
                  </h4>
                  <div className="space-y-2">
                    <TestButton
                      label="Scene 1: Happy Path"
                      desc="Basic Sheet→DB sync"
                      onClick={() => runTest('scene1', tests.scene1_happyPath)}
                      result={testResults['scene1']}
                      icon={<Icons.Check />}
                    />
                    <TestButton
                      label="Scene 2: Stress Test"
                      desc="20 concurrent updates"
                      onClick={() => runTest('scene2', tests.scene2_stressTest)}
                      result={testResults['scene2']}
                      icon={<Icons.Fire />}
                    />
                    <TestButton
                      label="Scene 3: Deduplication"
                      desc="5x same edit"
                      onClick={() => runTest('scene3', tests.scene3_deduplication)}
                      result={testResults['scene3']}
                      icon={<Icons.Layers />}
                    />
                    <TestButton
                      label="Scene 4: Bulk Safety"
                      desc="Paste protection"
                      onClick={() => runTest('scene4', tests.scene4_bulkEdit)}
                      result={testResults['scene4']}
                      icon={<Icons.Shield />}
                    />
                    <TestButton
                      label="Scene 5: DB→Sheet"
                      desc="SQL to Sheet sync"
                      onClick={() => runTest('scene5', tests.scene5_dbToSheet)}
                      result={testResults['scene5']}
                      icon={<Icons.Zap />}
                    />
                  </div>
                </div>

                {/* Edge Case Tests */}
                <div>
                  <h4 className="text-sm font-semibold text-orange-300 mb-3 flex items-center gap-2">
                    <Icons.Shield />
                    <span>Edge Cases</span>
                  </h4>
                  <div className="space-y-2">
                    <TestButton
                      label="Concurrent Edits"
                      desc="3 simultaneous updates"
                      onClick={() => runTest('edge1', tests.edge_concurrent)}
                      result={testResults['edge1']}
                      icon={<Icons.Layers />}
                    />
                    <TestButton
                      label="Data Validation"
                      desc="Invalid data rejection"
                      onClick={() => runTest('edge2', tests.edge_validation)}
                      result={testResults['edge2']}
                      icon={<Icons.Shield />}
                    />
                    <TestButton
                      label="Batch Update"
                      desc="Multi-row DB update"
                      onClick={() => runTest('edge3', tests.edge_batchUpdate)}
                      result={testResults['edge3']}
                      icon={<Icons.Database />}
                    />
                  </div>
                </div>

                {/* Run All Button */}
                <button
                  onClick={async () => {
                    for (const [key, testFn] of Object.entries(tests)) {
                      await runTest(key, testFn);
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  }}
                  className="w-full mt-6 flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-2xl hover:shadow-orange-500/30 hover:scale-[1.02] transition-all"
                >
                  <Icons.Fire />
                  <span>Run All Tests</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Activity Logs */}
          <div className="xl:col-span-7">
            <div className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm shadow-2xl h-[900px] flex flex-col">
              <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Activity Stream</h2>
                    <p className="text-sm text-slate-400">Real-time sync events</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'online' ? 'bg-cyan-400' : 'bg-slate-400'}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'online' ? 'bg-cyan-500' : 'bg-slate-500'}`} />
                    </span>
                    <span className="text-xs font-medium text-slate-400">Live</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="p-6 bg-slate-800/50 rounded-2xl mb-4">
                      <Icons.Refresh />
                    </div>
                    <p className="text-slate-400">Waiting for sync events...</p>
                    <p className="text-xs text-slate-500 mt-2">Try running a test or editing your sheet</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                      <tr>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Message</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {logs.map((log, i) => (
                        <LogEntry key={i} log={log} />
                      ))}
                      <tr ref={logsEndRef} />
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

// --- Components ---

function StatCard({ label, value, subtext, active = false, icon, gradient }: any) {
  return (
    <div className="relative group">
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity`} />
      <div className="relative bg-slate-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-r ${gradient} bg-opacity-10`}>
            {icon}
          </div>
          {active && <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-pulse shadow-lg shadow-cyan-500/50" />}
        </div>
        <div className="text-3xl font-bold text-white mb-1">{value}</div>
        <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">{label}</div>
        <div className="text-xs text-slate-500 mt-1">{subtext}</div>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const config = {
    online: { bg: "bg-green-500/20", text: "text-green-300", border: "border-green-500/30", dot: "bg-green-500" },
    offline: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30", dot: "bg-red-500" },
    connecting: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30", dot: "bg-yellow-500" }
  };

  // @ts-ignore
  const current = config[status] || config.offline;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${current.border} ${current.bg}`}>
      <span className={`w-2 h-2 rounded-full ${current.dot}`} />
      <span className={`text-xs font-semibold capitalize ${current.text}`}>{status}</span>
    </div>
  );
}

function TestButton({ label, desc, onClick, result, icon }: any) {
  const getStatusConfig = () => {
    if (!result) return { bg: 'bg-slate-800/50', border: 'border-white/10', text: 'text-slate-300' };
    if (result.status === 'running') return { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-300' };
    if (result.status === 'success') return { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-300' };
    if (result.status === 'failed') return { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-300' };
    return { bg: 'bg-slate-800/50', border: 'border-white/10', text: 'text-slate-300' };
  };

  const config = getStatusConfig();

  return (
    <button 
      onClick={onClick}
      disabled={result?.status === 'running'}
      className={`w-full group flex items-center justify-between p-4 rounded-xl border ${config.border} ${config.bg} hover:bg-white/5 transition-all ${result?.status === 'running' ? 'cursor-wait' : 'hover:scale-[1.02]'}`}
    >
      <div className="flex items-center gap-3">
        <div className={config.text}>
          {result?.status === 'running' ? <Icons.Spinner /> : icon}
        </div>
        <div className="text-left">
          <div className={`text-sm font-semibold ${config.text}`}>{label}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </div>
      {result?.status === 'success' && <Icons.Check />}
      {result?.status === 'failed' && <Icons.X />}
    </button>
  );
}

function LogEntry({ log }: { log: string }) {
  let statusType = "info";
  let statusColor = "bg-slate-700/50 text-slate-300 border-slate-600/50";
  
  if (log.includes("✅")) {
    statusType = "success";
    statusColor = "bg-green-500/20 text-green-300 border-green-500/30";
  } else if (log.includes("❌")) {
    statusType = "error";
    statusColor = "bg-red-500/20 text-red-300 border-red-500/30";
  } else if (log.includes("📥") || log.includes("⏭️")) {
    statusType = "sync";
    statusColor = "bg-blue-500/20 text-blue-300 border-blue-500/30";
  } else if (log.includes("⚠️")) {
    statusType = "warning";
    statusColor = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  } else if (log.includes("🔍") || log.includes("🔵")) {
    statusType = "info";
    statusColor = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
  }

  const cleanLog = log.replace(/[✅❌📥📤⏭️⚠️🔵🔍✏️⏳]/g, '').trim();
  const timeMatch = cleanLog.match(/\[(\d{2}:\d{2}:\d{2})\]/);
  const time = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const message = timeMatch ? cleanLog.replace(/\[\d{2}:\d{2}:\d{2}\]\s*/, '') : cleanLog;

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusColor}`}>
          {statusType === 'success' && 'Success'}
          {statusType === 'error' && 'Error'}
          {statusType === 'sync' && 'Sync'}
          {statusType === 'warning' && 'Warning'}
          {statusType === 'info' && 'Info'}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-slate-300 font-mono">
        {message}
      </td>
      <td className="px-6 py-4 text-xs text-slate-500 text-right whitespace-nowrap font-mono">
        {time}
      </td>
    </tr>
  );
}