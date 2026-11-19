# WeReadFocus · Read

非官方 Tampermonkey 用户脚本，增强微信读书网页版（`weread.qq.com/web/reader/`）的阅读体验。

## 功能

- **窄栏阅读**：单栏下收窄正文并居中，每行 25~40 字可调，接近纸质书行宽。
- **沉浸模式**：扩大书页区域，隐藏顶栏与侧栏。
- **扩展快捷键**：`A/W` 上一页 · `S/D/空格` 下一页。
- **阅读进度条**：页面顶部显示当前阅读进度。
- **全屏阅读**：面板内一键进入/退出浏览器全屏。
- 浅色/暗色主题自动适配；双栏模式下窄栏自动暂停，切回单栏自动恢复。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox 均可）。
2. 打开安装地址：

   <https://raw.githubusercontent.com/xrt-wg/wereadfocus-read/release/src/wereadfocus-read.user.js>

   Tampermonkey 会弹出安装页；如果浏览器直接显示了源码，把全文复制到 Tampermonkey 的「新建脚本」中保存即可。
3. 打开 <https://weread.qq.com/web/reader/> 下任意一本书。

## 更新

脚本头包含 `@updateURL` / `@downloadURL`，指向 `release` 分支的正式文件。Tampermonkey 会定期检查更新，也可在脚本详情页手动「检查更新」。

## 隐私与权限

- 只申请 `GM_addStyle` / `GM_getValue` / `GM_setValue`，不申请网络权限。
- 设置仅保存在本浏览器的 Tampermonkey 存储中，不上传任何数据。

## 来源与版权

本脚本基于 Dio.Ye 的 [WeRead+](https://github.com/diov)（MIT License）二次开发，在其基础上新增了窄栏阅读、双栏自动暂停等能力。

[MIT](LICENSE) · Copyright (c) Dio.Ye · Copyright (c) 2026 Kaven

> 本项目为个人维护的非官方工具，与微信读书 / 腾讯无关。原站页面结构变化后脚本可能失效。
