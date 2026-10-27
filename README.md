# 小芽 · 宝宝成长技能树

按月龄查看 248 个技能、239 条进阶关系，支持完成与回退、成长手记、完整技能脉络及 JSON 备份。

这是可直接部署到 GitHub Pages 的静态网页，无需安装依赖或构建。

在线访问：[小芽成长技能树](https://jadechoulu.github.io/baby-growth-tree/)。

源代码：[jadechoulu/baby-growth-tree](https://github.com/jadechoulu/baby-growth-tree)。

## 数据保存

宝宝资料、完成记录和手记保存在当前浏览器的 IndexedDB，查看偏好保存在 localStorage。网页代码不包含个人完成记录，应用也不会将记录上传到 GitHub。

存储按网站来源隔离，不会自动跨浏览器或设备同步。从本地预览迁移时，请先导出 JSON 备份，再到线上网址导入。

同一账号下的 GitHub Pages 项目通常共享来源；当前数据库名为 `xiaoya-growth`，建议仅部署一份此应用，避免同源副本共享记录。

## 本地预览

```sh
python3 -m http.server 5317 --bind 127.0.0.1
```

用浏览器打开 http://127.0.0.1:5317/ 。JavaScript 模块需通过 HTTP 或 HTTPS 运行。

## 验证

```sh
node --check app.mjs
node --test tests/*.test.mjs
```

## 内容维护

- `data/catalog.json`：技能及前后关系。保留技能 ID 可复用原有记录。
- `data/stage-resources.json`：年龄段陪伴说明、启蒙活动和玩具候选。
- `lib/storage.mjs`：IndexedDB 保存和旧数据迁移。
- `assets/original.pdf`：网页所用原始技能图谱。

GitHub Pages 的网页公开可访问；使用者的个人记录仍分别保存在各自浏览器里。后续更新发布目录后提交并推送，即可刷新线上代码。

## 更新发布

此目录是独立的发布副本。修改并验证这里的网页文件后执行：

```sh
git add -- index.html app.mjs styles.css theme.css graph.css lib data assets tests README.md
git diff --cached --check
git diff --cached --stat
git commit -m "更新成长技能树"
git push
```

Pages 从 `codex/pages` 分支根目录部署。GitHub CLI 使用系统钥匙串保存登录凭据，可用 `gh auth status` 检查登录状态。
