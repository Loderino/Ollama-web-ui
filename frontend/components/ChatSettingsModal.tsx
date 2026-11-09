"use client";

import { useEffect, useState } from "react";
import type { Chat } from "../app/types";

type Connection = { id: number; label: string; base_url: string };
type Model = {
  name: string;
  details: { parameter_size: string };
  connectionId: number;
};

export default function ChatSettingsModal({
  isOpen,
  onClose,
  chat,
  onSaveSettings
}: {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  onSaveSettings: (settings: Partial<Chat>) => Promise<void>;
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(chat.model_name || "");

  const [temperature, setTemperature] = useState(chat.temperature ?? 0.7);
  const [topK, setTopK] = useState(chat.top_k ?? 40);
  const [topP, setTopP] = useState(chat.top_p ?? 0.9);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Загрузка моделей со всех подключений
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);

    async function loadAllModels() {
      try {
        const res = await fetch("/api/connections");
        const conns: Connection[] = await res.json();
        let allModels: Model[] = [];

        for (const conn of conns) {
          try {
            const mRes = await fetch(`/api/connections/${conn.id}/models`);
            if (mRes.ok) {
              const data = await mRes.json();
              const withConn = data.models.map((m: any) => ({
                ...m,
                connectionId: conn.id
              }));
              allModels = [...allModels, ...withConn];
            }
          } catch (e) { /* Игнорируем упавшие подключения */ }
        }
        setModels(allModels);
      } catch (e) {
        console.error("Failed to load models");
      } finally {
        setIsLoading(false);
      }
    }

    loadAllModels();
  }, [isOpen]);

  const save = async () => {
    setIsSaving(true);
    const selectedModel = models.find(m => m.name === model);

    const settings = {
      model_name: model || null,
      connection_id: selectedModel?.connectionId || null,
      temperature,
      top_k: topK,
      top_p: topP,
    };

    try {
      await onSaveSettings(settings);
      onClose();
    } catch (e) {
      alert("Ошибка сохранения настроек");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#171719] border border-neutral-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Настройки чата</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-5">
          {/* Выбор модели */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Модель</label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-[#0f0f11] border border-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-500 cursor-pointer disabled:opacity-50"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isLoading}
              >
                <option value="" disabled>
                  {isLoading ? "Загрузка моделей..." : "Выберите модель"}
                </option>
                {models.map((m, idx) => (
                  <option key={`${m.connectionId}-${m.name}-${idx}`} value={m.name}>
                    {m.name} ({m.details.parameter_size})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            </div>
            {models.length === 0 && !isLoading && (
              <p className="text-xs text-red-400 mt-1">
                Нет доступных моделей. Проверьте подключения.
              </p>
            )}
          </div>

          {/* Ползунки */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-neutral-400 mb-2">
                <span>Temperature</span>
                <span className="text-white font-mono">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-neutral-400 mb-2">
                <span>Top K</span>
                <span className="text-white font-mono">{topK}</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-neutral-400 mb-2">
                <span>Top P</span>
                <span className="text-white font-mono">{topP.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={isSaving || !model}
            className="w-full bg-white text-black font-medium py-2.5 rounded-lg hover:bg-neutral-200 transition-colors text-sm mt-2 disabled:opacity-50"
          >
            {isSaving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
