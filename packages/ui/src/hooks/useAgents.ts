import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { AgentStatus } from "../types";

export function useAgents() {
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});

  const refresh = useCallback(async () => {
    try {
      const status = await api.getAgentStatus();
      setAgents(status);
    } catch (err) {
      console.error("Failed to fetch agent status:", err);
    }
  }, []);

  // 直接设置（用于 Socket.IO agents-status 事件）
  const setFromSocket = useCallback((data: Record<string, AgentStatus>) => {
    setAgents(data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agents, refresh, setFromSocket };
}
