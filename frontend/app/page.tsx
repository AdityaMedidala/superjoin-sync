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

// --- Icons (Inline for portability) ---
const Icons = {
  Refresh: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Play: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Database: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Link: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>,
  Check: () => <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
  X: () => <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  ArrowRight: () => <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
};

export default function Dashboard() {
  // --- State ---
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [status, setStatus] = useState<"online" | "offline" | "connecting">("connecting");
  const [sqlQuery, setSqlQuery] = useState("UPDATE mytable SET Name = 'Alice Johnson', Age = 28 WHERE id = 2;");
  const [queryResult, setQueryResult] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Ref for auto-scrolling logs
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
          
          // Only update if data actually changed to prevent render thrashing
          setLogs(prev => {
            const newLogs = logsData.logs || [];
            return newLogs.length !== prev.length ? newLogs : prev;
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

  // Auto-scroll to bottom of logs
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
      if (response.ok) {
        setQueryResult(`SUCCESS: ${data.message || 'Query executed successfully'}`);
      } else {
        setQueryResult(`ERROR: ${data.error || 'Query failed'}`);
      }
    } catch (error) {
      setQueryResult(`ERROR: Connection failed`);
    } finally {
      setIsExecuting(false);
    }
  };

  const queueSize = stats?.queue || 0;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-orange-100 selection:text-orange-900">
      
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-gray-900 leading-none">SyncEngine</h1>
                <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider mt-0.5">Enterprise Dashboard</p>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
              <StatusIndicator status={status} />
              <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
              <a
                href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-orange-600 transition-colors shadow-sm"
              >
                <span>Open Sheet</span>
                <Icons.Link />
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* --- KPI Cards --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
            label="Queue Depth" 
            value={queueSize} 
            subtext="Items processing"
            active={queueSize > 0}
          />
          <StatCard 
            label="Total Events" 
            value={logs.length} 
            subtext="Last 60 minutes"
          />
          <StatCard 
            label="System Health" 
            value={status === "online" ? "99.9%" : "Error"} 
            subtext="Uptime status"
            valueColor={status === "online" ? "text-green-600" : "text-red-600"}
          />
        </div>

        {/* --- Main Content Grid --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left: Query Editor (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icons.Database />
                  <span className="text-sm font-semibold text-gray-700">SQL Console</span>
                </div>
                <span className="text-xs text-gray-400 font-mono">PostgreSQL</span>
              </div>
              
              <div className="p-4 space-y-4">
                <div className="relative">
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="w-full h-32 px-3 py-2 text-sm font-mono text-gray-800 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none placeholder-gray-400 leading-relaxed"
                    spellCheck={false}
                    placeholder="Enter SQL Query..."
                  />
                  {/* Subtle 'Update' badge if it's an update query */}
                  {sqlQuery.toUpperCase().startsWith("UPDATE") && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      WRITE OP
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setSqlQuery("")}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium px-2"
                  >
                    Clear
                  </button>
                  <button
                    onClick={executeQuery}
                    disabled={isExecuting || !sqlQuery.trim()}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm transition-all active:scale-[0.98]"
                  >
                    {isExecuting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Icons.Play />
                        <span>Run Query</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Result Area */}
                {queryResult && (
                  <div className={`mt-2 p-3 rounded-md text-xs font-mono border-l-4 ${
                    queryResult.includes("SUCCESS") 
                      ? "bg-green-50 border-green-500 text-green-800" 
                      : "bg-red-50 border-red-500 text-red-800"
                  }`}>
                    {queryResult}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Debug Tools</h3>
              <div className="space-y-2">
                <QuickActionButton 
                  label="Update Row ID:1" 
                  desc="Test single row sync"
                  onClick={() => setSqlQuery("UPDATE mytable SET Age = Age + 1 WHERE id = 1;")} 
                />
                <QuickActionButton 
                  label="Batch Update" 
                  desc="Stress test with 5 rows"
                  onClick={() => setSqlQuery("UPDATE mytable SET Age = Age + 1 WHERE id <= 5;")} 
                />
              </div>
            </div>
          </div>

          {/* Right: Activity Log (8 cols) */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-[600px]">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Activity Stream</h2>
                  <p className="text-sm text-gray-500">Real-time database-to-sheet synchronization events</p>
                </div>
                <div className="flex items-center gap-2">
                   <span className="flex h-2 w-2 relative">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'online' ? 'bg-orange-400' : 'bg-gray-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'online' ? 'bg-orange-500' : 'bg-gray-500'}`}></span>
                    </span>
                    <span className="text-xs font-medium text-gray-500">Live</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                    <div className="p-4 bg-gray-50 rounded-full mb-3">
                       <Icons.Refresh />
                    </div>
                    <p className="text-sm text-gray-500">Waiting for events...</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 sticky top-0 backdrop-blur-sm">
                      <tr>
                        <th className="px-6 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-20">Status</th>
                        <th className="px-6 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Message</th>
                        <th className="px-6 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
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

function StatCard({ label, value, subtext, active = false, valueColor = "text-gray-900" }: any) {
  return (
    <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between hover:border-orange-200 transition-colors group">
      <div className="flex justify-between items-start">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</h3>
        {active && <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
      </div>
      <div className="mt-2">
        <div className={`text-2xl font-bold ${valueColor} group-hover:text-orange-600 transition-colors`}>{value}</div>
        <p className="text-xs text-gray-400 mt-1">{subtext}</p>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const styles = {
    online: "bg-green-100 text-green-700 border-green-200",
    offline: "bg-red-100 text-red-700 border-red-200",
    connecting: "bg-yellow-100 text-yellow-700 border-yellow-200"
  };
  
  const dots = {
    online: "bg-green-500",
    offline: "bg-red-500",
    connecting: "bg-yellow-500"
  };

  // @ts-ignore
  const currentStyle = styles[status] || styles.offline;
  // @ts-ignore
  const currentDot = dots[status] || dots.offline;

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border ${currentStyle}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${currentDot}`} />
      <span className="text-xs font-semibold capitalize">{status}</span>
    </div>
  );
}

function QuickActionButton({ label, desc, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="w-full group flex items-center justify-between p-3 rounded-md bg-gray-50 hover:bg-white hover:shadow-md border border-transparent hover:border-orange-200 transition-all duration-200"
    >
      <div className="text-left">
        <div className="text-sm font-medium text-gray-700 group-hover:text-orange-700">{label}</div>
        <div className="text-[10px] text-gray-400">{desc}</div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all duration-200">
        <Icons.ArrowRight />
      </div>
    </button>
  );
}

function LogEntry({ log }: { log: string }) {
  // Parsing logic to separate status icon from text
  let statusType = "info";
  if (log.includes("✅")) statusType = "success";
  else if (log.includes("❌")) statusType = "error";
  else if (log.includes("📥") || log.includes("⏭️")) statusType = "process";
  else if (log.includes("⚠️")) statusType = "warning";

  const cleanLog = log.replace(/[✅❌📥📤⏭️⚠️🔵🔍✏️]/g, '').trim();
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <tr className="hover:bg-gray-50/80 transition-colors group">
      <td className="px-6 py-3 whitespace-nowrap">
        {statusType === "success" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">Success</span>}
        {statusType === "error" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">Error</span>}
        {statusType === "process" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">Sync</span>}
        {statusType === "warning" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-100">Info</span>}
        {statusType === "info" && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Log</span>}
      </td>
      <td className="px-6 py-3 text-sm text-gray-700 font-mono">
        {cleanLog}
      </td>
      <td className="px-6 py-3 text-xs text-gray-400 text-right whitespace-nowrap font-mono">
        {time}
      </td>
    </tr>
  );
}