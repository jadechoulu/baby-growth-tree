# 小芽 · 成长与英语启蒙

[工具首页](https://jadechoulu.github.io/baby-growth-tree/home.html) · [成长技能树](https://jadechoulu.github.io/baby-growth-tree/) · [英语启蒙](https://jadechoulu.github.io/baby-growth-tree/english/index.html#routes)

这是统一站点的自动生成发布副本，保留原有成长树网址。首页与各分类共用导航框架，顶部、目录、详情与预览内均可切换分类，也可返回首页。

- `index.html`：成长技能树，按月龄查看技能、完整脉络和下一步。
- `english/index.html`：英语路线阶段对照、素材套系与儿歌歌单。
- `home.html`：全站分类总入口。

## 内容维护

源码统一维护在公开仓库 [jadechoulu/baby-growth-tree](https://github.com/jadechoulu/baby-growth-tree) 的 `main` 分支，当前 `codex/pages` 分支只接收 `scripts/build-site.mjs` 生成的 `dist/site`。更新应在 `main` 完成测试后，运行 `scripts/publish-site.mjs` 同步发布包；不复制个人记录、备份或原私有 Git 历史。

GitHub Pages 继续从 `codex/pages` 分支根目录发布。静态网页、图片和原文资料可公开查看；此发布副本不包含个人生日、成长记录、手记、收藏或本机来源路径。

## 个人记录

昵称和生日由当前浏览器的共享 IndexedDB 档案统一读取；成长技能记录和英语词汇、素材进度、收藏保留各自存储。切换分类不会清除记录，也不自动跨设备同步。保留原有网站来源及存储名称后，已有本机记录仍可读取。可在各自工具中导出备份。
