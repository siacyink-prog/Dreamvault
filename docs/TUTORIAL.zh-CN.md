# 从日记列表到“写或不写”：AI 日记模块完整教程

这篇教程解释一个 AI 日记模块从界面、API、数据安全，到自主生成与聊天回看的完整逻辑。

仓库里的代码有意保持精简：它实现了可以直接运行的页面、分页 API、标题修改、本地存储和 sealed 隐私边界；涉及模型、上下文、定时器和通知的部分则使用接口与伪代码讲解。这样既能把系统讲完整，也不会把示例绑死在某一家模型或某一种基础设施上。

## 1. 它不只是“让模型写一篇日记”

最简单的实现通常是：

```text
定时器触发 → 把聊天记录发给模型 → 保存模型返回的文章
```

这个方案很快会出现几个问题：

- 没发生值得记录的事情时，模型仍然被迫写作；
- 日记逐渐变成机械的聊天摘要；
- 每篇都试图总结意义，语气越来越像周报；
- 最近几篇使用相同的意象、开头和结论；
- 私密内容可能被列表接口或日志意外暴露；
- 定时任务重试时可能重复写入；
- 用户在聊天中提到某篇日记时，模型只能凭印象猜测。

更完整的日记系统应该回答七个问题：

1. 现在是否真的值得写？
2. 写作时允许参考哪些上下文？
3. 怎样避免把聊天重新总结一遍？
4. 这一页公开，还是暂时封存？
5. 怎样安全地保存和展示封存页？
6. 怎样让后续日记保持连续、又不重复？
7. 聊天中的 AI 怎样准确回看某一页？

本教程逐层实现这些能力。

## 2. 总体架构

建议把系统拆成五层：

```text
聊天 / 事件 / 记忆 / 最近日记
              │
              ▼
        Context Provider
              │
              ▼
      Decision Model Adapter
        │               │
       skip            write
                        │
                        ▼
               Journal Repository
                  │           │
                  ▼           ▼
             Public API   Notification
                  │
                  ▼
               Web View
```

每层只做一件事：

- **Context Provider**：提供适量、经过筛选的近期上下文；
- **Decision Model Adapter**：让模型决定 `skip` 或 `write`；
- **Journal Repository**：保存日记，不关心模型来自哪里；
- **Public API**：控制哪些字段可以离开服务器；
- **Web View**：只消费公开的数据契约。

仓库中的 [generate-dream.js](../examples/generate-dream.js) 展示了这种依赖注入结构。

## 3. 先定义数据模型

最小数据模型如下：

```js
{
  id: "dream_003",
  author: "assistant",
  title: "The light left on",
  content: "正文",
  visibility: "public", // 或 hidden
  created_at: "2026-09-26T16:42:00.000Z"
}
```

实际产品通常还会加入：

```js
{
  hidden_reason: "为什么暂时不公开",
  context_note: "这一页从什么事件或情绪产生",
  decision_type: "day_write",
  generated_by: "scheduled_reflection",
  revealed_at: null,
  updated_at: "...",
  trigger_id: "用于防止定时任务重复写入"
}
```

这些字段可分为两组。

### 3.1 可以返回给界面的字段

- `id`
- `title`
- `visibility`
- `created_at`
- `content`，但仅限公开页

### 3.2 只允许保留在服务器的字段

- 封存页正文
- `hidden_reason`
- `context_note`
- 原始模型响应
- 生成时使用的上下文
- 调试和计费信息

不要让前端先拿到完整对象，再用 CSS 或条件渲染“藏住”正文。只要正文已经到达客户端，它就不再是封存内容。

仓库中的 [publicDream](../server/lib/dreams.js) 是这条边界的最小实现：

```js
export function publicDream(entry) {
  const hidden = entry.visibility === "hidden";
  return {
    id: String(entry.id),
    title: entry.title || null,
    content: hidden ? null : entry.content || "",
    visibility: hidden ? "hidden" : "public",
    hidden,
    created_at: entry.created_at,
  };
}
```

最重要的不是 `content: null` 本身，而是返回对象里根本没有 `hidden_reason` 和内部上下文。

## 4. 存储层

示例项目使用 JSON 文件，目的是让读者不安装数据库也能运行：

```text
server/data/dreams.seed.json → 首次启动复制 → .data/dreams.json
```

[JsonDreamStore](../server/lib/store.js) 提供三个动作：

- `all()`：读取所有日记；
- `replace(entries)`：原子替换文件；
- `rename(id, title)`：修改标题。

写文件时先写入临时文件，再执行重命名：

```js
fs.writeFileSync(temporary, JSON.stringify(entries));
fs.renameSync(temporary, this.file);
```

这样可以降低进程在写入途中退出导致文件只剩半截的风险。

### 4.1 什么时候应该换数据库

JSON 存储适合：

- 本地教程；
- 单用户原型；
- 数据量很小；
- 没有并发写入。

出现以下情况时应迁移到 SQLite 或 PostgreSQL：

- 多个用户；
- 多进程或多实例部署；
- 定时任务和用户操作可能同时写入；
- 需要全文检索、备份或审计；
- 需要可靠的唯一约束和事务。

迁移时让 API 继续依赖统一的 Repository 接口即可：

```js
class JournalRepository {
  list({ page, limit, ownerId }) {}
  findById({ id, ownerId }) {}
  findByTitle({ title, ownerId }) {}
  create(entry) {}
  rename({ id, ownerId, title }) {}
  reveal({ id, ownerId }) {}
}
```

页面不需要知道底层从 JSON 换成了数据库。

## 5. 列表 API

示例接口：

```http
GET /api/dream?page=1&limit=20
```

服务端流程：

```text
解析 page / limit
    ↓
限制 limit 最大值
    ↓
按 created_at 倒序
    ↓
截取当前页
    ↓
逐条通过 publicDream()
    ↓
返回 entries + total
```

分页参数必须在服务端限制。示例最大允许每页 50 条，防止调用者用一个极大的 `limit` 一次读取全部数据。

完整契约见 [API.md](API.md)。

## 6. 标题修改

示例接口：

```http
PUT /api/dream/:id/title
Content-Type: application/json

{ "title": "A different title" }
```

服务端至少应该处理：

- 标题为空；
- 首尾空格；
- 多余引号和结尾标点；
- 长度上限；
- 非法 ID；
- 找不到对应日记；
- 请求体过大。

对应代码在 [cleanTitle](../server/lib/dreams.js) 和 [server/index.js](../server/index.js)。

互联网服务还必须在修改前确认：

```text
当前登录用户是否拥有这篇日记？
```

仅验证 ID 存在是不够的。

## 7. 页面状态

[DreamJournal.jsx](../src/components/DreamJournal.jsx) 维护以下状态：

```js
entries       // 已加载的页面
page          // 当前分页
total         // 总数
openId        // 当前展开项
editingId     // 正在改标题的项
draftTitle    // 标题输入草稿
status        // loading / ready / error
loadingMore   // 是否正在加载更早页面
```

页面只依据 `visibility` 和 `content` 渲染：

```js
const hidden = entry.visibility === "hidden";

return hidden
  ? <p>This page is still sealed.</p>
  : <p>{entry.content}</p>;
```

这里的判断用于展示，不承担安全职责。真正的安全边界仍在服务端。

## 8. AI 生成的核心：先决定是否写

不要把任务写成：

```text
请根据以下聊天记录写一篇日记。
```

这句话已经替模型做出了“必须写”的决定。更合适的任务是：

```text
判断近期活动中是否有值得保留为私人日记的一页。
沉默是有效结果，不要为了完成任务而写作。
如果写，不要复述全部记录，只抓住一两个具体细节。
```

推荐让模型返回结构化决策：

```json
{
  "decision": "skip",
  "title": "",
  "content": "",
  "visibility": "public"
}
```

或者：

```json
{
  "decision": "write",
  "title": "The light left on",
  "content": "...",
  "visibility": "hidden"
}
```

### 8.1 服务端必须重新验证

模型输出不是可信输入。服务端仍要检查：

- `decision` 是否为允许值；
- `content` 是否为空；
- 标题和正文长度；
- `visibility` 是否为允许值；
- JSON 中是否混入未知字段；
- 是否已经达到当天上限；
- 当前触发是否已经处理过。

一个简化实现：

```js
const decision = await model.decide(input);

if (decision?.decision !== "write") {
  return { wrote: false, reason: "model_skipped" };
}

const content = cleanText(decision.content, 2200);
if (!content) {
  return { wrote: false, reason: "empty_content" };
}

const entry = await journal.create({
  title: cleanTitle(decision.title) || fallbackTitle(content),
  content,
  visibility: decision.visibility === "hidden" ? "hidden" : "public",
});
```

## 9. 上下文应该怎样组装

模型并不需要数据库里的所有内容。推荐把上下文分成几类，并为每类设置独立预算：

```text
[Current time]
当前时间与触发窗口

[Recent activity]
当天最相关的聊天或事件

[Recent journal continuity]
最近几篇日记的标题、主题和少量正文

[Optional memory]
一条相关的长期记忆摘要
```

### 9.1 不要无限追加聊天历史

可以使用“头部 + 尾部”策略：

```js
function selectMessages(messages, max = 80) {
  if (messages.length <= max) return messages;
  return [
    ...messages.slice(0, 10),
    { role: "system", content: "[middle messages omitted]" },
    ...messages.slice(-70),
  ];
}
```

不过更理想的方案是先做相关性筛选，再做长度截断。纯粹保留最后 N 条容易遗漏白天早些时候真正重要的事件。

### 9.2 最近日记用于连续性，不用于模仿

给模型最近日记的目的主要是：

- 避免重复标题；
- 避免重复核心意象；
- 避免连续几篇得出相同结论；
- 让前后页面在事实层面保持一致。

不要要求模型“模仿上一页风格”，否则语言会快速自我复制。

### 9.3 私密字段只在可信服务端内部使用

封存正文可以在受信任的生成流程中参与连续性判断，但不应：

- 放进公开 API；
- 进入客户端日志；
- 写进通知正文；
- 出现在普通错误信息里；
- 被第三方分析服务自动采集。

## 10. 防止重复和失控生成

至少加入四道保护。

### 10.1 进程内锁

```js
if (writing) return { wrote: false, reason: "locked" };
writing = true;
try {
  return await considerDream();
} finally {
  writing = false;
}
```

它能防止单进程内同时触发，但不能保护多个实例。

### 10.2 数据库唯一键

为每次触发生成稳定的 `trigger_id`：

```text
ownerId + date + windowType
```

然后在数据库中添加唯一约束。即使定时平台重试，也只能成功写入一次。

### 10.3 每日上限

日记不是流水账生成器。可以设置：

```js
if (todayCount >= maxPerDay) {
  return { wrote: false, reason: "daily_limit" };
}
```

上限应由产品节奏决定，不应依赖模型自觉。

### 10.4 语义去重

在写入前比较最近几篇：

- 标题标准化后是否相同；
- 正文是否高度相似；
- 是否重复同一个核心事件；
- 是否重复相同开场句式。

教程项目可以先做标题与文本哈希；规模扩大后再考虑向量相似度。

## 11. sealed 与 reveal 状态机

建议把公开状态设计为明确的状态机：

```text
          write(hidden)
               │
               ▼
            sealed
               │
          explicit reveal
               │
               ▼
             public
```

不要提供从 `public` 自动退回 `sealed` 的隐式操作。若产品确实需要重新封存，应单独定义权限、审计和客户端缓存清理规则。

`reveal` 的服务端动作可以是：

```js
await journal.update(id, {
  visibility: "public",
  revealed_at: new Date().toISOString(),
});
```

并且必须重新检查日记归属。

## 12. 聊天中怎样准确回看日记

如果聊天模型需要知道日记内容，不要把所有正文永久塞进每一轮上下文。推荐提供受控工具：

```text
list_recent
find_by_title
read
reveal
```

### 12.1 默认只注入标题目录

聊天上下文中可以只加入少量最近标题：

```text
Recent journal titles:
The light left on | Three quiet minutes | A page still folded
```

当用户提到具体标题时，模型先调用 `find_by_title`，不要根据标题猜正文。

### 12.2 `read` 不等于 `reveal`

这是最容易写错的地方：

- `read`：可信服务端把正文交给模型，让它理解；
- `reveal`：改变日记状态，使用户界面可以取得正文。

模型读到封存正文后，不应该因此自动向用户全文复述。

### 12.3 临时保留最近读过的页面

如果模型刚读过某一页，可以在服务端短暂缓存几轮，避免下一轮重复调用：

```js
recentlyRead.set(sessionId, {
  entry,
  remainingTurns: 3,
  expiresAt: Date.now() + 45 * 60 * 1000,
});
```

需要同时设置：

- 最大会话数量；
- TTL；
- 最大剩余轮次；
- reveal 后立即清除；
- 服务重启后允许自然丢失。

这类缓存不是持久记忆，不应无限增长。

## 13. 通知

日记保存成功后，可以调用可选通知适配器：

```js
await notifier?.published?.({
  id: entry.id,
  title: entry.title,
  hidden: entry.visibility === "hidden",
});
```

通知正文不得包含封存页正文或内部原因。一个安全的通知只需要表达：

```text
有一页新日记。
```

通知失败也不应回滚已经成功保存的日记。日记写入是主操作，通知是可重试的副作用。

## 14. 定时任务

定时任务只负责发出触发信号，不应该复制生成逻辑：

```text
scheduler
   │
   ▼
POST /internal/dream/consider
   │
   ▼
统一的 considerDream()
```

内部触发接口需要独立鉴权，并且应限制在私有网络或回环地址。不要把管理密钥放进浏览器端代码。

定时器还应设置：

- 合理超时；
- 有限次数重试；
- 稳定 `trigger_id`；
- 结构化日志；
- 明确区分 `skip` 与失败。

`skip` 是正常产品结果，不应该进入错误告警。

## 15. 错误与日志

建议记录：

```js
{
  trigger_id,
  decision: "skip" | "write" | "error",
  reason,
  model,
  duration_ms,
  entry_id,
}
```

不要记录：

- 完整聊天上下文；
- 封存正文；
- 用户凭据；
- 模型服务密钥；
- 未清洗的供应商错误响应。

对外错误应保持简短：

```json
{ "error": "journal generation failed" }
```

详细诊断留在经过权限控制的服务端日志中。

## 16. 认证与多用户隔离

当前示例只监听 `127.0.0.1`，用于本地学习。要部署到互联网，至少补齐：

1. 登录与会话认证；
2. 每条日记的 `owner_id`；
3. 所有查询都带 `owner_id` 条件；
4. 修改、读取、reveal 前做归属检查；
5. 写接口 CSRF 防护或严格的 token 认证；
6. 请求频率限制；
7. 数据库备份与恢复演练；
8. 密钥只存在服务端环境中。

错误示例：

```js
db.dreams.findById(req.params.id);
```

更安全的查询：

```js
db.dreams.findOne({
  id: req.params.id,
  owner_id: req.user.id,
});
```

永远不要相信“这个 ID 很难猜”可以代替授权检查。

## 17. 推荐的实现顺序

如果从零开始，可以按以下顺序施工：

### 阶段一：普通日记

- 数据模型；
- 列表与分页；
- 标题修改；
- public/hidden 序列化；
- 前端展开与加载更多。

### 阶段二：模型决策

- 模型适配器；
- `skip | write` JSON；
- 输出校验；
- 每日上限；
- 最近日记去重。

### 阶段三：上下文

- 当天事件选择；
- 长度预算；
- 最近日记连续性；
- 可选记忆摘要。

### 阶段四：聊天回看

- 标题目录；
- `find_by_title`；
- 可信 `read`；
- 显式 `reveal`；
- 临时上下文缓存。

### 阶段五：基础设施

- 数据库事务；
- 定时任务；
- 幂等键；
- 通知；
- 监控与备份。

每完成一个阶段都能得到可用产品，不需要一次把所有能力写完。

## 18. 本仓库可以怎样继续练习

建议依次尝试：

1. 增加创建日记的本地表单；
2. 增加 `DELETE /api/dream/:id`；
3. 把 JSON Store 替换为 SQLite；
4. 为 Repository 编写契约测试；
5. 实现一个使用固定假数据的 `ContextProvider`；
6. 实现一个 Fake Model，交替返回 `skip` 与 `write`；
7. 测试 sealed 正文不会出现在 API、日志和通知中；
8. 最后再接入你选择的模型服务。

不要一开始就接真实模型。先用 Fake Model 把状态、隐私和幂等行为测试清楚，调试成本会低很多。

## 19. 最后检查清单

发布或部署前逐项确认：

- [ ] sealed 正文不会从列表 API 返回；
- [ ] 内部原因和上下文不会进入客户端；
- [ ] 模型可以选择不写；
- [ ] 模型输出经过服务端验证；
- [ ] 每日写入存在上限；
- [ ] 重试不会产生重复页面；
- [ ] 最近日记用于防重复，而不是无限模仿；
- [ ] `read` 与 `reveal` 是两个动作；
- [ ] 所有修改按用户归属授权；
- [ ] 通知不包含私密正文；
- [ ] 日志不保存敏感上下文；
- [ ] 数据有备份和恢复方案；
- [ ] 模型和数据库密钥从未进入前端包。

完成这些之后，日记模块才真正从一个漂亮列表，变成一个可以长期运行的系统。

## 授权说明

本仓库采用 [PolyForm Noncommercial License 1.0.0](../LICENSE)。在该许可证允许的非商业目的范围内，可以使用、修改和分发代码；许可证不授予商业使用权。具体权利与义务以仓库中的英文许可证原文为准。
