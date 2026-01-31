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

// --- Icons ---
const Icons = {
  Database: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Link: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  Lightning: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Layers: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  Code: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  Spinner: () => <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
  Zap: () => <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>,
  Shield: () => <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>,
};

export default function Dashboard() {
  // --- State ---
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [status, setStatus] = useState<"online" | "offline" | "connecting">("connecting");
  
  // SQL State
  const [sqlQuery, setSqlQuery] = useState("UPDATE mytable SET Age = 30 WHERE id = 1;");
  const [queryResult, setQueryResult] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Test State
  const [loadingTest, setLoadingTest] = useState("");
  
  const logsEndRef = useRef<HTMLTableRowElement>(null);

  // 🔴 IMPORTANT: Ensure this matches your backend URL
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
    const interval = setInterval(fetchData, 1000); // Fast polling
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

  const runTest = async (endpoint: string, name: string) => {
    setLoadingTest(name);
    try {
      await fetch(`${API}${endpoint}`, { method: 'POST' });
    } catch { 
      setQueryResult("ERROR: Failed to trigger test"); 
    }
    setTimeout(() => setLoadingTest(""), 1000);
  };

  const queueSize = stats?.queue || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 font-sans text-white">
      
      {/* Background */}
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.2) 2%, transparent 0%)`,
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
                  SuperSync Monitor
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 transition-all"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Controls */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. SQL Console */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icons.Code />
                  <h2 className="font-semibold text-white">SQL Console</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="relative">
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="w-full h-32 bg-slate-950 border border-white/10 rounded-xl p-4 font-mono text-sm text-blue-300 focus:outline-none focus:border-blue-500/50 resize-none"
                    placeholder="Enter SQL query..."
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                    MySQL
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Use this to simulate DB changes
                  </div>
                  <button
                    onClick={executeQuery}
                    disabled={isExecuting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExecuting ? <Icons.Spinner /> : "Run Query"}
                  </button>
                </div>

                {queryResult && (
                  <div className={`p-4 rounded-xl text-sm font-mono border ${
                    queryResult.startsWith("ERROR") 
                      ? "bg-red-500/10 border-red-500/20 text-red-300" 
                      : "bg-green-500/10 border-green-500/20 text-green-300"
                  }`}>
                    {queryResult}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Stress Testing Zone (NEW) */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden p-6 space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Icons.Zap />
                  <h2 className="font-semibold text-lg">Stress Testing Zone</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => runTest('/test/chaos', 'chaos')}
                    disabled={!!loadingTest}
                    className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 transition-all text-left"
                  >
                    <div className="relative z-10">
                      <div className="font-bold">💥 Chaos Mode</div>
                      <div className="text-xs text-blue-100 mt-1">20 parallel users</div>
                    </div>
                    {loadingTest === 'chaos' && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                  </button>

                  <button
                    onClick={() => runTest('/test/deduplication', 'dedup')}
                    disabled={!!loadingTest}
                    className="group relative overflow-hidden p-4 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all text-left"
                  >
                    <div className="relative z-10">
                      <div className="font-bold">🛡️ Dedup Test</div>
                      <div className="text-xs text-emerald-100 mt-1">10 duplicate events</div>
                    </div>
                    {loadingTest === 'dedup' && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                  </button>
                </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Logs */}
          <div className="lg:col-span-7">
             <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden flex flex-col h-[750px]">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                <h2 className="font-semibold text-white">Live System Logs</h2>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Realtime
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log, i) => (
                      <LogItem key={i} log={log} />
                    ))}
                    <tr ref={logsEndRef} />
                  </tbody>
                </table>
                
                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                    <Icons.Spinner />
                    <p>Waiting for logs...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

// --- Subcomponents ---

function StatusIndicator({ status }: { status: string }) {
  const colors = {
    online: "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]",
    offline: "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]",
    connecting: "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
      <div className={`w-2 h-2 rounded-full transition-all duration-500 ${colors[status as keyof typeof colors]}`} />
      <span className="text-xs font-medium uppercase tracking-wider text-slate-300">
        {status}
      </span>
    </div>
  );
}

function StatCard({ label, value, subtext, icon, gradient, active = false }: any) {
  return (
    <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-all duration-300">
      <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity`}>
        {icon}
      </div>
      <div className="relative z-10">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-4xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
            {value}
          </span>
          {active && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">{subtext}</p>
      </div>
    </div>
  );
}

function LogItem({ log }: { log: string }) {
  let statusColor = "bg-slate-500/20 text-slate-300 border-slate-500/30";
  let statusType = "info";

  if (log.includes("✅") || log.includes("🚀") || log.includes("Auto-injected")) {
    statusType = "success";
    statusColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  } else if (log.includes("❌") || log.includes("Error")) {
    statusType = "error";
    statusColor = "bg-rose-500/20 text-rose-300 border-rose-500/30";
  } else if (log.includes("⏭️")) {
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
          {statusType.toUpperCase()}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
        {time}
      </td>
      <td className="px-6 py-4 text-sm text-slate-300 font-mono break-all">
        {message}
      </td>
    </tr>
  );
}