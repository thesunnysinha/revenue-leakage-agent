import { create } from "zustand";
import type { ChatSummary } from "@/lib/api";

type PendingApproval = Record<string, unknown> | null;

interface ChatStore {
  sessionId: string | null;
  openaiApiKey: string | null;
  chats: ChatSummary[];
  pendingApproval: PendingApproval;
  setChats: (chats: ChatSummary[]) => void;
  upsertChat: (chat: ChatSummary) => void;
  setSessionId: (id: string) => void;
  setOpenaiApiKey: (key: string | null) => void;
  setPendingApproval: (data: PendingApproval) => void;
  clearApproval: () => void;
  resetSession: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessionId: null,
  openaiApiKey: null,
  chats: [],
  pendingApproval: null,
  setChats: (chats) => set({ chats }),
  upsertChat: (chat) => set((state) => ({ chats: [chat, ...state.chats.filter((item) => item.session_id !== chat.session_id)] })),
  setSessionId: (id) => set({ sessionId: id }),
  setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
  setPendingApproval: (data) => set({ pendingApproval: data }),
  clearApproval: () => set({ pendingApproval: null }),
  resetSession: () => set({ sessionId: null, openaiApiKey: null, pendingApproval: null }),
}));
