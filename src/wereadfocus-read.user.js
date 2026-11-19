// ==UserScript==
// @name         WeReadFocus · Read
// @namespace    https://github.com/xrt-wg/wereadfocus-read
// @version      0.2.9
// @description  Enhances the WeRead web reading experience.
// @description:zh-CN 增强微信读书网页版的阅读体验。
// @author       Kaven
// @license      MIT
// @compatible   chrome
// @compatible   firefox
// @match        https://weread.qq.com/web/reader/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @homepageURL  https://github.com/xrt-wg/wereadfocus-read
// @downloadURL  https://raw.githubusercontent.com/xrt-wg/wereadfocus-read/release/src/wereadfocus-read.user.js
// @updateURL    https://raw.githubusercontent.com/xrt-wg/wereadfocus-read/release/src/wereadfocus-read.user.js
// ==/UserScript==

/*
 * WeReadFocus · Read —— 增强微信读书网页版阅读体验。
 *
 * 基于 Dio.Ye 的 WeRead+（MIT License）二次开发。
 *
 * Copyright (c) Dio.Ye
 * Copyright (c) 2026 Kaven
 * License: MIT
 */

(function () {
    'use strict';

    const ID = {
        control: 'wrx-reading-control',
        panel: 'wrx-reading-panel',
        progressBar: 'wrx-reading-progress-bar',
    };

    const STORAGE = {
        immersive: 'wrx-immersive-v1',
        shortcuts: 'wrx-shortcuts-v1',
        narrow: 'wrx-narrow-v1',
        measure: 'wrx-measure-v1',
        settingsVersion: 'wrx-settings-version',
    };

    const MEASURE_MIN = 25;
    const MEASURE_MAX = 40;
    const MEASURE_DEFAULT = 38;

    const state = {
        immersive: readImmersive(),
        shortcuts: Boolean(GM_getValue(STORAGE.shortcuts, false)),
        narrow: Boolean(GM_getValue(STORAGE.narrow, false)),
        measure: readMeasure(),
        dualPage: false,
        dualPageTimer: 0,
        measurePx: 0,
        effectiveChars: 0,
        measureLimited: false,
        fontPx: 0,
        panelOpen: false,
        notice: '',
        action: '',
        syncTimer: 0,
        observedBody: null,
        reader: null,
        progressList: null,
        layoutKey: '',
        reflowPending: false,
        reflowTimer: 0,
        loadingTimer: 0,
        fullscreen: false,
    };

    GM_addStyle(`
        /* Reading progress rendered by WeRead in its persistent catalog. */
        #${ID.progressBar}[hidden] {
            display: none !important;
        }

        #${ID.progressBar} {
            position: fixed;
            top: 0;
            left: 0;
            z-index: 9998;
            width: 0;
            height: 4px;
            color: #d0d3d8;
            background: currentColor;
            opacity: 0.32;
            pointer-events: none;
            transition: width 300ms ease;
        }

        body.wr_whiteTheme #${ID.progressBar} {
            color: #344054;
        }

        @media (prefers-reduced-motion: reduce) {
            #${ID.progressBar} {
                transition: none;
            }
        }

        /* Immersive layout: change only the reader viewport, never its children. */
        body.wrx-immersive:not(.wrx-panel-open) .readerTopBar {
            opacity: 0 !important;
            pointer-events: none !important;
        }

        body.wrx-immersive .readerChapterContent {
            box-sizing: border-box !important;
            width: calc(100% - clamp(48px, 8vw, 112px)) !important;
            height: calc(100% - 48px) !important;
            margin: 24px clamp(24px, 4vw, 56px) 0 !important;
        }

        /* Narrow measure: one centered column with a comfortable line length.
           Horizontal padding keeps the text off the page edge; applyMeasureWidth
           reads this padding, so the measure width stays consistent automatically. */
        body.wrx-narrow .readerChapterContent {
            box-sizing: border-box !important;
            width: var(--wrx-measure-px, 760px) !important;
            max-width: 100% !important;
            margin-left: auto !important;
            margin-right: auto !important;
            padding: 0 36px !important;
        }

        /* The reading "page" (background shell) must follow the same measure. */
        body.wrx-narrow .app_content {
            width: var(--wrx-measure-px, 760px) !important;
            max-width: var(--wrx-measure-px, 760px) !important;
            margin-left: auto !important;
            margin-right: auto !important;
        }

        /* Keep WeRead controls in their original DOM tree. */
        body.wrx-mounted.wrx-immersive:not(.wrx-panel-open) .readerControls {
            opacity: 0 !important;
            pointer-events: none !important;
        }

        body.wrx-panel-open .readerControls {
            position: fixed !important;
            inset: auto !important;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            align-content: center !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            overflow: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            transform: none !important;
            z-index: 10002 !important;
        }

        body.wrx-panel-open .readerControls > * {
            position: relative !important;
            inset: auto !important;
            flex: 0 0 40px !important;
            width: 40px !important;
            height: 40px !important;
            margin: 0 !important;
            align-self: center !important;
        }

        body.wrx-panel-open .readerControls > * .wr_tooltip_container,
        body.wrx-panel-open .readerControls > * .readerControls_item {
            position: relative !important;
            inset: auto !important;
            width: 40px !important;
            height: 40px !important;
            margin: 0 !important;
        }

        body.wrx-panel-open .readerControls > * .readerControls_item {
            box-sizing: border-box !important;
            padding: 0 !important;
            display: grid !important;
            place-items: center !important;
        }

        body.wrx-panel-open .readerControls > * .readerControls_item > .icon,
        body.wrx-panel-open .readerControls > * .readerControls_item > svg {
            width: 40px !important;
            height: 40px !important;
            margin: 0 !important;
            transform: none !important;
        }

        body.wrx-panel-open .readerControls .wr_tooltip_item {
            display: none !important;
        }

        /* Visually dock the original Header content without moving its nodes. */
        body.wrx-panel-open .readerTopBar {
            overflow: visible !important;
            background: transparent !important;
            opacity: 1 !important;
            pointer-events: none !important;
            z-index: 10003 !important;
        }

        body.wrx-panel-open .readerTopBar_inner {
            position: absolute !important;
            display: flex !important;
            box-sizing: border-box !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            pointer-events: auto !important;
            transform: none !important;
        }

        body.wrx-panel-open .readerTopBar_left {
            display: flex !important;
            min-width: 0 !important;
            flex: 0 0 auto !important;
            align-items: center !important;
            justify-content: flex-start !important;
            margin: 0 !important;
            overflow: hidden !important;
        }

        /* 隐藏书名与其左侧书本图标 */
        body.wrx-panel-open .readerTopBar_left::before,
        body.wrx-panel-open .readerTopBar_title {
            display: none !important;
            content: none !important;
        }

        body.wrx-panel-open .readerTopBar_home,
        body.wrx-panel-open .readerTopBar_link_sep,
        body.wrx-panel-open .readerTopBar_addToShelf_wrapper,
        body.wrx-panel-open .menu_container {
            display: none !important;
        }

        body.wrx-panel-open .readerTopBar_right {
            position: static !important;
            display: flex !important;
            flex: 0 0 auto !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 12px !important;
            margin: 0 !important;
        }

        /* 两个文字入口与全屏图标共用 30px 行高与无边框幽灵按钮样式 */
        body.wrx-panel-open .readerTopBar_link {
            display: inline-flex !important;
            align-items: center !important;
            box-sizing: border-box !important;
            height: 30px !important;
            padding: 0 6px !important;
            margin: 0 !important;
            border-radius: 8px !important;
            font-size: 12px !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            transition: background 120ms ease;
        }

        body.wrx-panel-open .readerTopBar_link:hover {
            background: rgba(128, 128, 128, 0.14) !important;
        }

        /* Right-bottom launcher */
        #${ID.control} {
            position: fixed;
            right: 24px;
            bottom: 24px;
            z-index: 10001;
            width: 50px;
            height: 48px;
        }

        #${ID.control} button {
            display: grid !important;
            width: 50px !important;
            height: 48px !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 12px 0 0 12px !important;
            color: #d0d3d8 !important;
            background: #1c1c1d !important;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.24);
            cursor: pointer;
            place-items: center;
        }

        #${ID.control} button svg {
            width: 21px;
            height: 21px;
        }

        body.wr_whiteTheme #${ID.control} button {
            color: #344054 !important;
            background: #fff !important;
        }

        #${ID.control} button[aria-expanded='true'] {
            box-shadow: inset 0 0 0 2px rgba(46, 123, 246, 0.72), 0 5px 20px rgba(0, 0, 0, 0.2);
        }

        /* Enhancement panel */
        #${ID.panel}[hidden] {
            display: none !important;
        }

        #${ID.panel} {
            position: fixed;
            right: 24px;
            bottom: 84px;
            z-index: 10000;
            box-sizing: border-box;
            width: 324px;
            max-height: calc(100vh - 32px);
            padding: 16px;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            color: #eef0f4;
            background: #28292b;
            box-shadow: 0 18px 55px rgba(0, 0, 0, 0.32);
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        body.wr_whiteTheme #${ID.panel} {
            border-color: rgba(22, 31, 44, 0.1);
            color: #1d2733;
            background: #fff;
            box-shadow: 0 18px 55px rgba(35, 47, 62, 0.18);
        }

        .wrx-switch-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        /* 分组：上半区为导航/工具/操作，下半区为开关项 */
        .wrx-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .wrx-group + .wrx-group {
            padding-top: 16px;
            border-top: 1px solid rgba(128, 128, 128, 0.16);
        }

        /* 首栏：原生导航靠左，全屏按钮靠右，同一行垂直居中 */
        .wrx-header-row {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            height: 36px;
        }

        .wrx-header-slot {
            position: relative;
            box-sizing: border-box;
            flex: 1 1 auto;
            min-width: 0;
            height: 100%;
        }

        /* 原生工具栏槽位：透明，仅占高度 */
        .wrx-tools-slot {
            position: relative;
            box-sizing: border-box;
            width: 100%;
            height: 44px;
        }

        .wrx-fullscreen-btn {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 30px;
            height: 30px;
            padding: 0;
            border: 0;
            border-radius: 8px;
            color: inherit;
            background: transparent;
            cursor: pointer;
            transition: background 120ms ease;
        }

        .wrx-fullscreen-btn:hover {
            background: rgba(128, 128, 128, 0.14);
        }

        .wrx-fullscreen-btn:focus-visible {
            outline: 2px solid #4a86e8;
            outline-offset: 1px;
        }

        .wrx-fullscreen-btn svg {
            width: 18px;
            height: 18px;
        }

        .wrx-fullscreen-btn .wrx-fs-exit {
            display: none;
        }

        body.wrx-fullscreen .wrx-fullscreen-btn .wrx-fs-enter {
            display: none;
        }

        body.wrx-fullscreen .wrx-fullscreen-btn .wrx-fs-exit {
            display: block;
        }

        .wrx-switch-row {
            gap: 16px;
            cursor: pointer;
        }

        .wrx-switch-row + .wrx-switch-row {
            margin-top: 16px;
        }

        .wrx-switch-copy {
            display: grid;
            gap: 2px;
        }

        .wrx-switch-label {
            font-size: 14px;
            font-weight: 600;
            line-height: 20px;
        }

        .wrx-switch-help,
        .wrx-note {
            color: #979ca5;
            font-size: 11px;
            line-height: 17px;
        }

        body.wr_whiteTheme .wrx-switch-help,
        body.wr_whiteTheme .wrx-note {
            color: #737e8d;
        }

        .wrx-switch {
            position: relative;
            flex: 0 0 auto;
            width: 40px;
            height: 23px;
        }

        .wrx-switch input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
        }

        .wrx-switch-track {
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: #747880;
        }

        .wrx-switch-track::after {
            position: absolute;
            top: 3px;
            left: 3px;
            width: 17px;
            height: 17px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
            content: '';
            transition: transform 150ms ease;
        }

        .wrx-switch input:checked + .wrx-switch-track {
            background: #4a86e8;
        }

        .wrx-switch input:checked + .wrx-switch-track::after {
            transform: translateX(17px);
        }

        .wrx-switch input:disabled + .wrx-switch-track {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .wrx-note {
            margin: 11px 0 0;
        }

        .wrx-note.wrx-warning {
            color: #d97706 !important;
        }

        .wrx-note-block {
            display: grid;
            gap: 6px;
        }

        .wrx-note-block[hidden] {
            display: none !important;
        }

        .wrx-note-block .wrx-note {
            margin-top: 11px;
        }

        .wrx-note-action {
            justify-self: start;
            margin: 0;
            padding: 4px 10px;
            border: 1px solid rgba(128, 128, 128, 0.3);
            border-radius: 7px;
            color: inherit;
            background: transparent;
            font: inherit;
            font-size: 11px;
            line-height: 17px;
            cursor: pointer;
        }

        .wrx-note-action[hidden] {
            display: none !important;
        }

        .wrx-note-action:hover {
            background: rgba(128, 128, 128, 0.12);
        }

        .wrx-note-action:focus-visible {
            outline: 2px solid #4a86e8;
            outline-offset: 1px;
        }

        .wrx-range-row {
            display: grid;
            gap: 6px;
        }

        .wrx-range-row[hidden] {
            display: none !important;
        }

        .wrx-range-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .wrx-range-value {
            color: #979ca5;
            font-size: 11px;
            line-height: 17px;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }

        body.wr_whiteTheme .wrx-range-value {
            color: #737e8d;
        }

        .wrx-range {
            width: 100%;
            accent-color: #4a86e8;
            cursor: pointer;
        }

        .wrx-range:focus-visible {
            outline: 2px solid #4a86e8;
            outline-offset: 2px;
        }

        .wrx-range:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        @media (max-width: 760px) {
            #${ID.panel} {
                right: 12px;
                left: 12px;
                width: auto;
            }
        }
    `);

    function readImmersive() {
        const settingsVersion = Number(GM_getValue(STORAGE.settingsVersion, 0));
        if (settingsVersion < 8) {
            GM_setValue(STORAGE.settingsVersion, 8);
            GM_setValue(STORAGE.immersive, true);
            return true;
        }
        return Boolean(GM_getValue(STORAGE.immersive, true));
    }

    function clampMeasure(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return MEASURE_DEFAULT;
        }
        return Math.min(MEASURE_MAX, Math.max(MEASURE_MIN, Math.round(number)));
    }

    function readMeasure() {
        return clampMeasure(GM_getValue(STORAGE.measure, MEASURE_DEFAULT));
    }

    function applyBodyClasses() {
        if (!document.body) {
            return;
        }

        document.body.classList.add('wrx-mounted');
        document.body.classList.toggle('wrx-panel-open', state.panelOpen);
        document.body.classList.toggle('wrx-immersive', state.immersive);
        document.body.classList.toggle('wrx-narrow', state.narrow && !state.dualPage);
    }

    function scheduleSync() {
        if (state.syncTimer) {
            return;
        }
        state.syncTimer = setTimeout(() => {
            state.syncTimer = 0;
            sync();
        }, 60);
    }

    function sync() {
        if (!document.body) {
            return;
        }

        observeBody();
        mountInterface();
        mountProgress();
        connectProgress();
        syncReaderLayout();
        applyBodyClasses();
        renderInterface();
    }

    function observeBody() {
        if (document.body === state.observedBody) {
            return;
        }

        bodyObserver.disconnect();
        state.observedBody = document.body;
        bodyObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
    }

    function mountInterface() {
        if (!document.getElementById(ID.control)) {
            const control = document.createElement('div');
            control.id = ID.control;
            control.innerHTML = `
                <button type="button" aria-label="Open WeRead+" aria-controls="${ID.panel}" aria-expanded="false">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 14v6M16 4v6"
                            stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        <circle cx="16" cy="7" r="2" stroke="currentColor" stroke-width="1.8"/>
                        <circle cx="8" cy="17" r="2" stroke="currentColor"/>
                    </svg>
                </button>
            `;
            control.querySelector('button').addEventListener('click', (event) => {
                event.stopPropagation();
                setPanelOpen(!state.panelOpen);
            });
            document.body.appendChild(control);
        }

        if (!document.getElementById(ID.panel)) {
            const panel = document.createElement('section');
            panel.id = ID.panel;
            panel.hidden = true;
            panel.setAttribute('aria-label', 'WeRead+');
            panel.innerHTML = `
                <div class="wrx-group">
                    <div class="wrx-header-row">
                        <div class="wrx-header-slot"></div>
                        <button class="wrx-fullscreen-btn" type="button" aria-label="进入全屏" aria-pressed="false" title="全屏">
                            <svg class="wrx-fs-enter" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <svg class="wrx-fs-exit" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M20 15h-4a1 1 0 0 0-1 1v4M4 15h4a1 1 0 0 1 1 1v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="wrx-tools-slot" aria-hidden="true"></div>
                </div>
                <div class="wrx-group">
                    <label class="wrx-switch-row">
                        <span class="wrx-switch-copy">
                            <span class="wrx-switch-label">沉浸模式</span>
                            <span class="wrx-switch-help">扩大书页区域，隐藏顶栏与原侧栏</span>
                        </span>
                        <span class="wrx-switch">
                            <input type="checkbox" data-immersive>
                            <span class="wrx-switch-track"></span>
                        </span>
                    </label>
                    <label class="wrx-switch-row">
                        <span class="wrx-switch-copy">
                            <span class="wrx-switch-label">扩展快捷键</span>
                            <span class="wrx-switch-help">A/W 上一页 · S/D/空格 下一页</span>
                        </span>
                        <span class="wrx-switch">
                            <input type="checkbox" data-shortcuts>
                            <span class="wrx-switch-track"></span>
                        </span>
                    </label>
                    <label class="wrx-switch-row">
                        <span class="wrx-switch-copy">
                            <span class="wrx-switch-label">窄栏阅读</span>
                            <span class="wrx-switch-help">单栏下收窄正文并居中，接近纸质书行宽</span>
                        </span>
                        <span class="wrx-switch">
                            <input type="checkbox" data-narrow>
                            <span class="wrx-switch-track"></span>
                        </span>
                    </label>
                    <div class="wrx-range-row" data-measure-row hidden>
                        <div class="wrx-range-head">
                            <span class="wrx-switch-label">每行字数</span>
                            <span class="wrx-range-value" data-measure-value>38 字</span>
                        </div>
                        <input class="wrx-range" type="range" min="25" max="40" step="1"
                            value="38" aria-label="每行字数" data-measure>
                    </div>
                    <div class="wrx-note-block" hidden>
                        <p class="wrx-note" hidden></p>
                        <button class="wrx-note-action" type="button" hidden>刷新页面</button>
                    </div>
                </div>
            `;

            panel.querySelector('[data-immersive]').addEventListener('change', (event) => {
                setImmersive(event.target.checked);
            });
            panel.querySelector('[data-shortcuts]').addEventListener('change', (event) => {
                setShortcuts(event.target.checked);
            });
            panel.querySelector('[data-narrow]').addEventListener('change', (event) => {
                setNarrow(event.target.checked);
            });
            panel.querySelector('[data-measure]').addEventListener('input', (event) => {
                setMeasure(event.target.value);
            });
            panel.querySelector('.wrx-note-action').addEventListener('click', () => {
                window.location.reload();
            });
            panel.querySelector('.wrx-fullscreen-btn').addEventListener('click', (event) => {
                event.stopPropagation();
                toggleFullscreen();
            });
            panel.addEventListener('scroll', () => {
                if (state.panelOpen) {
                    positionNativeDocks();
                }
            });
            document.body.appendChild(panel);
        }
    }

    function mountProgress() {
        if (!document.getElementById(ID.progressBar)) {
            const bar = document.createElement('div');
            bar.id = ID.progressBar;
            bar.hidden = true;
            bar.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bar);
        }
    }

    function connectProgress() {
        const list = document.querySelector('.readerCatalog_list');
        if (list !== state.progressList) {
            progressObserver.disconnect();
            state.progressList = list;
            if (list) {
                progressObserver.observe(list, {
                    attributes: true,
                    attributeFilter: ['class'],
                    characterData: true,
                    childList: true,
                    subtree: true,
                });
            }
        }
        renderProgress();
    }

    function readProgressPercent() {
        const list = state.progressList;
        if (!list) {
            return null;
        }

        const current = list.querySelector('.readerCatalog_list_item_selected');
        if (!current) {
            return null;
        }

        const progressText = current
            .querySelector('.readerCatalog_list_item_meta_progress')
            ?.textContent || '';
        const progressMatch = progressText.match(/当前读到\s*([\d.]+)\s*%/);
        return progressMatch ? Number(progressMatch[1]) : null;
    }

    function renderProgress() {
        const bar = document.getElementById(ID.progressBar);
        if (!bar) {
            return;
        }

        const percent = readProgressPercent();
        bar.hidden = percent === null;
        if (percent === null) {
            bar.style.width = '0';
            return;
        }

        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    function setTextContent(element, text) {
        if (element.textContent !== text) {
            element.textContent = text;
        }
    }

    function renderInterface() {
        const control = document.querySelector(`#${ID.control} button`);
        const panel = document.getElementById(ID.panel);
        if (!control || !panel) {
            return;
        }

        control.setAttribute('aria-expanded', String(state.panelOpen));
        panel.hidden = !state.panelOpen;
        panel.querySelector('[data-immersive]').checked = state.immersive;
        panel.querySelector('[data-shortcuts]').checked = state.shortcuts;
        panel.querySelector('[data-narrow]').checked = state.narrow;
        panel.querySelector('[data-narrow]').disabled = state.dualPage;

        const measureRow = panel.querySelector('[data-measure-row]');
        measureRow.hidden = !state.narrow;
        const measureInput = panel.querySelector('[data-measure]');
        measureInput.value = String(state.measure);
        measureInput.disabled = state.dualPage;
        const measureValue = panel.querySelector('[data-measure-value]');
        if (state.narrow && state.effectiveChars > 0 && state.measureLimited) {
            setTextContent(measureValue, `约 ${state.effectiveChars} 字（窗口限制）`);
        } else {
            setTextContent(measureValue, `${state.measure} 字`);
        }

        const dualNotice = state.dualPage
            ? (state.narrow
                ? '双栏模式下已暂停窄栏阅读，切回单栏后自动恢复。'
                : '窄栏阅读仅在单栏模式下可用。')
            : '';
        const notice = state.notice || dualNotice;

        const note = panel.querySelector('.wrx-note');
        setTextContent(note, notice);
        note.hidden = !notice;
        note.classList.toggle('wrx-warning', Boolean(notice));

        const action = panel.querySelector('.wrx-note-action');
        const showAction = state.action === 'reload';
        action.hidden = !showAction;
        panel.querySelector('.wrx-note-block').hidden = !notice && !showAction;

        if (state.panelOpen) {
            requestAnimationFrame(positionNativeDocks);
        }
    }

    function setPanelOpen(open) {
        state.panelOpen = open;
        if (!open) {
            resetNativeDocks();
        }
        applyBodyClasses();
        renderInterface();
    }

    function setImmersive(enabled, notice = '') {
        state.immersive = enabled;
        state.notice = notice;
        state.action = '';
        state.layoutKey = '';
        GM_setValue(STORAGE.immersive, enabled);
        applyBodyClasses();
        syncReaderLayout();
        renderInterface();
    }

    function setShortcuts(enabled) {
        state.shortcuts = enabled;
        GM_setValue(STORAGE.shortcuts, enabled);
        renderInterface();
    }

    function setNarrow(enabled) {
        state.narrow = enabled;
        state.notice = '';
        state.action = '';
        state.layoutKey = '';
        GM_setValue(STORAGE.narrow, enabled);
        applyBodyClasses();
        syncReaderLayout();
        renderInterface();
    }

    function setMeasure(value) {
        const measure = clampMeasure(value);
        if (measure !== state.measure) {
            state.measure = measure;
            state.notice = '';
            state.action = '';
            state.layoutKey = '';
            GM_setValue(STORAGE.measure, measure);
        }
        syncReaderLayout();
        renderInterface();
    }

    function isNativeFullscreen() {
        return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function syncFullscreenState() {
        state.fullscreen = isNativeFullscreen();
        document.body?.classList.toggle('wrx-fullscreen', state.fullscreen);
        const btn = document.querySelector('.wrx-fullscreen-btn');
        if (btn) {
            btn.setAttribute('aria-pressed', String(state.fullscreen));
            const label = state.fullscreen ? '退出全屏' : '进入全屏';
            btn.setAttribute('aria-label', label);
            btn.title = label;
        }
    }

    function toggleFullscreen() {
        const doc = document;
        const root = doc.documentElement;
        if (isNativeFullscreen()) {
            const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
            if (exit) {
                exit.call(doc);
            }
            return;
        }
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) {
            state.notice = '当前浏览器不支持全屏模式。';
            state.action = '';
            renderInterface();
            return;
        }
        const promise = request.call(root);
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
                state.notice = '全屏请求被浏览器拒绝。';
                state.action = '';
                renderInterface();
            });
        }
    }

    function positionNativeDocks() {
        if (!state.panelOpen) {
            return;
        }

        const controls = document.querySelector('.readerControls');
        const toolsSlot = document.querySelector('.wrx-tools-slot');
        if (controls && toolsSlot) {
            const slotRect = toolsSlot.getBoundingClientRect();
            const gap = 8;
            const size = 40;
            const dockWidth = slotRect.width - 2;
            const visibleChildren = Array.from(controls.children)
                .filter((child) => child.getClientRects().length > 0);
            const perRow = Math.max(1, Math.floor((dockWidth + gap) / (size + gap)));
            const rows = Math.max(1, Math.ceil(visibleChildren.length / perRow));
            const contentHeight = rows * size + (rows - 1) * gap;
            const dockHeight = Math.max(contentHeight, 42);

            // 双栏等模式会新增图标；空间不足时换行并撑高槽位，避免溢出面板边框。
            toolsSlot.style.height = dockHeight + 2 > 44 ? `${dockHeight + 2}px` : '';

            const dockRect = toolsSlot.getBoundingClientRect();
            controls.style.setProperty('left', `${dockRect.left + 1}px`, 'important');
            controls.style.setProperty('top', `${dockRect.top + 1}px`, 'important');
            controls.style.setProperty('width', `${dockRect.width - 2}px`, 'important');
            controls.style.setProperty('height', `${dockHeight}px`, 'important');
        }

        const topBar = document.querySelector('.readerTopBar');
        const topBarInner = topBar?.querySelector('.readerTopBar_inner');
        const headerSlot = document.querySelector('.wrx-header-slot');
        if (topBar && topBarInner && headerSlot) {
            const topBarRect = topBar.getBoundingClientRect();
            const slotRect = headerSlot.getBoundingClientRect();
            topBarInner.style.setProperty('left', `${slotRect.left - topBarRect.left + 1}px`, 'important');
            topBarInner.style.setProperty('top', `${slotRect.top - topBarRect.top + 1}px`, 'important');
            topBarInner.style.setProperty('width', `${slotRect.width - 2}px`, 'important');
            topBarInner.style.setProperty('height', `${slotRect.height - 2}px`, 'important');
        }
    }

    function resetNativeDocks() {
        const controls = document.querySelector('.readerControls');
        const topBarInner = document.querySelector('.readerTopBar_inner');
        const toolsSlot = document.querySelector('.wrx-tools-slot');
        if (toolsSlot) {
            toolsSlot.style.removeProperty('height');
        }
        [controls, topBarInner].forEach((element) => {
            if (!element) {
                return;
            }
            ['left', 'top', 'width', 'height'].forEach((property) => {
                element.style.removeProperty(property);
            });
        });
    }

    /* WeRead's double-page (双栏) layout is identified by its dedicated container
       classes, which are stable and independent of canvas geometry or viewport width. */
    function isDualPageLayout() {
        return Boolean(
            document.querySelector('.wr_horizontalReader')
            || document.querySelector('.readerChapterContent_container'),
        );
    }

    function updateDualPage() {
        const observed = isDualPageLayout();
        if (observed === state.dualPage) {
            if (state.dualPageTimer) {
                clearTimeout(state.dualPageTimer);
                state.dualPageTimer = 0;
            }
            return;
        }

        if (state.dualPageTimer) {
            return;
        }

        state.dualPageTimer = setTimeout(() => {
            state.dualPageTimer = 0;
            const next = isDualPageLayout();
            if (next !== state.dualPage) {
                state.dualPage = next;
                state.layoutKey = '';
                syncReaderLayout();
                applyBodyClasses();
                renderInterface();
            }
        }, 120);
    }

    function readFontPx(reader) {
        const candidates = [reader, reader?.querySelector('.wr_canvasContainer')];
        for (const element of candidates) {
            if (!element) {
                continue;
            }
            const size = parseFloat(getComputedStyle(element).fontSize);
            if (Number.isFinite(size) && size > 0) {
                return size;
            }
        }

        /* Fallback when the rendered size is unavailable: WeRead's 1-7 levels. */
        const match = (document.body?.className || '').match(/wr_reader_font_size_level_(\d+)/);
        const level = match ? Number(match[1]) : 4;
        return 16 + level * 2;
    }

    function applyMeasureWidth(reader) {
        if (!state.narrow || state.dualPage) {
            state.fontPx = 0;
            state.measurePx = 0;
            state.effectiveChars = 0;
            state.measureLimited = false;
            document.body.style.removeProperty('--wrx-measure-px');
            return;
        }

        const style = getComputedStyle(reader);
        const fontPx = readFontPx(reader);
        const spacing = parseFloat(style.letterSpacing);
        const letterSpacing = Number.isFinite(spacing) ? spacing : 0;
        const padding = (parseFloat(style.paddingLeft) || 0)
            + (parseFloat(style.paddingRight) || 0);
        const advance = Math.max(1, fontPx + letterSpacing);
        const desired = state.measure * advance + padding;
        /* Stable reference: the reading area, never a descendant of the element we
           shrink. This breaks the feedback loop that collapsed the width to 160px. */
        const area = document.querySelector('.readerContent');
        const areaWidth = area && area.clientWidth > 0 ? area.clientWidth : window.innerWidth;
        const available = Math.max(160, areaWidth - 8);
        const width = Math.round(Math.min(desired, available));

        state.fontPx = fontPx;
        state.measurePx = width;
        state.measureLimited = width + 0.5 < desired;
        state.effectiveChars = Math.max(0, Math.floor((width - padding) / advance));
        const value = `${width}px`;
        if (document.body.style.getPropertyValue('--wrx-measure-px') !== value) {
            document.body.style.setProperty('--wrx-measure-px', value);
        }
    }

    /* Reflow exactly once for each reader node, mode and viewport size. */
    function syncReaderLayout() {
        const reader = document.querySelector('.readerChapterContent');
        if (!reader) {
            return;
        }

        if (reader !== state.reader) {
            readerResizeObserver.disconnect();
            state.reader = reader;
            state.layoutKey = '';
            readerResizeObserver.observe(reader);
        }

        updateDualPage();

        applyMeasureWidth(reader);
        if (document.body) {
            document.body.classList.toggle('wrx-narrow', state.narrow && !state.dualPage);
        }

        const key = [
            state.immersive ? 'i' : '-',
            state.narrow ? 'n' : '-',
            state.dualPage ? 'd' : '-',
            state.measure,
            state.fontPx,
            state.measurePx,
            `${window.innerWidth}x${window.innerHeight}`,
        ].join(':');

        if (key === state.layoutKey) {
            return;
        }

        state.layoutKey = key;
        requestReaderReflow();
    }

    function requestReaderReflow() {
        state.reflowPending = true;
        clearTimeout(state.reflowTimer);
        state.reflowTimer = setTimeout(runReaderReflow, 160);
    }

    function runReaderReflow() {
        if (!state.reflowPending) {
            return;
        }

        state.reflowPending = false;
        clearTimeout(state.reflowTimer);
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            armLoadingWatchdog();
        });
    }

    function armLoadingWatchdog() {
        clearTimeout(state.loadingTimer);
        const watchingNarrow = state.narrow && !state.dualPage;
        if (!state.immersive && !watchingNarrow) {
            return;
        }

        const expectedLayout = state.layoutKey;
        state.loadingTimer = setTimeout(() => {
            if ((!state.immersive && !(state.narrow && !state.dualPage))
                || state.layoutKey !== expectedLayout
                || !isReaderLoading()) {
                return;
            }

            if (state.narrow && !state.dualPage) {
                state.notice = '窄栏布局未能完成重排，请刷新页面以应用行宽。';
                state.action = 'reload';
                renderInterface();
                return;
            }

            setImmersive(false, '沉浸布局未能完成重排，已自动恢复默认书页区域。');
        }, 4000);
    }

    function isReaderLoading() {
        return Array.from(document.querySelectorAll('.readerChapterContentLoading')).some((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden';
        });
    }

    function shortcutArrow(event) {
        const key = event.key.toLowerCase();
        if (key === 'a' || key === 'w') {
            return 'ArrowLeft';
        }
        if (key === 's' || key === 'd' || event.code === 'Space') {
            return 'ArrowRight';
        }
        return '';
    }

    function isInteractiveTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }
        const interactive = target.closest(
            'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])',
        );
        return Boolean(interactive?.getClientRects().length);
    }

    function dispatchReaderArrow(key) {
        const keyCode = key === 'ArrowLeft' ? 37 : 39;
        ['keydown', 'keyup'].forEach((type) => {
            const forwarded = new KeyboardEvent(type, {
                key,
                code: key,
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperties(forwarded, {
                keyCode: { get: () => keyCode },
                which: { get: () => keyCode },
            });
            document.body.dispatchEvent(forwarded);
        });
    }

    const progressObserver = new MutationObserver(renderProgress);

    const readerResizeObserver = new ResizeObserver(() => {
        if (state.reflowPending) {
            requestAnimationFrame(runReaderReflow);
        }
    });

    const bodyObserver = new MutationObserver(scheduleSync);
    const rootObserver = new MutationObserver(scheduleSync);
    rootObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    ['fullscreenchange', 'webkitfullscreenchange'].forEach((type) => {
        document.addEventListener(type, syncFullscreenState);
    });
    syncFullscreenState();

    document.addEventListener('pointerdown', (event) => {
        if (!event.isTrusted || !state.panelOpen) {
            return;
        }
        if (!event.target.closest?.(`#${ID.panel}, #${ID.control}, .readerControls, .readerTopBar`)) {
            setPanelOpen(false);
        }
    }, true);

    document.addEventListener('click', (event) => {
        if (!event.isTrusted || !state.panelOpen) {
            return;
        }

        const button = event.target.closest?.('.readerControls_item');
        if (!button || button.matches('.white, .dark')) {
            return;
        }

        setTimeout(() => {
            if (state.panelOpen) {
                setPanelOpen(false);
            }
        }, 0);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.panelOpen) {
            setPanelOpen(false);
            return;
        }

        if (!event.isTrusted
            || !state.shortcuts
            || state.panelOpen
            || event.defaultPrevented
            || event.isComposing
            || event.metaKey
            || event.ctrlKey
            || event.altKey
            || isInteractiveTarget(event.target)) {
            return;
        }

        const arrow = shortcutArrow(event);
        if (arrow) {
            event.preventDefault();
            event.stopImmediatePropagation();
            dispatchReaderArrow(arrow);
        }
    });

    window.addEventListener('resize', (event) => {
        if (state.panelOpen) {
            positionNativeDocks();
        }
        if (event.isTrusted) {
            state.layoutKey = `${state.immersive}:${window.innerWidth}x${window.innerHeight}`;
        }
    });

    window.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
    window.addEventListener('load', scheduleSync, { once: true });
    scheduleSync();
}());
