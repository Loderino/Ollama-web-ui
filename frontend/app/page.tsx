"use client";

import { useEffect, useState, useRef } from "react";
import type { Chat, Message } from "./types";
import ConnectionsModal from "../components/ConnectionsModal";
import ChatSettingsModal from "../components/ChatSettingsModal";
import Markdown from "../components/Markdown";

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasConnections, setHasConnections] = useState<boolean | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);

  const [newChatSettings, setNewChatSettings] = useState<Partial<Chat>>({
    model_name: null,
    connection_id: null,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    is_streaming: true
  });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  const loadData = async () => {
    const chatsRes = await fetch("/api/chats");
    setChats(await chatsRes.json());

    const connRes = await fetch("/api/connections");
    const conns = await connRes.json();
    setHasConnections(conns.length > 0);
  };

  const loadMessages = async (chatId: number) => {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const data = await res.json();
    setMessages(data.messages);
  };

  useEffect(() => {
    if (hasConnections && !newChatSettings.model_name) {
      async function pickDefaultModel() {
        const connsRes = await fetch("/api/connections");
        const conns = await connsRes.json();
        if (conns.length === 0) return;

        const firstConn = conns[0];
        const modelsRes = await fetch(`/api/connections/${firstConn.id}/models`);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          if (data.models && data.models.length > 0) {
            setNewChatSettings(prev => ({
              ...prev,
              connection_id: firstConn.id,
              model_name: data.models[0].name
            }));
          }
        }
      }
      pickDefaultModel();
    }
  }, [hasConnections, newChatSettings.model_name]);

  useEffect(() => {
    if (!activeChatId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    loadMessages(activeChatId);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//localhost:8000/ws/chat/${activeChatId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "message.chunk") {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, content: last.content + data.content };
            return updated;
          }
          return [...prev, {
            id: Date.now(),
            chat_id: data.chat_id,
            role: "assistant",
            content: data.content
          }];
        });
      }

      if (data.type === "message.done") {
        setIsLoading(false);
        setCurrentTaskId(null);

        setMessages(prev => {
          // Ищем последнее сообщение ассистента для замены
          const lastAssistantIdx = prev.findLastIndex(m => m.role === "assistant");

          if (lastAssistantIdx !== -1) {
            const updated = [...prev];
            updated[lastAssistantIdx] = data.message;
            return updated;
          }
          return [...prev, data.message];
        });

        loadData();

        if (data.message.role === "system") {
          setTimeout(() => {
            setMessages(prev => prev.filter(m => m.id !== data.message.id));
          }, 5000);
        }
      }
    };

    ws.onerror = (e) => console.error("WebSocket error", e);

    return () => { ws.close(); };
  }, [activeChatId]);

  const handleSaveSettings = async (settings: Partial<Chat>) => {
    if (activeChatId) {
      await fetch(`/api/chats/${activeChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      loadData();
    } else {
      setNewChatSettings(prev => ({ ...prev, ...settings }));
    }
  };

  const updateChatTitle = async () => {
    if (!activeChatId || !editTitleValue.trim() || editTitleValue === activeChat?.title) {
      setIsEditingTitle(false);
      return;
    }

    await fetch(`/api/chats/${activeChatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitleValue.trim() }),
    });

    setIsEditingTitle(false);
    loadData();
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

    await sendToBackend(newChat.id, prompt);
  };

  const sendToBackend = async (chatId: number, prompt: string) => {
    setIsLoading(true);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, prompt }),
    });
    const data = await res.json();
    if (data.task_id) setCurrentTaskId(data.task_id);
  };

  const cancelGeneration = async () => {
    if (!currentTaskId) return;
    try {
      await fetch("/api/generate/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: currentTaskId }),
      });
      // Ждем message.done от воркера
    } catch (e) {
      console.error("Failed to cancel", e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const currentModel = activeChatId ? activeChat?.model_name : newChatSettings.model_name;
    if (!currentModel) {
      alert("Сначала выберите модель в правом верхнем углу.");
      return;
    }

    const prompt = input.trim();
    setInput("");

    if (!activeChatId) {
      await createChatAndSend(prompt);
    } else {
      const tempMsg: Message = { id: Date.now(), chat_id: activeChatId, role: "user", content: prompt };
      setMessages(prev => [...prev, tempMsg]);
      await sendToBackend(activeChatId, prompt);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      if (!isLoading) handleSend();
    }
  };

  const deleteChat = async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Удалить этот чат?")) return;

    await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setChats(chats.filter(c => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
  };

  useEffect(() => { loadData(); }, []);

  const canSend = hasConnections && (activeChatId ? !!activeChat?.model_name : !!newChatSettings.model_name);

  return (
    <div className="flex h-screen bg-[#0f0f11] text-neutral-200 font-sans">

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

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {hasConnections === false ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-16 h-16 bg-red-900/20 text-red-400 rounded-2xl flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h1 className="text-2xl font-semibold mb-2">Нет подключений</h1>
            <p className="text-neutral-500 text-sm mb-6 text-center max-w-sm">
              Сначала добавьте подключение к серверу Ollama в настройках, чтобы начать общение.
            </p>
            <button onClick={() => setIsConnectionsOpen(true)} className="bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-neutral-200 transition-colors">
              Добавить подключение
            </button>
          </div>
        ) : activeChatId ? (
          <>
            <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 bg-[#0f0f11]">
              <div className="flex-1 flex items-center min-w-0 mr-4">
                {isEditingTitle ? (
                  <input
                    autoFocus
                    className="bg-transparent text-sm font-semibold text-white outline-none border-b border-neutral-500 w-full max-w-[300px]"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onBlur={updateChatTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateChatTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                  />
                ) : (
                  <div
                    onClick={() => {
                      if (activeChat) {
                        setEditTitleValue(activeChat.title);
                        setIsEditingTitle(true);
                      }
                    }}
                    className="font-semibold text-sm cursor-pointer hover:text-neutral-400 transition-colors truncate"
                  >
                    {activeChat?.title || "Чат"}
                  </div>
                )}
              </div>

              <button onClick={() => setIsChatSettingsOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-800 transition-colors text-sm text-neutral-400 shrink-0">
                <span className={activeChat?.model_name ? "text-neutral-200" : "text-red-400"}>
                  {activeChat?.model_name || "Выбрать модель"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`text-[15px] leading-relaxed ${
                    m.role === "user"
                      ? "max-w-[80%] bg-neutral-700 text-white px-4 py-2.5 rounded-2xl whitespace-pre-wrap"
                      : m.role === "system"
                      ? "w-full bg-red-900/30 text-red-200 border border-red-800/50 rounded-2xl px-4 py-2.5 text-center text-sm"
                      : "w-full text-neutral-200"
                  }`}>
                    {m.role === "assistant" && <div className="font-semibold text-xs mb-2 text-neutral-400">Ollama</div>}
                    {m.role === "system" && <div className="font-semibold text-xs mb-1">Система</div>}
                    {m.role === "assistant" ? (
                      <Markdown content={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}

              {isLoading && messages.length > 0 && messages[messages.length - 1].role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="text-sm text-neutral-500 animate-pulse flex items-center gap-2 py-2">
                    <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-ping"></span>
                    Ollama думает...
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
          <div className={`max-w-3xl mx-auto relative flex items-end bg-[#171719] border rounded-xl transition-colors ${!canSend ? 'border-red-900/50 opacity-50' : 'border-neutral-800 focus-within:border-neutral-600'}`}>
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full bg-transparent p-4 pr-12 text-[15px] outline-none placeholder-neutral-500 resize-none max-h-[150px] overflow-y-auto"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={!canSend ? "Выберите модель или добавьте подключение" : "Спросите что-нибудь... (Shift+Enter для переноса)"}
              disabled={isLoading || !canSend}
            />
            <button
              onClick={isLoading ? cancelGeneration : handleSend}
              disabled={!isLoading && (!input.trim() || !canSend)}
              className="absolute right-2 bottom-2 p-2 bg-white text-black rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white transition-colors"
            >
              {isLoading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <ConnectionsModal isOpen={isConnectionsOpen} onClose={() => { setIsConnectionsOpen(false); loadData(); }} />

      <ChatSettingsModal
        isOpen={isChatSettingsOpen}
        onClose={() => setIsChatSettingsOpen(false)}
        chat={activeChat || { id: 0, title: "", connection_id: null, model_name: null, temperature: 0.7, top_k: 40, top_p: 0.9, is_streaming: true } as Chat}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}
