"use client";

import { useEffect, useState, useRef } from "react";
import type { Chat } from "../app/types";

type Connection = { id: number; label: string };
type Model = {
  name: string;
  details: { parameter_size: string };
  connectionId: number;
  connectionLabel?: string;
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
  const [isStreaming, setIsStreaming] = useState(chat.is_streaming ?? true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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
                connectionId: conn.id,
                connectionLabel: conn.label
              }));
              allModels = [...allModels, ...withConn];
            }
          } catch (e) { /* Игнорируем упавшие */ }
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const save = async () => {
    setIsSaving(true);
    const selectedModel = models.find(m => m.name === model);

    const settings = {
      model_name: model || null,
      connection_id: selectedModel?.connectionId || null,
      temperature,
      top_k: topK,
      top_p: topP,
      is_streaming: isStreaming,
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

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.connectionLabel && m.connectionLabel.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedModelDisplay = models.find(m => m.name === model);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#171719] border border-neutral-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Настройки чата</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-5">

          {/* Выбор модели */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs text-neutral-400 mb-1">Модель</label>

            <div
              onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)}
              className="w-full bg-[#0f0f11] border border-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:outline-none cursor-pointer flex justify-between items-center group"
            >
              <div className="truncate">
                {isLoading ? (
                  <span className="text-neutral-500">Загрузка...</span>
                ) : selectedModelDisplay ? (
                  <span className="text-neutral-200">
                    {selectedModelDisplay.name}
                    {selectedModelDisplay.details.parameter_size && ` (${selectedModelDisplay.details.parameter_size})`}
                  </span>
                ) : (
                  <span className="text-neutral-500">Выберите модель</span>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-neutral-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>

            {isDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-[#171719] border border-neutral-800 rounded-lg shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-neutral-800">
                  <input
                    type="text"
                    placeholder="Поиск моделей..."
                    className="w-full bg-[#0f0f11] border border-neutral-800 rounded px-2 py-1.5 text-sm outline-none focus:border-neutral-500 text-neutral-200 placeholder-neutral-600"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {filteredModels.length === 0 ? (
                    <div className="text-sm text-neutral-500 text-center py-4">Ничего не найдено</div>
                  ) : (
                    filteredModels.map((m, idx) => (
                      <div
                        key={`${m.connectionId}-${m.name}-${idx}`}
                        onClick={() => { setModel(m.name); setIsDropdownOpen(false); setSearchQuery(""); }}
                        className={`px-3 py-2 text-sm rounded-md cursor-pointer flex flex-col gap-0.5 transition-colors ${model === m.name ? "bg-neutral-800" : "hover:bg-neutral-800/50"}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-200 font-medium">{m.name}</span>
                          {m.details.parameter_size && (
                            <span className="text-xs text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded">{m.details.parameter_size}</span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">{m.connectionLabel}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Компактные числовые поля в ряд */}
          <div className="grid grid-cols-3 gap-3">

            <div>
              <label className="block text-[11px] text-neutral-400 mb-1 truncate">Temperature</label>
              <div className="flex items-center bg-[#0f0f11] border border-neutral-800 rounded-lg overflow-hidden h-9">
                <button
                  onClick={() => setTemperature(Math.max(0, Number((temperature - 0.1).toFixed(1))))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >-</button>
                <input
                  type="number" step="0.1" min="0" max="2" value={temperature}
                  onChange={(e) => setTemperature(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))}
                  className="w-full bg-transparent text-center text-xs text-neutral-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTemperature(Math.min(2, Number((temperature + 0.1).toFixed(1))))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >+</button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-neutral-400 mb-1 truncate">Top K</label>
              <div className="flex items-center bg-[#0f0f11] border border-neutral-800 rounded-lg overflow-hidden h-9">
                <button
                  onClick={() => setTopK(Math.max(1, topK - 1))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >-</button>
                <input
                  type="number" step="1" min="1" max="100" value={topK}
                  onChange={(e) => setTopK(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-full bg-transparent text-center text-xs text-neutral-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTopK(Math.min(100, topK + 1))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >+</button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-neutral-400 mb-1 truncate">Top P</label>
              <div className="flex items-center bg-[#0f0f11] border border-neutral-800 rounded-lg overflow-hidden h-9">
                <button
                  onClick={() => setTopP(Math.max(0, Number((topP - 0.05).toFixed(2))))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >-</button>
                <input
                  type="number" step="0.05" min="0" max="1" value={topP}
                  onChange={(e) => setTopP(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                  className="w-full bg-transparent text-center text-xs text-neutral-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTopP(Math.min(1, Number((topP + 0.05).toFixed(2))))}
                  className="px-2 h-full text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                >+</button>
              </div>
            </div>

          </div>

          {/* Переключатель стриминга */}
          <div className="flex items-center justify-between pt-2">
            <label className="text-sm text-neutral-300">Потоковый ответ</label>
            <button
              type="button"
              onClick={() => setIsStreaming(!isStreaming)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isStreaming ? 'bg-white' : 'bg-neutral-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${isStreaming ? 'bg-black left-[22px]' : 'bg-neutral-400 left-0.5'}`} />
            </button>
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
