"use client";
import { useState, useEffect } from "react";

// --- TYPES ---
interface LogData {
  logs: string[];
}

interface StatsData {
  queue_size: number;
  logs_count: number;
}

// --- MAIN COMPONENT ---
export default function Dashboard() {
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [status, setStatus] = useState("🔴 Connecting...");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [testRunning, setTestRunning] = useState(false);

  // Your Railway backend URL
  const API = process.env.NEXT_PUBLIC_API_URL || "https://web-production-645c3.up.railway.app";
  const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID || "1bM61VLxcWdg3HaNgc2RkPLL-hm2S-BJ6Jo9lX4Qv1ks";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, statsRes] = await Promise.all([
          fetch(`${API}/logs`),
          fetch(`${API}/stats`)
        ]);

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData.logs || []);
          setStatus("🟢 System Online");
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (error) {
        setStatus("🔴 Backend Offline");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [API]);

  // Manual test trigger
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runTest = async (testType: string) => {
    setTestRunning(true);
    try {
      await fetch(`${API}/test/${testType}`, { method: 'POST' });
    } catch (error) {
      console.error('Test failed:', error);
    }
    setTestRunning(false);
  };

  const queueSize = stats?.queue_size || 0;
  const isProcessing = queueSize > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                ⚡ Superjoin Sync Engine
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Live 2-Way Sync • Google Sheets ↔️ MySQL
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Queue Depth"
            value={queueSize}
            subtitle={isProcessing ? "Processing..." : "Idle"}
            icon="📊"
            color={isProcessing ? "blue" : "gray"}
            pulse={isProcessing}
          />
          
          <StatCard
            title="Total Logs"
            value={logs.length}
            subtitle="Recent activity"
            icon="📝"
            color="purple"
          />
          
          <StatCard
            title="Sync Status"
            value={status.includes("Online") ? "Active" : "Offline"}
            subtitle="Real-time monitoring"
            icon="🔄"
            color={status.includes("Online") ? "green" : "red"}
            pulse={status.includes("Online")}
          />
        </div>

        {/* Test Controls */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            🧪 Test Controls
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TestButton
              onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, '_blank')}
              disabled={false}
              icon="📊"
              title="Open Google Sheet"
              description="Edit cells to test Sheet→DB"
            />
            
            <TestButton
              onClick={() => alert('Run this in MySQL:\n\nUPDATE mytable SET Name = "Test" WHERE id = 1;')}
              disabled={false}
              icon="🗄️"
              title="Test DB→Sheet"
              description="Copy SQL command"
            />
            
            <TestButton
              onClick={() => alert('Open Sheet in 5 tabs and edit different cells rapidly to test multiplayer mode!')}
              disabled={false}
              icon="👥"
              title="Multiplayer Test"
              description="Instructions for testing"
            />
          </div>
        </div>

        {/* Queue Visualizer */}
        {isProcessing && (
          <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="font-semibold text-blue-400">
                  Queue Processing
                </span>
              </div>
              <span className="text-sm text-slate-400">
                {queueSize} items
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full transition-all duration-500 animate-pulse"
                style={{
                  width: `${Math.min((queueSize / 10) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Live Logs */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                📡 Live Activity Feed
              </h2>
              <span className="text-sm text-slate-400">
                Updates every 2s
              </span>
            </div>
          </div>

          <div className="p-4 bg-black/30 h-[500px] overflow-y-auto custom-scrollbar">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="text-4xl mb-4">👀</div>
                <p className="text-center">
                  Waiting for sync events...<br />
                  <span className="text-sm">Edit a cell in Google Sheets to see activity</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <LogEntry key={i} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* How to Demo Section */}
        <div className="mt-8 bg-slate-800/30 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            🎬 Demo Guide
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DemoStep
              number="1"
              title="Test Sheet → DB"
              description="Open Google Sheet and edit any cell. Watch this dashboard for the log entry."
            />
            <DemoStep
              number="2"
              title="Test DB → Sheet"
              description="Run SQL: UPDATE mytable SET Name='Test' WHERE id=1; Check Sheet updates in ~3 seconds."
            />
            <DemoStep
              number="3"
              title="Test Multiplayer"
              description="Open Sheet in 5 browser tabs. Edit different cells rapidly. Queue builds up, processes smoothly."
            />
            <DemoStep
              number="4"
              title="Test Deduplication"
              description="Edit same cell twice with same value. Second edit is skipped (check logs)."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>Built for Superjoin Assignment</p>
          <p className="text-xs mt-1">
            FastAPI • MySQL • Redis • Google Sheets API • Next.js
          </p>
        </div>
      </div>

      {/* Scrollbar Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
}

// --- SUB-COMPONENTS ---

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const isOnline = status.includes("Online");
  
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
      isOnline 
        ? "bg-green-500/10 border-green-500/30 text-green-400" 
        : "bg-red-500/10 border-red-500/30 text-red-400"
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"
      }`}></div>
      <span className="text-sm font-medium">
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}

// Fixed the "Element implicitly has 'any' type" error here
// by defining strict keys for colors
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  color: "blue" | "purple" | "green" | "red" | "gray";
  pulse?: boolean;
}

function StatCard({ title, value, subtitle, icon, color, pulse }: StatCardProps) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
    purple: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
    green: "from-green-500/20 to-green-600/20 border-green-500/30",
    red: "from-red-500/20 to-red-600/20 border-red-500/30",
    gray: "from-slate-500/20 to-slate-600/20 border-slate-500/30",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-6 ${pulse ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm text-slate-400 mb-1">{title}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

interface TestButtonProps {
  onClick: () => void;
  disabled: boolean;
  icon: string;
  title: string;
  description: string;
}

function TestButton({ onClick, disabled, icon, title, description }: TestButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-2 p-4 rounded-lg bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="text-2xl">{icon}</div>
      <div className="text-left">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-slate-400 mt-1">{description}</div>
      </div>
    </button>
  );
}

interface LogEntryProps {
  log: string;
}

function LogEntry({ log }: LogEntryProps) {
  let icon = "•";
  let colorClass = "text-slate-400";

  if (log.includes("✅")) {
    icon = "✅";
    colorClass = "text-green-400";
  } else if (log.includes("❌")) {
    icon = "❌";
    colorClass = "text-red-400";
  } else if (log.includes("📥")) {
    icon = "📥";
    colorClass = "text-blue-400";
  } else if (log.includes("⏭️")) {
    icon = "⏭️";
    colorClass = "text-slate-500";
  } else if (log.includes("⚠️")) {
    icon = "⚠️";
    colorClass = "text-yellow-400";
  }

  return (
    <div className="flex gap-3 text-sm py-2 px-3 rounded hover:bg-slate-800/50 transition-colors">
      <span className="flex-shrink-0 text-lg leading-none">{icon}</span>
      <span className={`${colorClass} font-mono text-xs leading-relaxed`}>
        {log}
      </span>
    </div>
  );
}

interface DemoStepProps {
  number: string;
  title: string;
  description: string;
}

function DemoStep({ number, title, description }: DemoStepProps) {
  return (
    <div className="flex gap-3 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
        {number}
      </div>
      <div>
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
    </div>
  );
}