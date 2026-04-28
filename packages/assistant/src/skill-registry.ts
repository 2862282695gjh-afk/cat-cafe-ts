/**
 * Skill 注册和触发词匹配
 */

export type SkillType = "prompt" | "http" | "python";

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  category: string;
  triggers: string[];
  config: Record<string, unknown>;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}

export interface SkillMatch {
  skill: SkillConfig;
  matchedTrigger: string;
}

export class SkillRegistry {
  private _skills = new Map<string, SkillConfig>();

  register(skill: SkillConfig): void {
    this._skills.set(skill.id, skill);
  }

  unregister(skillId: string): void {
    this._skills.delete(skillId);
  }

  get(skillId: string): SkillConfig | undefined {
    return this._skills.get(skillId);
  }

  list(): SkillConfig[] {
    return [...this._skills.values()];
  }

  /** 按触发词匹配技能 */
  matchByTrigger(text: string): SkillMatch | undefined {
    const lower = text.toLowerCase();
    for (const skill of this._skills.values()) {
      for (const trigger of skill.triggers) {
        if (lower.includes(trigger.toLowerCase())) {
          return { skill, matchedTrigger: trigger };
        }
      }
    }
    return undefined;
  }

  /** 按分类获取 */
  getByCategory(category: string): SkillConfig[] {
    return this.list().filter((s) => s.category === category);
  }
}
