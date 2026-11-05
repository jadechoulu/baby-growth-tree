# Hello资料包复核与视频补齐

2026-11-05，本地完成；未提交、未发布。

## 复核结果

- 139份PDF／MP3／M4A来源全部归册，128个哈希唯一文件；40份图片来源已核对归类。6、16号天气拓展杂志补入素材卡。
- 24册原书入口只取明确的original-book角色，避免活动PDF误充原书。
- 30个资料包视频全部生成极空间180天／1000次／免密码分享，保留短链及解析后的长链。19项有明确Part依据，11项仅归册；同名不跨册误配，拓展不改写主套唱曲调。
- 1号hair cut.mp4完整文件58371059字节，SHA256为58156c9ea2ff76855f779b87ac38a53401039a2e369f36c88162b795919974b7，249.94秒；本地完整解码后上传并使用新分享。原残片未删除，不参与当前资源入口。
- I Love You Through and Through及Zoom Zoom Zoom We’re Going to the Moon已按笔记与歌词采用资料包完整MP3；Apple Red Apple Round、听妈妈的话改为参考音源待补，仍保留Hello演唱。

## 验收

- node --test tests/english-file-preview.test.mjs tests/hello-*.test.mjs：54/54通过。
- python3 tests/english-pages.test.py：3/3通过，验证发布文件与引用字节一致。
- python3 english/build.py及node scripts/build-site.mjs成功；普通入口、离线文件和整站产物生成。git diff --check通过。
- 2号Part3显示06.I Have A Pet.mp4拓展视频；点击在当前页打开正确分享。先播放Rockin’ Baby再打开视频，audio.paused由false变为true；关闭移除iframe并恢复原入口焦点，URL不变。
- 补齐后的1号hair cut.mp4在整册配套视频中可查，弹窗原站文件大小55.7MB；实际播放readyState=4、paused=false、currentTime=23.89秒。关闭后iframe=0，焦点回查看hair cut.mp4。
- 本轮实际536px与1280px窗口检查正常；375px能力覆盖调用未改变目标tab实际宽度，未将其当作375px通过证据。此前375px文件弹窗及筛选验收见acceptance.md；本轮新增入口仍需真实375px复查。

## 仍存原站限制

抽查2号06.I Have A Pet.mp4可打开实际文件列表，但原站播放器出现过“转码失败，请稍后重试”；已点击原站重试，未取得成功播放证据。不能用分享302解析成功代替视频播放成功，也未声称30条全部逐一播放验证。1号完整视频已实际播放通过，播放器整体可工作。

证据保存在育儿资料目录Hello视频核对_20261105，包括MP4资源入库核验_20261105.json、极空间MP4分享结果_20261105.json、极空间MP4分享跳转核验_20261105.json、补齐视频页内播放.jpg及资料包视频入口.jpg。
