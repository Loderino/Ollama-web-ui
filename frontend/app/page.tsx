"use client";

import { useEffect, useState, useRef } from "react";
import type { Chat, Message } from "./types";
import ConnectionsModal from "../components/ConnectionsModal";
import ChatSettingsModal from "../components/ChatSettingsModal";

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);

  const [newChatSettings, setNewChatSettings] = useState<Partial<Chat>>({
    model_name: null,
    connection_id: null,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null); // Хранилище для сокета

  const activeChat = chats.find(c => c.id === activeChatId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadChats = async () => {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data);
  };

  const loadMessages = async (chatId: number) => {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const data = await res.json();
    setMessages(data.messages);
  };

  // Эффект для WebSocket
  useEffect(() => {
    if (!activeChatId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    loadMessages(activeChatId);

    // Определяем протокол (ws или wss)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Обратите внимание: URL может отличаться, если фронт не на localhost
    const wsUrl = `${protocol}//localhost:8000/ws/chat/${activeChatId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message.new") {
        setMessages(prev => [...prev, data.message]);
        setIsLoading(false); // Отключаем индикатор "печатает..."
        loadChats(); // Обновляем заголовки, если они изменились
      }
    };

    ws.onerror = (e) => console.error("WebSocket error", e);

    // Очистка при переключении чата или размонтировании
    return () => {
      ws.close();
    };
  }, [activeChatId]);

  const handleSaveSettings = async (settings: Partial<Chat>) => {
    if (activeChatId) {
      await fetch(`/api/chats/${activeChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      loadChats();
    } else {
      setNewChatSettings(prev => ({ ...prev, ...settings }));
    }
  };

  const createChatAndSend = async (prompt: string) => {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: prompt.slice(0, 30),
        connection_id: newChatSettings.connection_id || null
      }),
    });
    let newChat = await res.json();

    if (newChatSettings.model_name) {
      const patchRes = await fetch(`/api/chats/${newChat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newChatSettings),
      });
      newChat = await patchRes.json();
    }

    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);

    // Отправляем сообщение (WS уже подключится в useEffect при смене activeChatId)
    await sendToBackend(newChat.id, prompt);
  };

  const sendToBackend = async (chatId: number, prompt: string) => {
    setIsLoading(true);
    await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, prompt }),
    });
    // Ожидаем ответ по WebSocket
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const prompt = input;
    setInput("");

    if (!activeChatId) {
      await createChatAndSend(prompt);
    } else {
      const tempMsg: Message = { id: Date.now(), chat_id: activeChatId, role: "user", content: prompt };
      setMessages(prev => [...prev, tempMsg]);
      await sendToBackend(activeChatId, prompt);
    }
  };

  const deleteChat = async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Удалить этот чат?")) return;

    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setChats(chats.filter(c => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
  };

  useEffect(() => { loadChats(); }, []);

  return (
    <div className="flex h-screen bg-[#0f0f11] text-neutral-200 font-sans">

      {/* Боковая панель */}
      <div className="w-[260px] bg-[#171719] flex flex-col border-r border-neutral-800">
        <div className="p-4">
          <button onClick={() => setActiveChatId(null)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Новый чат
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`group relative p-2 pr-8 rounded-lg cursor-pointer text-sm truncate transition-colors ${activeChatId === chat.id ? "bg-neutral-800 font-medium" : "hover:bg-neutral-800/50"}`}
            >
              {chat.title}

              <button
                onClick={(e) => deleteChat(chat.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                title="Удалить чат"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-neutral-800">
          <button onClick={() => setIsConnectionsOpen(true)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-800 w-full text-sm text-neutral-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Настройки
          </button>
        </div>
      </div>

      {/* Область чата */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {activeChatId ? (
          <>
            <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 bg-[#0f0f11]">
              <div className="font-semibold text-sm">{activeChat?.title || "Чат"}</div>
              <button onClick={() => setIsChatSettingsOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-800 transition-colors text-sm text-neutral-400">
                <span className={activeChat?.model_name ? "text-neutral-200" : "text-red-400"}>
                  {activeChat?.model_name || "Выбрать модель"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${m.role === "user" ? "bg-neutral-700 text-white" : "bg-transparent text-neutral-200"}`}>
                    {m.role === "assistant" && <div className="font-semibold text-xs mb-1 text-neutral-400">Ollama</div>}
                    {m.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-transparent text-neutral-400 flex items-center gap-2">
                    <span className="animate-pulse">●</span> <span className="animate-pulse delay-100">●</span> <span className="animate-pulse delay-200">●</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
            <div className="absolute top-0 left-0 right-0 h-14 border-b border-neutral-800 flex items-center justify-end px-6 bg-[#0f0f11]">
              <button onClick={() => setIsChatSettingsOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-800 transition-colors text-sm text-neutral-400">
                <span className={newChatSettings.model_name ? "text-neutral-200" : "text-red-400"}>
                  {newChatSettings.model_name || "Выбрать модель"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>

            <div className="w-16 h-16 bg-neutral-800 rounded-2xl flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h1 className="text-2xl font-semibold mb-2">Чем я могу помочь?</h1>
            <p className="text-neutral-500 text-sm">Выберите модель в правом верхнем углу и начните диалог</p>
          </div>
        )}

        <div className="p-4 bg-[#0f0f11]">
          <div className="max-w-3xl mx-auto relative flex items-center bg-[#171719] border border-neutral-800 rounded-xl focus-within:border-neutral-600 transition-colors">
            <input
              className="w-full bg-transparent p-4 pr-12 text-[15px] outline-none placeholder-neutral-500"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Спросите что-нибудь..."
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="absolute right-2 p-2 bg-white text-black rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>

      <ConnectionsModal isOpen={isConnectionsOpen} onClose={() => setIsConnectionsOpen(false)} />

      <ChatSettingsModal
        isOpen={isChatSettingsOpen}
        onClose={() => setIsChatSettingsOpen(false)}
        chat={activeChat || { id: 0, title: "", connection_id: null, model_name: null, temperature: 0.7, top_k: 40, top_p: 0.9 } as Chat}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}
