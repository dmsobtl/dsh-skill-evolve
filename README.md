# dsh-skill-evolve

DSH 插件：Agent 自我进化引擎 — 从成功会话中自动提炼可复用 skill，越用越聪明。

## 原理

```
Agent 完成任务 → session.jsonl 记录全过程
                        ↓
              extract_skill 分析 session
                        ↓
        提炼工具调用序列 → 生成 skill markdown
                        ↓
        下次类似任务 → Agent 直接按 skill 执行（更快更准）
```

## 工具

| 工具 | 功能 |
|------|------|
| `extract_skill` | 从 session JSONL 提炼为 skill 文件 |
| `list_learned_skills` | 列出所有已学习的 skill |

## 使用示例

```
User: 刚才部署的流程挺顺利的，帮我把它提炼成 skill 以后复用

Agent:
→ extract_skill({
    sessionPath: "~/.dsh/sessions/abc123/session.jsonl",
    skillName: "deploy-staging",
    description: "部署到预发环境的标准流程"
  })

✓ 已生成 skill: ./skills/learned/deploy-staging.md
  提取了 7 个步骤，使用了 bash, read, write 3 个工具。
  下次说"部署到预发"时我会按这个流程执行。
```

## 生成的 Skill 示例

```markdown
# Skill: deploy-staging
> Auto-generated from session `session.jsonl` on 2026-08-14

## 触发条件
当用户的需求类似于以下任务时使用：
> 把当前分支部署到预发环境

## 执行步骤
### 1. Execute: git pull origin main
### 2. Execute: npm run build
### 3. Execute: npm test
### 4. Read file: deploy.config.json
### 5. Execute: kubectl apply -f k8s/staging.yml
...
```

## 配置

```yaml
- insert:
    - id: skill-evolve
      name: dsh-skill-evolve
      config:
        skillsDir: ./skills/learned    # 生成的 skill 存放目录
        minSteps: 3                    # 少于 N 步的不提取
```

## 与其他插件配合

- **dsh-session-analyst**：先 `analyze_session` 确认质量好，再 `extract_skill`
- **dsh-agent-eval**：新 skill 生效后跑 eval 验证是否提升

## License

MIT
