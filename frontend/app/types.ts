export type Connection = {
  id: number;
  label: string;
  base_url: string;
};

export type Chat = {
  id: number;
  title: string;
  connection_id: number | null;
  model_name: string | null;
  temperature: number | null;
  top_k: number | null;
  top_p: number | null;
};

export type Message = {
  id: number;
  chat_id: number;
  role: "user" | "assistant" | "system";
  content: string;
};
