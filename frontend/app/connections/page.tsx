"use client";

import { useEffect, useState, type SubmitEvent } from "react";

type Connection = {
  id: number;
  label: string;
  base_url: string;
  created_at: string;
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("http://localhost:11434");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/connections");
    const data = await res.json();
    if (Array.isArray(data)) setConnections(data);
  }

  async function create(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, base_url: url }),
    });
    setLabel("");
    await load();
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        {/* Заголовок */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Подключения</h1>
          <p className="text-neutral-400 mt-2">
            Управляйте инстансами Ollama, к которым будет подключаться интерфейс.
          </p>
        </div>

        {/* Форма */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-10 shadow-lg">
          <form onSubmit={create} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-neutral-400 mb-1">Название</label>
              <input
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all"
                placeholder="Например, Домашний ПК"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            <div className="flex-[2] w-full">
              <label className="block text-sm font-medium text-neutral-400 mb-1">URL сервера</label>
              <input
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all"
                placeholder="http://localhost:11434"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <button
              disabled={loading}
              className="bg-white text-black font-medium px-6 py-2.5 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 h-[46px] w-full md:w-auto"
            >
              {loading ? "..." : "Добавить"}
            </button>
          </form>
        </div>

        {/* Список */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-neutral-300 mb-4">Ваши серверы</h2>

          {connections.length === 0 ? (
            <div className="text-center py-12 border border-neutral-800 border-dashed rounded-xl text-neutral-500">
              Пока нет добавленных подключений.
            </div>
          ) : (
            connections.map((c) => (
              <div
                key={c.id}
                className="group flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors"
              >
                <div>
                  <div className="font-medium text-neutral-200">{c.label}</div>
                  <div className="text-sm text-neutral-500 font-mono mt-0.5">{c.base_url}</div>
                </div>
                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
