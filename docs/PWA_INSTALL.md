# PWA 安装指南 / PWA Install Guide

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

Qreminder 是渐进式 Web 应用（PWA），可以"安装"到手机/平板/电脑主屏幕，启动后体验与原生 App 接近：独立窗口、无浏览器地址栏、支持离线访问基础页面。

### Android（Chrome / Edge / Samsung Internet）

1. 用 Chrome（或 Edge / Samsung Internet）打开你的 Qreminder 部署地址
2. 等几秒，页面右下角会自动弹出"把 Qreminder 添加到桌面"对话框 → 点「立即安装」
3. 如果对话框被关掉了，也可以从浏览器菜单（右上角三个点）→「添加到主屏幕」/「安装应用」手动触发
4. 安装成功后，主屏幕会出现 Qreminder 图标，点击即可独立窗口启动

### iOS / iPadOS（必须用 Safari）

> 重要：iOS 上**只有 Safari 支持** PWA 安装。用微信浏览器、Chrome、Edge 都不行。如果你常用其他浏览器，需要先复制链接到 Safari 里打开。

1. 用 **Safari** 打开 Qreminder 部署地址
2. 点底部工具栏中间的「分享」按钮（方框 + 上箭头）
3. 在弹出菜单里向下滑动，找到「**添加到主屏幕**」
4. 编辑显示名称（默认 "Qreminder"），点右上角「添加」
5. 退出 Safari，主屏幕就有图标了；点击后会以独立窗口运行，没有 Safari 地址栏

### Windows / macOS（Chrome / Edge）

1. 用 Chrome 或 Edge 打开 Qreminder 部署地址
2. 地址栏右侧会出现「安装」图标（一个带向下箭头的方框），点击 → 「安装」
3. 或者从浏览器菜单选择「**安装 Qreminder...**」
4. 安装后，应用会出现在开始菜单/启动台/Dock，可固定到任务栏

### 验证安装成功

打开应用后，如果**没有浏览器地址栏**、看到的是独立窗口 → 已经是 PWA 模式。
如果只是网页快捷方式（带地址栏）→ 说明没装好，按上面步骤重试。

### 已知限制

- iOS Safari 必须，其他浏览器（包括 iOS Chrome）会被 Apple 限制不允许 PWA 安装
- iOS 的 PWA 离线访问能力比 Android 弱，仅缓存了静态资源；订阅数据始终需要联网
- 部分企业 MDM 策略可能会禁用 PWA 安装

### 离线时可用

Service Worker 默认会缓存：
- 应用骨架（首屏壳）
- 静态资源（JS、CSS、图标）
- 上次访问过的页面（stale-while-revalidate 策略）

离线时打开应用：能看到缓存好的 UI，订阅数据会显示加载状态；恢复联网后自动同步。

---

## English

Qreminder is a Progressive Web App (PWA). It can be "installed" to your mobile/tablet/desktop home screen for a near-native experience: standalone window, no browser address bar, basic offline support.

### Android (Chrome / Edge / Samsung Internet)

1. Open your Qreminder deployment URL in Chrome (or Edge / Samsung Internet)
2. After a few seconds, an "Add Qreminder to home screen" prompt appears → tap **Install now**
3. If you dismissed the prompt, you can trigger it from the browser menu (three dots) → **Add to home screen** / **Install app**
4. After installation, the Qreminder icon appears on your home screen — tap it to launch in standalone mode

### iOS / iPadOS (Safari only)

> Important: On iOS, **only Safari supports** PWA installation. WeChat browser, Chrome on iOS, Edge on iOS — none of them work. Copy the link to Safari if you're using a different browser.

1. Open the Qreminder deployment URL in **Safari**
2. Tap the **Share** button in the bottom toolbar (square with up arrow)
3. Scroll down in the share sheet and find **Add to Home Screen**
4. Optionally edit the display name (defaults to "Qreminder"), then tap **Add** in the top right
5. Close Safari — Qreminder is now on your home screen. Tapping it launches a standalone window without the Safari address bar

### Windows / macOS (Chrome / Edge)

1. Open the Qreminder deployment URL in Chrome or Edge
2. An install icon appears at the right side of the address bar (square with a down arrow) — click → **Install**
3. Or use the browser menu → **Install Qreminder...**
4. After installation, the app shows up in your Start Menu / Launchpad / Dock and can be pinned to the taskbar

### Verifying the install

Launch the app — if you see **no browser address bar** and a standalone window, you're in PWA mode.
If it opens with the browser chrome (address bar visible), the install didn't take — retry the steps above.

### Known limitations

- iOS requires Safari; other iOS browsers (including Chrome on iOS) are restricted by Apple from installing PWAs
- iOS PWAs have weaker offline support than Android; only static assets are cached. Subscription data always needs network
- Some enterprise MDM policies may disable PWA installation

### Offline behavior

The Service Worker caches by default:
- The app shell
- Static assets (JS, CSS, icons)
- Previously visited pages (stale-while-revalidate)

When offline: the cached UI loads, but subscription data shows loading states. Once connectivity returns, data auto-syncs.
