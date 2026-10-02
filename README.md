# TMU · Caleb 个人学习工作台

保留左侧分类导航，在右侧阅读 HTML；登录个人账号后，学习记录、收藏和私人 HTML 保存到 Supabase，可在不同设备使用。

**网站：https://calebchu40-gif.github.io/tmu-usmle-caleb/**

## 小节题库与标准模板

**一个 HTML = 一个小节，多道题纵向排列。** 两个原网址继续使用，内容分别整理为「基础科学 · 细胞生物学」和「生物化学 · 营养与维生素」，各含 4 道示例题。

- 桌面端左侧题目区域独立上下滚动，右侧进度、刷新所有题目状态按钮、练习统计和题目导航固定在原位。小屏幕显示固定的简要统计，题目在下方滚动。
- 每道题单独选择和提交，只影响该题；提交后显示答案和逐项解析。点击「再做一次」可重新选择和提交。右侧原“知识点路径”位置改为「刷新所有题目状态」按钮，一次恢复本小节全部题目为可作答，清除当前选项草稿并收起解析；历史次数、复习标记和最后一次答题统计保持不变，重新提交后才更新统计。进入 HTML 时不自动重置。保存中或保存失败待重试时，批量刷新按钮暂不可用，避免丢失尚未保存的答案。
- **答对**：最后一次已提交的答案正确的题目数。
- **待复习**：未做题 + 最后一次答错的题。它与是否点星标无关。
- **答题历史**：每题右上角累计正确次数、错误次数。每次实际提交增加一次；刷新、恢复记录、点击星标、重试同一次网络请求均不增加次数。
- **标记复习**：工作台新增独立入口，集中显示手动标记的题，并可取消标记、搜索、直接定位到指定题目。页面里另有「待复习（未做 / 错误）」筛选，包含从未打开的小节中的未做题。

下载：[标准小节题库模板](https://calebchu40-gif.github.io/tmu-usmle-caleb/downloads/%E5%B0%8F%E8%8A%82%E9%A2%98%E5%BA%93%E6%A8%A1%E6%9D%BF.html)。网站侧栏和「管理 HTML」也提供下载按钮。

模板是**自带样式、脚本和题目数据的单文件 HTML**，无需一起上传 CSS 或 JS。用文本编辑器修改 `script#quiz-data` 中的 JSON 即可：

```json
{
  "version": 2,
  "id": "basic-science-cell-biology",
  "category": "基础科学",
  "section": "细胞生物学",
  "description": "本小节练习说明",
  "questions": [
    {
      "id": "cell-cycle-dna-replication",
      "title": "细胞周期与遗传信息",
      "stem": "在细胞进入有丝分裂之前，S 期中发生的主要过程是什么？",
      "options": ["DNA replication", "Translation"],
      "answer": 0,
      "explanation": "S 期中细胞复制 DNA。",
      "optionExplanations": ["正确：复制 DNA。", "错误：翻译合成蛋白质。"],
      "point": "区分复制与翻译。"
    }
  ]
}
```

把题目对象继续添加到 `questions` 数组即可。每题有 2～26 个选项，`answer` 从 **0** 开始；`optionExplanations` 与选项一一对应。小节 `id` 和题目 `id` 要稳定；每道题 ID 在该小节内唯一，使用字母、数字、下划线或短横线，最多 100 字符。复制模板创建另一个小节时，更换小节 ID。可选字段：`point`、`clinicalNote`、`references`（由 `label` 与 HTTPS `url` 组成）。

文本中的换行写成 JSON 的 `\n`，双引号写成 `\"`，小于号写成 `\u003c`；选项与解析显示纯文本，不执行其中的 HTML。保存为 UTF-8 的 `分类/小节.html`，例如 `基础科学/细胞生物学.html`，然后上传。已保存记录的题目不要随意改 ID；题目内容发生实质变化时应使用新 ID。

## 日常使用与保存

1. 左侧「个人账号」使用站点主人的邮箱和密码登录。本站不开放注册。
2. 「标记复习」管理星标题、查看未做或答错的题；「学习记录」管理题目笔记、导出最新记录。
3. 登录后，每次提交会同时保存本次历史和最后一次状态。每题会显示保存结果；网络失败保留待保存操作，点击该题「重试保存」或顶端「重试保存」重试。
4. 「管理 HTML」可上传、编辑、下载、删除私人 HTML。按标准模板上传时，自动提取小节名、分类和题目索引，未做题也能出现在复习列表中。
5. 题目记录中的笔记与星标可编辑；答案状态以真实提交为准。删除题目记录也会删除其答题历史，之后视为未做。删除私人 HTML 时已有记录保留。

登录状态下以云端记录为准，可在其他设备登录同一账号后读取。退出登录会清除当前工作台中的私人数据。未登录时工作台仅在本次窗口中保留练习；独立打开标准模板时保存到本机浏览器，不跨设备。两者都不会冒充云端已保存。

旧版本只保存过最后一次答案，升级时将它保留为 **1 次历史记录**，无法恢复之前未曾记录的尝试。后台用事务和逐题锁更新最新状态与累计次数，并按提交 ID 去重，避免网络重试重复计数。

## 私人 HTML 与公开 HTML

| 类型 | 管理位置 | 可见范围 | 内容更新 |
| --- | --- | --- | --- |
| 私人 HTML | 网站「管理 HTML」 | 仅站点主人登录后可读写 | 保存后立即生效；其他设备刷新获取 |
| GitHub HTML | GitHub 仓库分类文件夹 | 公开，独立 URL 也能访问 | 提交后经 Actions 发布 |

原有 `基础科学/细胞周期与遗传信息.html`、`生物化学/新生儿黄疸与核黄素.html` 仍为公开内容；个人答题记录不放入 GitHub。网站登录不会把 GitHub 公开文件变成私有文件。

私人上传支持 UTF-8 单文件 HTML，最大 **2 MB**。图片、CSS、JavaScript 请内嵌或使用完整 HTTPS 地址；不支持同时上传资源文件夹。名称按 `分类/小节.html` 显示。链接使用固定 ID，改名后链接和学习记录仍然有效；复制私人页面链接后，其他设备也需要登录同一个账号。

HTML 在隔离的 iframe 中运行，不获得工作台的登录令牌。私人页面通过数据库读取后显示，不产生公开文件地址，因此不提供「独立打开」，可以下载原 HTML。

删除私人 HTML 会立即移除该页面，已有学习记录和笔记保留，可在「学习记录」中单独管理。删除前请按需要下载备份。

## 公开文件命名与上传

新增题库统一为 **分类/小节.html**，例如 `基础科学/细胞生物学.html`。两个已有文件为保持当前网址继续沿用原文件名：

```text
基础科学/细胞周期与遗传信息.html
生物化学/新生儿黄疸与核黄素.html
```

在 GitHub 仓库 **Add file → Upload files** 上传分类文件夹，提交到 `main`。Actions 中 **Publish HTML library** 成功后，页面自动加入目录。标题取自 `<title>`，分类取自文件夹；附属资源一起上传并保留相对路径。替换文件会更新内容，删除文件会移出公开目录。旧编号链接已移除，不保留跳转。

- 首页：`https://calebchu40-gif.github.io/tmu-usmle-caleb/`
- 带导航内容：`#/page/基础科学%2F细胞周期与遗传信息.html`
- 私人内容：`#/page/私有%2F<页面固定ID>`
- 记录：`#/records`；HTML 管理：`#/manage`；账号：`#/account`

## 模板源码与构建

`content/cell-biology.json`、`content/nutrition-vitamins.json` 是两个内置示例小节的题目数据；`content/upload-test.json` 是私人上传测试样例数据；布局与行为统一维护在 `templates/section-shell.html`、`assets/quiz.css` 和 `assets/quiz.js`。`npm run generate:quizzes` 生成两份可独立使用的内容 HTML、`templates/小节题库模板.html` 和 `tests/fixtures/上传测试小节.html`。普通上传的新 HTML 无需参加生成步骤。

构建时扫描标准模板的 `quiz-data`，将题目索引写入公开目录。模板下载文件不列入题库。私人 HTML 的题目索引在保存时提取，不把私有内容写进 GitHub。

标准模板使用 `tmu-study-v2` 的消息接口与工作台交互。每次提交或星标变更携带独立请求 ID；工作台确认后，题目更新统计。HTML 不会收到登录令牌。旧的 `StudyBridge` 单题接口仍可读取原记录；要使用重复答题历史和完整小节索引，请采用新模板。

## 云端部署与单人权限

技术结构：**GitHub Pages + Supabase Auth + PostgreSQL**。Supabase 客户端在构建时打包到网站，无运行时 CDN 依赖。

在新 Supabase 项目中配置：

1. 在 SQL Editor 按顺序执行 `supabase/migrations/001_personal_workspace.sql` 和 `002_question_history.sql`。已有第一版的项目只执行第二个迁移一次。
2. Authentication → Sign In / Providers 关闭 **Allow new users to sign up**，保持匿名登录关闭。
3. Authentication → Users → Add user → Create new user，创建自己的邮箱/密码账号；密码本人设置，Auto confirm user 保持开启。
4. 用该账号的 UUID 在 SQL Editor 执行：

   ```sql
   insert into public.workspace_owner(user_id) values ('你的账号 UUID');
   ```

5. `site.config.json` 的 `cloud` 填入项目 URL 和 `sb_publishable_...` 公开密钥后提交部署。禁止把数据库密码、secret key 或 service_role key 放进配置或 Git；构建会拒绝非 publishable key。
6. 可执行 `supabase/verify-access.sql` 验证主人增删改查、其他账号和匿名访问隔离；测试在事务内回滚，不留下测试数据。`supabase/verify-question-history.sql` 另外验证最后状态、正确/错误累计、独立题目、星标、重复请求及权限隔离。

`workspace_owner` 只能由数据库管理员登记，前端不能把自己注册为主人。所有个人数据表均开启行级权限：既要求当前账号是唯一主人，也要求记录属于该账号。登录界面没有注册入口，且数据库规则独立生效。

表结构：

- `study_records`：每题最后一次结果、累计正确/错误次数、星标、笔记与时间。
- `study_attempts`：每次提交的答案、对错和时间，删除题目记录时级联删除。
- `study_favorites`：页面收藏。
- `study_pages`：私人 HTML、小节名称、分类、题目索引和更新时间。
- `workspace_owner`：唯一主人账号 ID。

忘记登录密码时，在 Supabase Authentication 中管理自己的账号。数据库密码与网站登录密码是两套不同凭据。项目暂停或服务不可用时，原公开页面仍可阅读，私人数据需要云端服务恢复后访问。

官方参考：[Supabase Auth](https://supabase.com/docs/guides/auth)、[RLS 权限](https://supabase.com/docs/guides/database/postgres/row-level-security)、[公开密钥与服务端密钥](https://supabase.com/docs/guides/getting-started/api-keys)。

## 项目结构与本地开发

- `index.html`、`assets/app.*`：导航、目录、路由和 HTML 容器。
- `assets/personal.js`：登录、HTML 和记录管理、答题同步。
- `assets/cloud.js`：Supabase 数据访问和账号检查。
- `assets/study-bridge.js`：嵌入题库的保存/恢复接口。
- `supabase/`：数据结构和权限验证 SQL，不发布到网站。
- `site.config.json`：站点名、默认页、标题覆盖和公开云端连接配置。
- `scripts/build.py`：生成页面目录及发布文件；`scripts/bundle.mjs`：打包客户端。
- `tests/`：构建、路由、收藏、记录/HTML 管理、失败反馈和答题恢复测试。

需要 Python 3 和 Node.js 24：

```sh
npm ci
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

打开 `http://localhost:8000/`。修改后重新构建。`dist/`、`node_modules/` 不提交到 Git。

## GitHub 发布与域名

仓库 **Settings → Pages → Source** 使用 **GitHub Actions**。每次推送 `main` 都会测试、构建并发布 `dist/`；失败时保留上一次成功部署。

若要使用自己的域名，在 Pages 的 Custom domain 设置并配置 DNS。框架使用相对路径，原内容路径可以继续使用；标准模板已内嵌全部资源，不依赖固定域名。

### 清除全部学习数据

登录后进入「个人账号 → 清除全部学习数据」，连续通过两次确认后执行。任意一次取消都不会清除数据。

此操作永久清空页面收藏、题目复习标记、学习记录（包括手动笔记）、每次答题历史和累计正确 / 错误次数；题目恢复未做状态。数据库中的 HTML 文件、小节题目目录和账号保留。云端在同一事务内清除数据，失败不会只清掉一部分。其他设备刷新后显示清除后的状态；清除过程中请暂停其他设备的作答，之后新提交的答案会形成新的记录。独立下载打开的 HTML 在各自浏览器保存的本地记录不属于云端数据。

已有数据库需执行 `supabase/migrations/003_clear_learning_data.sql`；全新数据库在 `001`、`002` 之后执行。可运行 `supabase/verify-clear-learning-data.sql` 验证清除范围和访问控制；该验证会回滚整个事务，不改变现有数据。

### 管理上传的 HTML 文件

「管理 HTML → 已上传的 HTML 文件」显示文件总数、分类 / 小节文件名、上传和更新时间；标准题库还显示题目数量。每个文件支持打开、编辑、下载和删除。删除必须连续确认两次，确认框会明确显示目标文件名；只删除所选 HTML，其他文件与已有学习记录保留。需要备份时请先下载。

测试样例：`tests/fixtures/上传测试小节.html`，包含两道功能测试题，可通过「上传 HTML → 选择 HTML 文件」上传。它不会随 GitHub Pages 作为公开学习页面发布。
