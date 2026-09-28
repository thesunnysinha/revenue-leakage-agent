import { create } from "zustand";

type PendingApproval = Record<string, unknown> | null;

interface ChatStore {
  sessionId: string | null;
  pendingApproval: PendingApproval;
  setSessionId: (id: string) => void;
  setPendingApproval: (data: PendingApproval) => void;
  clearApproval: () => void;
  resetSession: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessionId: null,
  pendingApproval: null,
  setSessionId: (id) => set({ sessionId: id }),
  setPendingApproval: (data) => set({ pendingApproval: data }),
  clearApproval: () => set({ pendingApproval: null }),
  resetSession: () => set({ sessionId: null, pendingApproval: null }),
}));
