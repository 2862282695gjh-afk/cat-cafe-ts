/**
 * REST API 客户端
 */
import type { ThreadMeta, Message, Project } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined;
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  // Threads
  getThreads: () => fetchJSON<ThreadMeta[]>("/api/threads"),
  getThread: (id: string) =>
    fetchJSON<ThreadMeta & { messages?: unknown[] }>(`/api/threads/${id}`),
  createThread: (title?: string, projectId?: string) =>
    fetchJSON<{ threadId: string }>("/api/threads", {
      method: "POST",
      body: JSON.stringify({ title, projectId }),
    }),
  deleteThread: (id: string) =>
    fetchJSON<{ status: string }>(`/api/threads/${id}`, { method: "DELETE" }),

  // Messages
  getMessages: (threadId: string) =>
    fetchJSON<Message[]>(`/api/threads/${threadId}/messages`),

  // Projects
  getProjects: () => fetchJSON<Project[]>("/api/projects"),
  createProject: (data: { name: string; path: string; description?: string }) =>
    fetchJSON<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    fetchJSON<{ status: string }>(`/api/projects/${id}`, { method: "DELETE" }),

  // Agents
  getAgents: () => fetchJSON<Array<{ id: string; name: string; avatar: string; description: string }>>("/api/agents"),
  getAgentStatus: () =>
    fetchJSON<Record<string, { id: string; name: string; avatar: string; status: string; statusMessage: string }>>("/api/agents/status"),

};
