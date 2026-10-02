# TMU · Caleb 个人学习工作台

保留左侧分类导航，在右侧阅读 HTML；登录个人账号后，学习记录、收藏和私人 HTML 保存到 Supabase，可在不同设备使用。

**网站：https://calebchu40-gif.github.io/tmu-usmle-caleb/**

## 日常使用

1. 左侧「个人账号」使用站点主人的邮箱和密码登录。本站不开放注册。
2. 「学习记录」支持新增笔记、搜索、按错题/待复习筛选、编辑、删除和导出 JSON。
3. 现有两份题库在工作台中提交答案或标记复习时自动保存。重新打开页面会恢复已保存的答案；在学习记录中删除相应答题记录后可以重新作答。
4. 「管理 HTML」可上传、查看、修改名称/分类/源码、下载和删除私人 HTML。保存后立即更新左侧目录，不需要等待 GitHub 部署。
5. 收藏页面在登录时保存到云端。未登录时的收藏仅保存在当前浏览器，与云端收藏分开；登录后可重新收藏需要同步的页面。

每次操作会显示保存结果。网络失败不会显示“已保存”：表单保留输入，答题记录可点击「重试保存」。未完成的答题保存只保留在本次窗口中，关闭前请完成重试。多设备同时编辑同一记录时，检测到版本变化会提示刷新后再操作。

## 私人 HTML 与公开 HTML

| 类型 | 管理位置 | 可见范围 | 内容更新 |
| --- | --- | --- | --- |
| 私人 HTML | 网站「管理 HTML」 | 仅站点主人登录后可读写 | 保存后立即生效；其他设备刷新获取 |
| GitHub HTML | GitHub 仓库分类文件夹 | 公开，独立 URL 也能访问 | 提交后经 Actions 发布 |

原有 `基础科学/细胞周期与遗传信息.html`、`生物化学/新生儿黄疸与核黄素.html` 仍为公开内容；个人答题记录不放入 GitHub。网站登录不会把 GitHub 公开文件变成私有文件。

私人上传支持 UTF-8 单文件 HTML，最大 **2 MB**。图片、CSS、JavaScript 请内嵌或使用完整 HTTPS 地址；不支持同时上传资源文件夹。名称按 `分类/知识点.html` 显示。链接使用固定 ID，改名后链接和学习记录仍然有效；复制私人页面链接后，其他设备也需要登录同一个账号。

HTML 在隔离的 iframe 中运行，不获得工作台的登录令牌。私人页面通过数据库读取后显示，不产生公开文件地址，因此不提供「独立打开」，可以下载原 HTML。

删除私人 HTML 会立即移除该页面，已有学习记录和笔记保留，可在「学习记录」中单独管理。删除前请按需要下载备份。

## 公开文件命名与上传

内容文件统一为 **分类/知识点.html**，例如：

```text
基础科学/细胞周期与遗传信息.html
生物化学/新生儿黄疸与核黄素.html
```

在 GitHub 仓库 **Add file → Upload files** 上传分类文件夹，提交到 `main`。Actions 中 **Publish HTML library** 成功后，页面自动加入目录。标题取自 `<title>`，分类取自文件夹；附属资源一起上传并保留相对路径。替换文件会更新内容，删除文件会移出公开目录。旧编号链接已移除，不保留跳转。

- 首页：`https://calebchu40-gif.github.io/tmu-usmle-caleb/`
- 带导航内容：`#/page/基础科学%2F细胞周期与遗传信息.html`
- 私人内容：`#/page/私有%2F<页面固定ID>`
- 记录：`#/records`；HTML 管理：`#/manage`；账号：`#/account`

## 新题库如何保存答案

框架不会自动拆解任意 HTML 的题目。只需阅读的 HTML 直接上传即可；需要保存答题进度的页面，接入 `assets/study-bridge.js`，给每道题一个稳定、唯一的编号：

```html
<script src="https://calebchu40-gif.github.io/tmu-usmle-caleb/assets/study-bridge.js"></script>
<script>
StudyBridge.onRestore(records => {
  // records 中包含 question_id、selected、submitted、correct、marked。
  // 恢复页面 UI，不要在恢复过程中再次保存。
});
// 用户提交答案时调用；selected 为从 0 开始的选项编号。
function saveAnswer() {
  StudyBridge.save({
    question_id: 'cell-cycle-question-1',
    selected: 0,
    submitted: true,
    correct: true,
    marked: false
  });
}
</script>
```

接口只在工作台 iframe 内保存数据，独立打开 HTML 不会登录或同步。题目 ID 使用字母、数字、下划线或短横线，最长 100 个字符。答题记录按“用户 + 页面固定路径 + 题目 ID”存储最新状态，不保留每次尝试的历史。现有两份题库已接入。

## 云端部署与单人权限

技术结构：**GitHub Pages + Supabase Auth + PostgreSQL**。Supabase 客户端在构建时打包到网站，无运行时 CDN 依赖。

在新 Supabase 项目中配置：

1. 在 SQL Editor 执行 `supabase/migrations/001_personal_workspace.sql`。
2. Authentication → Sign In / Providers 关闭 **Allow new users to sign up**，保持匿名登录关闭。
3. Authentication → Users → Add user → Create new user，创建自己的邮箱/密码账号；密码本人设置，Auto confirm user 保持开启。
4. 用该账号的 UUID 在 SQL Editor 执行：

   ```sql
   insert into public.workspace_owner(user_id) values ('你的账号 UUID');
   ```

5. `site.config.json` 的 `cloud` 填入项目 URL 和 `sb_publishable_...` 公开密钥后提交部署。禁止把数据库密码、secret key 或 service_role key 放进配置或 Git；构建会拒绝非 publishable key。
6. 可执行 `supabase/verify-access.sql` 验证主人增删改查、其他账号和匿名访问隔离；测试在事务内回滚，不留下测试数据。

`workspace_owner` 只能由数据库管理员登记，前端不能把自己注册为主人。三张数据表均开启行级权限：既要求当前账号是唯一主人，也要求记录属于该账号。登录界面没有注册入口，且数据库规则独立生效。

表结构：

- `study_records`：答题结果、复习标记、笔记与时间。
- `study_favorites`：页面收藏。
- `study_pages`：私人 HTML、名称、分类和更新时间。
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

若要使用自己的域名，在 Pages 的 Custom domain 设置并配置 DNS。框架使用相对路径，分类和知识点路径可以继续使用；题库引用 bridge 的绝对 URL 可按需要同步修改。
