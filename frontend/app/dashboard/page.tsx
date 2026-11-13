"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

type Metrics = {
  totals: {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    avg_response_ms: number;
  };
  models: {
    model: string;
    requests: number;
    tokens: number;
    avg_ms: number;
  }[];
  available_models: string[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Фильтры
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<number>(7);

  const loadData = () => {
    setIsLoading(true);
    const query = new URLSearchParams();
    if (selectedModel) query.append("model", selectedModel);
    query.append("days", selectedDays.toString());

    fetch(`/api/metrics?${query.toString()}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [selectedModel, selectedDays]);

  if (!data && isLoading) {
    return <div className="flex h-screen items-center justify-center bg-[#0f0f11] text-neutral-400">Загрузка статистики...</div>;
  }

  if (!data || !data.totals) {
    return <div className="flex h-screen items-center justify-center bg-[#0f0f11] text-red-400">Не удалось загрузить данные.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f0f11] text-neutral-200 font-sans p-8">
      <div className="max-w-6xl mx-auto">

        {/* Шапка с фильтрами */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Дашборд</h1>
            <p className="text-neutral-500 text-sm mt-1">Статистика использования моделей</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Фильтр по времени */}
            <select
              value={selectedDays}
              onChange={(e) => setSelectedDays(Number(e.target.value))}
              className="bg-[#171719] border border-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-600 cursor-pointer"
            >
              <option value={1}>За 24 часа</option>
              <option value={7}>За 7 дней</option>
              <option value={30}>За 30 дней</option>
              <option value={90}>За 90 дней</option>
            </select>

            {/* Фильтр по модели */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-[#171719] border border-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-600 cursor-pointer"
            >
              <option value="">Все модели</option>
              {data.available_models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <a href="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors ml-2">
              &larr; В чат
            </a>
          </div>
        </div>

        {/* Карточки с общей статистикой (без изменений) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#171719] border border-neutral-800 rounded-xl p-5">
            <div className="text-neutral-400 text-xs mb-1">Всего запросов</div>
            <div className="text-3xl font-semibold">{data.totals.requests}</div>
          </div>
          <div className="bg-[#171719] border border-neutral-800 rounded-xl p-5">
            <div className="text-neutral-400 text-xs mb-1">Входные токены</div>
            <div className="text-3xl font-semibold">{data.totals.prompt_tokens.toLocaleString()}</div>
          </div>
          <div className="bg-[#171719] border border-neutral-800 rounded-xl p-5">
            <div className="text-neutral-400 text-xs mb-1">Выходные токены</div>
            <div className="text-3xl font-semibold">{data.totals.completion_tokens.toLocaleString()}</div>
          </div>
          <div className="bg-[#171719] border border-neutral-800 rounded-xl p-5">
            <div className="text-neutral-400 text-xs mb-1">Среднее время ответа</div>
            <div className="text-3xl font-semibold">{data.totals.avg_response_ms} <span className="text-base font-normal text-neutral-500">мс</span></div>
          </div>
        </div>

        {/* График и таблица (без изменений, только если data.models не пуст) */}
        {data.models.length > 0 ? (
          <>
            <div className="bg-[#171719] border border-neutral-800 rounded-xl p-6 mb-8">
              <h2 className="text-lg font-medium mb-6">Расход токенов по моделям</h2>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.models} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis dataKey="model" stroke="#737373" tick={{ fill: '#737373', fontSize: 12 }} />
                    <YAxis stroke="#737373" tick={{ fill: '#737373', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171719', borderColor: '#262626', borderRadius: '8px', color: '#e5e5e5' }}
                      itemStyle={{ color: '#e5e5e5' }}
                    />
                    <Bar dataKey="tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Токены" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#171719] border border-neutral-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#1f1f22] text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="px-6 py-4 font-medium">Модель</th>
                    <th className="px-6 py-4 font-medium">Запросов</th>
                    <th className="px-6 py-4 font-medium">Всего токенов</th>
                    <th className="px-6 py-4 font-medium">Среднее время (мс)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {data.models.map((m) => (
                    <tr key={m.model} className="hover:bg-neutral-800/20 transition-colors">
                      <td className="px-6 py-4 font-medium text-neutral-200">{m.model}</td>
                      <td className="px-6 py-4 text-neutral-400">{m.requests}</td>
                      <td className="px-6 py-4 text-neutral-400">{m.tokens.toLocaleString()}</td>
                      <td className="px-6 py-4 text-neutral-400">{m.avg_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-neutral-500 border border-neutral-800 border-dashed rounded-xl">
            За выбранный период данных нет.
          </div>
        )}
      </div>
    </div>
  );
}
