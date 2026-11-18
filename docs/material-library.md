# 共享素材图鉴模板

`shared/material-library.js`与`shared/material-library.css`是英语、全科共同使用的原生DOM模板和样式。新增素材页面沿用这两个文件，不复制卡片和切换控件；无需引入框架。

通过`XiaoyaMaterialLibrary.create({h, icon})`接入当前页面的DOM工厂与图标；不传`icon`时使用模板自带图标。`card({attrs, cover, title, meta, tools, footer})`接收真实DOM插槽，保留原有事件、委托属性、标签、完成控件和详情入口。`layoutControls({grouping, onGrouping, layout, onLayout, prefix})`提供套系／单本、列表／封面两个独立维度；`reset()`与`resultsHead()`复用重置和结果栏。模板仅生成界面，回调由领域页面实现。

结果网格使用`resource-grid library-grid`；封面视图追加`library-cover-grid`。当前页面容器使用`library-view`，主题读取全站`--site-*`变量。公共卡片尺寸、封面、标题、工具区、响应式与焦点样式仅在共享CSS维护。英语的用途色、主题、歌单及全科的班级、计划状态各自作为插槽传入，不在模板中存状态或目录。

分组和布局是临时浏览偏好，不进入个人进度。改变布局只切换网格类名，保留节点、筛选、焦点和可见卡片位置；改变分组才重新派生结果。书目按稳定ID去重并保留所有目录引用，版次筛选不改变完整目录分母。全科单本与套系详情共用完成控件，英语单册继续使用原英语存储与同步；无逐册目录的动画、教具及选材方向保留资料入口。

长列表调用`EnglishAutomaticList`分批追加；目录读取共用在途请求，失败可重试，旧请求不得覆盖新筛选或其他页面。英语构建内嵌模板及CSS，覆盖普通入口与离线单文件；全科通过同源文件加载，两文件进入统一发布白名单。

2026-11-19：英语与全科的“其他”书架共同调用 `shelfCard()`、`bookCard()`，套系点击封面／标题查看详情，不另放展开箭头；`bookCover()`、`completionControl()`、`readCountBadge()`及对应样式也由共享层生成。单册来源放在勾选提示与无障碍名称中，阅读次数大于1时显示封面角标，不重复显示“中文小花生已读”行。各分类只派生真实完成、完整书架分母与回调，不合并个人记录或把书架子集当出版总量。列表／封面仅切换布局类名。
