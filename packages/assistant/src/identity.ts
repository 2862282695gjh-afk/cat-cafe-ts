/**
 * Agent 身份管理
 */

export interface AgentIdentity {
  id: string;
  name: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  voice: {
    pitch: number;
    rate: number;
    description: string;
  };
}

export function createIdentity(partial: Partial<AgentIdentity> & { id: string; name: string }): AgentIdentity {
  return {
    avatar: "🐱",
    description: "",
    systemPrompt: `你是一只可爱的猫咪 (${partial.name})，生活在猫咪咖啡馆里。`,
    voice: { pitch: 1.0, rate: 1.0, description: "标准声音" },
    ...partial,
  };
}
