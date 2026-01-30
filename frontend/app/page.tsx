"use client";
import { useState, useEffect } from "react";
import axios from "axios";

export default function Home() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState("🔴 Connecting...");

  // PASTE YOUR RAILWAY URL HERE (No trailing slash)
  const BACKEND_URL = "https://web-production-645c3.up.railway.app";

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/logs`);
        setLogs(res.data.logs);
        setStatus("🟢 System Online");
      } catch (error) {
        setStatus("🔴 Backend Unreachable");
      }
    };

    // Poll every 2 seconds
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10 font-mono">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-blue-400">⚡ Superjoin Sync Engine</h1>
        <div className="flex items-center gap-4 mb-8">
          <span className="px-3 py-1 bg-gray-800 rounded border border-gray-700">
            {status}
          </span>
          <span className="text-gray-400 text-sm">Live Bi-Directional Sync</span>
        </div>

        <div className="bg-black border border-gray-800 rounded-lg p-6 shadow-2xl">
          <h2 className="text-xl mb-4 border-b border-gray-800 pb-2">Live Transaction Logs</h2>
          <div className="space-y-2 h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-600 italic">Waiting for updates...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-green-500">➜</span>
                  <span className="{log.includes('Error') ? 'text-red-400' : 'text-gray-300'}">
                    {log}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="mt-8 text-center text-gray-500 text-xs">
          Built for Superjoin Assignment • Deployed on Vercel & Railway
        </div>
      </div>
    </div>
  );
}