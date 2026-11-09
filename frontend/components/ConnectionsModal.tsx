"use client";

import { useEffect, useState, type SubmitEvent } from "react";

type Connection = {
  id: number;
  label: string;
  base_url: string;
  is_valid?: boolean; // Добавляем локальное поле
};

export default function ConnectionsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("http://localhost:11434");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  async function loadAndValidate() {
    const res = await fetch("/api/connections");
    const data = await res.json();
    if (Array.isArray(data)) {
      // Проверяем каждое подключение
      const validated = await Promise.all(data.map(async (c: Connection) => {
        try {
          const check = await fetch(`/api/connections/${c.id}/models`);
          return { ...c, is_valid: check.ok };
        } catch {
          return { ...c, is_valid: false };
        }
      }));
      setConnections(validated);
    }
  }

  async function create(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsAdding(true);
    setError("");

    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, base_url: url }),
      });

      if (!res.ok) throw new Error("Ошибка при сохранении");

      // Проверяем, работает ли
      const newConn = await res.json();
      const check = await fetch(`/api/connections/${newConn.id}/models`);

      if (!check.ok) {
        setError("Подключение добавлено, но сервер Ollama недоступен.");
      } else {
        setLabel("");
        setUrl("http://localhost:11434");
      }

      await loadAndValidate();
    } catch (e) {
      setError("Не удалось добавить подключение.");
    } finally {
      setIsAdding(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Удалить это подключение? Все чаты, связанные с ним, тоже удалятся.")) return;
    await fetch(`/api/connections/${id}`, { method: "DELETE" });
    await loadAndValidate();
  }

  useEffect(() => { if (isOpen) loadAndValidate(); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#171719] border border-neutral-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Подключения</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={create} className="space-y-3 mb-6">
          <input
            className="w-full bg-[#0f0f11] border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-neutral-500"
            placeholder="Название (например, Мой ПК)"
            value={label} onChange={(e) => setLabel(e.target.value)} required
          />
          <input
            className="w-full bg-[#0f0f11] border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-neutral-500"
            placeholder="URL (http://...)"
            value={url} onChange={(e) => setUrl(e.target.value)} required
          />
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button disabled={isAdding} className="w-full bg-white text-black font-medium py-2.5 rounded-lg hover:bg-neutral-200 transition-colors text-sm disabled:opacity-50">
            {isAdding ? "Проверка..." : "Добавить"}
          </button>
        </form>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {connections.map((c) => (
            <div key={c.id} className="flex justify-between items-center bg-[#0f0f11] p-3 rounded-lg border border-neutral-800">
              <div>
                <div className="text-sm font-medium text-white">{c.label}</div>
                <div className="text-xs text-neutral-500 font-mono">{c.base_url}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${c.is_valid ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
                <button onClick={() => remove(c.id)} className="text-neutral-500 hover:text-red-400 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          ))}
          {connections.length === 0 && <div className="text-sm text-neutral-500 text-center py-4">Нет подключений</div>}
        </div>
      </div>
    </div>
  );
}
