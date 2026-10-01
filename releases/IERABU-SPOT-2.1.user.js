// ==UserScript==
// @name         いえらぶ スポット 周辺環境
// @namespace    ierabu-spot-environment
// @version      2.1
// @description  いえらぶCLOUDの絞り込み済み物件に周辺環境を安全に連続自動設定します。
// @match        https://cloud.ielove.jp/*
// @updateURL    https://raw.githubusercontent.com/Alpha0727/IERABU-SPOT/main/IERABU-SPOT.user.js
// @downloadURL  https://raw.githubusercontent.com/Alpha0727/IERABU-SPOT/main/IERABU-SPOT.user.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// ==/UserScript==

(function () {
    'use strict';

    const STATE_KEY = 'ierabu_env_auto_all_state';
    const LOG_KEY   = 'ierabu_env_auto_all_log';
    const STOP_KEY  = 'ierabu_env_auto_all_stop_requested';
    const PANEL_OPEN_KEY = 'ierabu_spot_panel_open';

    const SCRIPT_VERSION = '2.1';
    const SCRIPT_URL = 'https://raw.githubusercontent.com/Alpha0727/IERABU-SPOT/main/IERABU-SPOT.user.js';
    const VERSION_URL = 'https://api.github.com/repos/Alpha0727/IERABU-SPOT/contents/latest.json?ref=main';

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function compareVersions(a, b) {
        const aa = String(a).split('.').map(Number);
        const bb = String(b).split('.').map(Number);
        const len = Math.max(aa.length, bb.length);

        for (let i = 0; i < len; i++) {
            const av = aa[i] || 0;
            const bv = bb[i] || 0;
            if (av !== bv) return av > bv ? 1 : -1;
        }

        return 0;
    }

    function checkScriptUpdate() {
        const status = document.getElementById('ierabu-spot-version');
        const alertMark = document.getElementById('ierabu-spot-update-alert');
        const button = document.getElementById('ierabu-spot-update');

        if (!status || !alertMark || !button) return;

        status.title = '更新確認中…';
        alertMark.style.display = 'none';
        button.style.display = 'none';

        GM_xmlhttpRequest({
            method: 'GET',
            url: VERSION_URL + '&t=' + Date.now(),
            headers: { 'Cache-Control': 'no-cache' },
            onload: response => {
                try {
                    if (response.status < 200 || response.status >= 300) {
                        throw new Error('version check failed');
                    }

                    const apiData = JSON.parse(response.responseText || '{}');
                    const encoded = Array.from(String(apiData.content || ''))
                        .filter(ch => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.includes(ch))
                        .join('');

                    if (!encoded) {
                        throw new Error('version metadata missing');
                    }

                    const binary = atob(encoded);
                    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
                    const info = JSON.parse(new TextDecoder('utf-8').decode(bytes));

                    const latest = String(info.version || '').trim();

                    status.title = latest
                        ? `更新確認：成功\n現在：Ver.${SCRIPT_VERSION}\n最新版：Ver.${latest}`
                        : '更新確認：解析失敗';

                    if (!latest || compareVersions(latest, SCRIPT_VERSION) <= 0) {
                        return;
                    }

                    const notes = String(info.notes || '').trim();
                    const installUrl = String(info.install_url || SCRIPT_URL).trim();

                    alertMark.style.display = 'inline-flex';
                    alertMark.title =
                        `現在：Ver.${SCRIPT_VERSION}\n最新版：Ver.${latest}` +
                        (notes ? '\n\n' + notes : '');

                    button.style.display = 'inline-block';
                    button.disabled = false;
                    button.title = `Ver.${latest} にアップデート`;
                    button.dataset.latestVersion = latest;
                    button.dataset.installUrl = installUrl;

                } catch (error) {
                    status.title =
                        '更新確認：解析失敗\n' +
                        String(error?.message || error);

                    console.warn(
                        '[いえらぶ スポット] version check skipped:',
                        error
                    );
                }
            },
            onerror: error => {
                status.title = '更新確認：通信失敗';

                console.warn(
                    '[いえらぶ スポット] version check failed:',
                    error
                );
            }
        });
    }

    // =========================================================
    // 状態管理
    // =========================================================

    function getState() {
        try {
            return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
        } catch (_) {
            return null;
        }
    }

    function setState(state) {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    }

    function clearState() {
        sessionStorage.removeItem(STATE_KEY);
    }

    class ManualStopError extends Error {
        constructor() {
            super('手動停止');
            this.name = 'ManualStopError';
        }
    }

    function requestManualStop() {
        sessionStorage.setItem(STOP_KEY, '1');

        const state = getState();
        if (state) {
            state.active = false;
            state.stage = 'stopped';
            setState(state);
        }
    }

    function clearManualStop() {
        sessionStorage.removeItem(STOP_KEY);
    }

    function setPanelOpen(value) {
        sessionStorage.setItem(PANEL_OPEN_KEY, value ? '1' : '0');
    }

    function isPanelOpen() {
        return sessionStorage.getItem(PANEL_OPEN_KEY) === '1';
    }

    function isManualStopRequested() {
        return sessionStorage.getItem(STOP_KEY) === '1';
    }

    function ensureRunning() {
        const state = getState();

        if (isManualStopRequested() || !state || !state.active) {
            throw new ManualStopError();
        }

        return state;
    }

    function setActiveStage(stage) {
        const state = ensureRunning();
        state.stage = stage;
        setState(state);
        return state;
    }

    function getLogs() {
        try {
            return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
        } catch (_) {
            return [];
        }
    }

    function pushLog(message) {
        const logs = getLogs();
        const time = new Date().toLocaleTimeString();

        logs.push(`${time}　${message}`);

        while (logs.length > 200) logs.shift();

        sessionStorage.setItem(LOG_KEY, JSON.stringify(logs));
        console.log('[いえらぶ自動化]', message);

        renderLogs();
    }

    function clearLogs() {
        sessionStorage.removeItem(LOG_KEY);
        renderLogs();
    }

    // =========================================================
    // 共通
    // =========================================================

    async function waitFor(selector, timeout = 15000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            ensureRunning();
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(300);
        }

        throw new Error(`見つかりません: ${selector}`);
    }

    async function waitUntil(fn, timeout = 20000, interval = 500) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            ensureRunning();
            try {
                if (fn()) return true;
            } catch (_) {}

            await sleep(interval);
        }

        return false;
    }

    function stopWithError(message) {
        pushLog(`⛔ ${message}`);

        const state = getState();

        if (state) {
            state.active = false;
            state.stage = 'error';
            state.error = message;
            setState(state);
        }

        updateStatus();

        alert(
            'いえらぶ自動化を停止しました。\n\n' +
            message +
            '\n\n安全のため、以降の自動処理は実行していません。'
        );
    }

    function isEditPage() {
        return /\/rent\/manager\/edit\/id\/\d+/i.test(location.pathname);
    }

    function extractPropertyId(url) {
        const m = String(url).match(/\/rent\/manager\/edit\/id\/(\d+)/i);
        return m ? m[1] : '';
    }

    // =========================================================
    // 一覧から編集URL取得
    // =========================================================

    function collectEditUrls() {
        const links = [
            ...document.querySelectorAll('a[href*="/rent/manager/edit/id/"]')
        ];

        const urls = [];
        const seen = new Set();

        for (const a of links) {
            const href = a.href || a.getAttribute('href') || '';

            if (!/\/rent\/manager\/edit\/id\/\d+/i.test(href)) {
                continue;
            }

            const id = extractPropertyId(href);

            if (!id || seen.has(id)) continue;

            seen.add(id);
            urls.push(href);
        }

        return urls;
    }

    // =========================================================
    // 右下ボタン配置
    // 「入力用文言」を基準に
    // 指摘設定 → スポット → 入力用文言
    // の順で縦に並べる
    // =========================================================

    function findInputWordingButton() {
        const candidates = [
            ...document.querySelectorAll(
                'button, a, input[type="button"], input[type="submit"], [role="button"]'
            )
        ];

        return candidates.find(el => {
            const label = String(
                el.innerText ||
                el.textContent ||
                el.value ||
                ''
            ).replace(/\s+/g, '').trim();

            if (label !== '入力用文言') return false;

            const rect = el.getBoundingClientRect();

            return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom >= 0 &&
                rect.top <= window.innerHeight
            );
        }) || null;
    }

    function applyLauncherLayout() {
        const inputButton = findInputWordingButton();
        const spotButton = document.getElementById('ierabu-spot-toggle');
        const settingsButton = document.getElementById('tm-ielove-settings');

        if (!inputButton || !spotButton) return;

        // 入力用文言：白系
        Object.assign(inputButton.style, {
            minWidth: '118px',
            height: '36px',
            padding: '0 14px',
            border: '1px solid #9aa6b2',
            borderRadius: '9px',
            background: '#ffffff',
            color: '#334155',
            fontWeight: '700',
            boxShadow: '0 2px 8px rgba(0,0,0,.14)'
        });

        const inputRect = inputButton.getBoundingClientRect();
        const stackLeft = Math.max(8, Math.round(inputRect.left));
        const stackWidth = Math.max(118, Math.round(inputRect.width));
        const gap = 6;
        const buttonHeight = 36;

        // 入力用文言の真上
        const spotBottom =
            Math.max(
                8,
                Math.round(window.innerHeight - inputRect.top + gap)
            );

        Object.assign(spotButton.style, {
            left: stackLeft + 'px',
            right: 'auto',
            bottom: spotBottom + 'px',
            width: stackWidth + 'px',
            height: buttonHeight + 'px',
            padding: '0 14px',
            border: 'none',
            borderRadius: '9px',
            background: '#205375',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: '700',
            boxShadow: '0 2px 8px rgba(32,83,117,.28)'
        });

        // スポットの真上
        if (settingsButton) {
            Object.assign(settingsButton.style, {
                left: stackLeft + 'px',
                right: 'auto',
                bottom:
                    (spotBottom + buttonHeight + gap) +
                    'px',
                width: stackWidth + 'px',
                height: buttonHeight + 'px',
                padding: '0 14px',
                border: 'none',
                borderRadius: '9px',
                background: '#112B3C',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '700',
                boxShadow: '0 2px 8px rgba(17,43,60,.28)'
            });
        }
    }

    let launcherLayoutScheduled = false;

    function scheduleLauncherLayout() {
        if (launcherLayoutScheduled) return;

        launcherLayoutScheduled = true;

        requestAnimationFrame(() => {
            launcherLayoutScheduled = false;
            applyLauncherLayout();
        });
    }

    function watchLauncherLayout() {
        scheduleLauncherLayout();

        const observer = new MutationObserver(() => {
            scheduleLauncherLayout();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', scheduleLauncherLayout);
    }

    // =========================================================
    // パネル
    // =========================================================

    function createPanel() {
        if (document.querySelector('#ierabu-spot-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'ierabu-spot-toggle';
        toggle.textContent = 'スポット';

        Object.assign(toggle.style, {
            position: 'fixed',
            left: '14px',
            right: 'auto',
            bottom: '58px',
            width: '120px',
            height: '36px',
            zIndex: '2147483646',
            padding: '0 14px',
            border: 'none',
            borderRadius: '10px',
            background: '#205375',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(0,0,0,.22)'
        });

        toggle.addEventListener('click', () => {
            const existing = document.querySelector('#ierabu-auto-panel');

            if (existing) {
                setPanelOpen(false);
                existing.remove();
                return;
            }

            setPanelOpen(true);
            openSpotPanel();
        });

        document.body.appendChild(toggle);
    }

    function openSpotPanel() {
        if (document.querySelector('#ierabu-auto-panel')) return;

        setPanelOpen(true);

        const panel = document.createElement('div');
        panel.id = 'ierabu-auto-panel';

        Object.assign(panel.style, {
            position: 'fixed',
            left: '418px',
            right: 'auto',
            bottom: '144px',
            width: '370px',
            maxWidth: 'calc(100vw - 32px)',
            background: '#fff',
            border: '2px solid #205375',
            borderRadius: '10px',
            padding: '12px',
            zIndex: '2147483646',
            boxShadow: '0 7px 22px rgba(32,83,117,.24)',
            fontSize: '13px'
        });

        panel.innerHTML = `
            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                margin:-12px -12px 10px;
                padding:11px 12px;
                background:#205375;
                color:#fff;
                border-radius:8px 8px 0 0;
            ">
                <div style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    min-width:0;
                ">
                    <div style="
                        font-weight:bold;
                        font-size:15px;
                        white-space:nowrap;
                    ">スポット 周辺環境</div>

                    <span id="ierabu-spot-version" style="
                        font-size:11px;
                        color:#DDEAF0;
                        white-space:nowrap;
                    ">Ver.${SCRIPT_VERSION}</span>
                </div>

                <div style="
                    display:flex;
                    align-items:center;
                    gap:6px;
                    flex-shrink:0;
                ">
                    <span id="ierabu-spot-update-alert" style="
                        display:none;
                        align-items:center;
                        justify-content:center;
                        width:18px;
                        height:18px;
                        border-radius:50%;
                        background:#f0a000;
                        color:#fff;
                        font-weight:bold;
                        font-size:12px;
                        cursor:help;
                    ">!</span>

                    <button id="ierabu-spot-update" type="button" disabled style="
                        display:none;
                        padding:5px 9px;
                        border:0;
                        border-radius:6px;
                        background:#F4F8FA;
                        color:#205375;
                        font-size:11px;
                        font-weight:bold;
                        cursor:pointer;
                    ">アップデート</button>

                    <button id="ierabu-spot-close" type="button" style="
                        border:none;
                        background:transparent;
                        color:#fff;
                        font-size:18px;
                        cursor:pointer;
                        padding:0 2px;
                    ">×</button>
                </div>
            </div>

            <div id="ierabu-status" style="
                margin-bottom:8px;
                padding:7px;
                background:#EEF5F8;
                border:1px solid #D6E5EC;
                color:#1F425A;
                border-radius:6px;
                line-height:1.5;
            ">待機中</div>

            <button id="ierabu-start-all" style="
                width:100%;
                padding:10px 14px;
                cursor:pointer;
                margin-bottom:7px;
                border:none;
                border-radius:10px;
                background:#e66b00;
                color:#fff;
                font-weight:bold;
            ">
                絞り込み済み一覧を全件開始
            </button>

            <button id="ierabu-stop" style="
                width:100%;
                padding:8px;
                cursor:pointer;
                margin-bottom:7px;
                border:1px solid #8AA9BC;
                border-radius:8px;
                background:#F3F8FA;
                color:#205375;
                font-weight:bold;
            ">
                自動処理を停止
            </button>

            <button id="ierabu-reset" style="
                width:100%;
                padding:8px;
                cursor:pointer;
                margin-bottom:8px;
                border:1px solid #B7CBD6;
                border-radius:8px;
                background:#FAFCFD;
                color:#4C6675;
            ">
                状態をリセット
            </button>

            <div id="ierabu-auto-log" style="
                height:200px;
                overflow:auto;
                border:1px solid #D6E5EC;
                padding:6px;
                background:#F8FBFC;
                font-size:11px;
            "></div>
        `;

        document.body.appendChild(panel);

        document
            .querySelector('#ierabu-start-all')
            .addEventListener('click', startAll);

        document
            .querySelector('#ierabu-stop')
            .addEventListener('click', () => {
                requestManualStop();

                pushLog('■ 手動停止しました');
                updateStatus();

                alert('自動処理を停止しました。');
            });

        document
            .querySelector('#ierabu-reset')
            .addEventListener('click', () => {
                clearManualStop();
                clearState();
                clearLogs();
                updateStatus();

                alert('自動化の状態をリセットしました。');
            });

        document
            .querySelector('#ierabu-spot-close')
            .addEventListener('click', () => {
                setPanelOpen(false);
                panel.remove();
            });

        document.getElementById('ierabu-spot-update').onclick = event => {
            const latest =
                event.currentTarget.dataset.latestVersion ||
                String(Date.now());

            const installUrl =
                event.currentTarget.dataset.installUrl ||
                SCRIPT_URL;

            const separator =
                installUrl.includes('?') ? '&' : '?';

            const updateWindow = window.open(
                installUrl +
                separator +
                'install=' + encodeURIComponent(latest) +
                '&t=' + Date.now(),
                '_blank'
            );

            // SUUMO側と同じ：
            // 更新用タブが閉じられたら元ページを1回だけ再読み込みする
            if (updateWindow) {
                const watchUpdateWindow = setInterval(() => {
                    if (!updateWindow.closed) return;

                    clearInterval(watchUpdateWindow);
                    location.reload();
                }, 500);
            }
        };

        renderLogs();
        updateStatus();
        checkScriptUpdate();
    }

    function renderLogs() {
        const box = document.querySelector('#ierabu-auto-log');
        if (!box) return;

        const logs = getLogs();

        box.innerHTML = logs.length
            ? logs.map(x => `<div>${escapeHtml(x)}</div>`).join('')
            : '<div>待機中</div>';

        box.scrollTop = box.scrollHeight;
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function updateStatus() {
        const el = document.querySelector('#ierabu-status');
        if (!el) return;

        const state = getState();

        if (!state) {
            el.innerHTML = '待機中';
            return;
        }

        const total = state.queue?.length || 0;
        const completed = Math.min(state.index || 0, total);
        const current = Math.min((state.index || 0) + 1, total || 1);

        if (state.stage === 'completed') {
            el.innerHTML =
                `完了 ✅<br>` +
                `進捗：${total} / ${total}`;
            return;
        }

        if (!state.active) {
            el.innerHTML =
                `停止中<br>` +
                `進捗：${completed} / ${total}<br>` +
                `状態：${state.stage || '-'}`;
            return;
        }

        el.innerHTML =
            `処理中：${current} / ${total}<br>` +
            `完了：${completed}件<br>` +
            `段階：${state.stage || '-'}`;
    }

    // =========================================================
    // 全件開始
    // =========================================================

    function startAll() {
        if (isEditPage()) {
            alert(
                '全件処理は、絞り込み済みの物件一覧画面から開始してください。'
            );
            return;
        }

        const urls = collectEditUrls();

        if (urls.length === 0) {
            alert(
                'この画面から通常の「編集」リンクを取得できませんでした。\n\n' +
                '絞り込み済み物件一覧を開いてから開始してください。'
            );
            return;
        }

        const ok = confirm(
            `絞り込み済み一覧から ${urls.length}件 を検出しました。\n\n` +
            `この ${urls.length}件 を上から順番に自動処理します。\n\n` +
            `開始しますか？`
        );

        if (!ok) return;

        clearManualStop();
        setPanelOpen(true);
        sessionStorage.setItem(LOG_KEY, JSON.stringify([]));

        const state = {
            active: true,
            stage: 'goEdit',
            queue: urls,
            index: 0,
            startedAt: Date.now()
        };

        setState(state);

        pushLog(`開始：一覧から ${urls.length}件 を検出`);
        pushLog('全件処理を開始します');

        updateStatus();
        goCurrentEdit();
    }

    function goCurrentEdit() {
        const state = getState();

        if (!state || !state.active) return;

        if (state.index >= state.queue.length) {
            finishAll();
            return;
        }

        const url = state.queue[state.index];
        const id = extractPropertyId(url);

        state.stage = 'goEdit';
        setState(state);

        pushLog(`▶ ${state.index + 1}/${state.queue.length} 物件ID ${id} を開きます`);
        updateStatus();

        try {
            ensureRunning();
        } catch (_) {
            return;
        }

        location.href = url;
    }

    // =========================================================
    // 編集画面
    // =========================================================

    async function processCurrentEdit() {
        const state = getState();

        if (!state || !state.active) return;
        if (!isEditPage()) return;
        if (!['goEdit', 'editing'].includes(state.stage)) return;

        const expectedUrl = state.queue[state.index];
        const expectedId = extractPropertyId(expectedUrl);
        const currentId = extractPropertyId(location.href);

        if (expectedId && currentId && expectedId !== currentId) {
            stopWithError(
                `処理対象IDが一致しません。予定:${expectedId} / 現在:${currentId}`
            );
            return;
        }

        try {
            setActiveStage('editing');
            updateStatus();

            pushLog('① 周辺環境を開きます');

            const environmentTab =
                await waitFor('#qtipEnvironment');

            ensureRunning();
            environmentTab.click();
            await sleep(700);
            ensureRunning();

            pushLog('② 10km以内を開きます');

            const tenKm =
                await waitFor('#spotBatchNavitimeSetup100');

            ensureRunning();
            tenKm.click();

            const allCheck =
                await waitFor('#js-checkAllEnvironment', 15000);

            await waitFor('#addSpot', 15000);

            pushLog('③ 候補一覧を確認しました');

            if (!allCheck.checked) {
                ensureRunning();
                allCheck.click();
                await sleep(500);
                ensureRunning();
            }

            if (!allCheck.checked) {
                throw new Error(
                    '候補物件を全選択できませんでした'
                );
            }

            pushLog('④ 候補物件を全選択しました');

            const addSpot =
                document.querySelector('#addSpot');

            if (!addSpot) {
                throw new Error(
                    '「反映」ボタンが見つかりません'
                );
            }

            ensureRunning();
            addSpot.click();
            pushLog('⑤ 周辺環境を反映しました');

            await sleep(1000);
            ensureRunning();

            pushLog('⑥ 徒歩距離の反映を待っています…');

            const distanceSuccess =
                await waitUntil(() => {

                    const allDistances = [
                        ...document.querySelectorAll('.spotDistance')
                    ].filter(el => el.offsetParent !== null);

                    const configuredDistances =
                        allDistances.filter(el => {

                            let parent = el.parentElement;

                            for (let i = 0; i < 8 && parent; i++) {

                                const distanceCount =
                                    parent.querySelectorAll('.spotDistance').length;

                                const text =
                                    (parent.innerText || '')
                                        .replace(/\s+/g, '');

                                if (
                                    distanceCount === 1 &&
                                    text.includes('周辺環境が設定されていません')
                                ) {
                                    return false;
                                }

                                parent = parent.parentElement;
                            }

                            return true;
                        });

                    if (configuredDistances.length === 0) {
                        return false;
                    }

                    const empty =
                        configuredDistances.filter(el =>
                            !String(el.value).trim()
                        );

                    pushLog(
                        `設定済み ${configuredDistances.length}件 / 徒歩距離未反映 ${empty.length}件`
                    );

                    return empty.length === 0;

                }, 30000, 1000);

            if (!distanceSuccess) {
                throw new Error(
                    '設定済み周辺環境の徒歩距離がすべて反映されませんでした'
                );
            }

            pushLog('✅ 徒歩距離がすべて反映されました');

            const saveButton =
                document.querySelector('#submitButton');

            if (!saveButton) {
                throw new Error(
                    '1回目の保存ボタンが見つかりません'
                );
            }

            setActiveStage('afterFirstSave');
            updateStatus();

            pushLog('⑦ 1回目の保存を実行します');

            ensureRunning();
            saveButton.click();

        } catch (e) {
            if (e instanceof ManualStopError) return;
            stopWithError(e.message);
        }
    }

    // =========================================================
    // 1回目保存後
    // =========================================================

    async function handleAfterFirstSave() {
        const state = getState();

        if (!state || !state.active) return;
        if (state.stage !== 'afterFirstSave') return;

        await sleep(1200);

        try {
            ensureRunning();
        } catch (_) {
            return;
        }

        const duplicateChecks =
            document.querySelectorAll('.unifyIds');

        const finalSave =
            document.querySelector('#unifySubmit');

        // =====================================================
        // 重複あり
        // =====================================================

        if (duplicateChecks.length > 0 || finalSave) {

            pushLog('⚠ 重複物件を検出しました');

            const clearButton =
                document.querySelector('a.all_check_false');

            if (!clearButton) {
                stopWithError(
                    '重複物件がありますが、「選択を解除」が見つかりません'
                );
                return;
            }

            // ★ 必須工程 ★
            pushLog('⑧ 重複物件の「選択を解除」を実行します');

            try {
                ensureRunning();
            } catch (_) {
                return;
            }

            clearButton.click();
            await sleep(500);

            try {
                ensureRunning();
            } catch (_) {
                return;
            }

            const cleared =
                await waitUntil(() => {

                    const checked =
                        document.querySelectorAll('.unifyIds:checked');

                    pushLog(`重複物件 選択中 ${checked.length}件`);

                    return checked.length === 0;

                }, 5000, 300);

            if (!cleared) {
                stopWithError(
                    '重複物件のチェックが残っています。最終保存は実行しません。'
                );
                return;
            }

            const remaining =
                document.querySelectorAll('.unifyIds:checked');

            if (remaining.length !== 0) {
                stopWithError(
                    `重複物件が ${remaining.length}件 選択されたままです`
                );
                return;
            }

            pushLog('✅ 重複物件の選択が0件になりました');

            const save =
                document.querySelector('#unifySubmit');

            if (!save) {
                stopWithError(
                    '最終保存ボタンが見つかりません'
                );
                return;
            }

            try {
                setActiveStage('finalSaving');
            } catch (_) {
                return;
            }
            updateStatus();

            pushLog('⑨ 最終保存を実行します');

            try {
                ensureRunning();
            } catch (_) {
                return;
            }

            save.click();
            return;
        }

        // =====================================================
        // 重複なし
        // =====================================================

        try {
            ensureRunning();
        } catch (_) {
            return;
        }

        pushLog('✅ 重複物件なし');
        completeCurrentAndNext();
    }

    // =========================================================
    // 最終保存後
    // =========================================================

    function handleAfterFinalSave() {
        const state = getState();

        if (!state || !state.active) return;
        if (state.stage !== 'finalSaving') return;

        pushLog('✅ 最終保存後の画面へ移動しました');
        completeCurrentAndNext();
    }

    // =========================================================
    // 1件完了 → 次へ
    // =========================================================

    function completeCurrentAndNext() {
        let state;

        try {
            state = ensureRunning();
        } catch (_) {
            return;
        }

        const doneNumber = state.index + 1;

        pushLog(`✅ ${doneNumber}/${state.queue.length} 件目 完了`);

        state.index += 1;

        if (state.index >= state.queue.length) {
            setState(state);
            finishAll();
            return;
        }

        try {
            state = setActiveStage('goEdit');
        } catch (_) {
            return;
        }
        updateStatus();

        const nextUrl = state.queue[state.index];
        const nextId = extractPropertyId(nextUrl);

        pushLog(`次の物件ID ${nextId} へ進みます`);

        setTimeout(() => {
            try {
                ensureRunning();
            } catch (_) {
                return;
            }

            location.href = nextUrl;
        }, 800);
    }

    function finishAll() {
        const state = getState();
        const total = state?.queue?.length || 0;

        if (state) {
            state.active = false;
            state.stage = 'completed';
            setState(state);
        }

        clearManualStop();
        pushLog(`🎉 全件完了：${total}件すべて処理しました`);
        updateStatus();

        alert(
            `スポットの全件処理が完了しました。\n\n` +
            `${total}件すべて処理済みです。`
        );
    }

    // =========================================================
    // 再開処理
    // =========================================================

    async function resumeAutomation() {
        const state = getState();

        updateStatus();

        if (!state || !state.active) return;

        if (state.stage === 'goEdit') {
            if (isEditPage()) {
                await processCurrentEdit();
            } else {
                setTimeout(goCurrentEdit, 500);
            }
            return;
        }

        if (state.stage === 'editing') {
            if (isEditPage()) {
                await processCurrentEdit();
            }
            return;
        }

        if (state.stage === 'afterFirstSave') {
            await handleAfterFirstSave();
            return;
        }

        if (state.stage === 'finalSaving') {
            handleAfterFinalSave();
            return;
        }
    }

    // =========================================================
    // 起動
    // =========================================================

    window.addEventListener('load', () => {
        createPanel();

        // 開いた状態で処理を開始した場合は、画面遷移後も自動で再表示する
        if (isPanelOpen()) {
            openSpotPanel();
        }

        resumeAutomation();
    });

})();