import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

/**
 * Node 侧角色判定从 websocket-server/runtime-role.js 单一来源加载。
 * 浏览器 bundle 里的 canOpenPlcChannel() 只是 UI 约定，不能当安全边界。
 */
const nodeRequire = createRequire(import.meta.url)
const runtimeRole = nodeRequire('../../websocket-server/runtime-role.js') as {
  applyProxyHeaders: (req: IncomingMessage) => 'teacher' | 'viewer'
  originMatches: (req: IncomingMessage) => boolean
}

/** 浏览器只碰一个端口：WebSocket 同源代理到本机内部服务，CSP 'self' 直接放行 */
type WsProxyServer = {
  ws: (req: IncomingMessage, socket: Socket, head: Buffer) => void
}

function denyUpgrade(socket: Socket, reason: string): void {
  try {
    socket.write(
      `HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\nX-DT-Deny: ${reason}\r\n\r\n`,
    )
  } catch { /* socket 已关闭 */ }
  socket.destroy()
}

/**
 * 包住 http-proxy 的 ws()，在建立上游连接之前判定角色并覆写信任头。
 * 判据是 TCP 实际落在哪个本机地址 + Host（见 runtime-role.js），伪造 Host 无效；
 * 同名请求头一律被覆写，LAN 客户端无法自封 teacher 或伪造 token。
 * /ws/plc 只允许 teacher；/ws/relay 允许 viewer 订阅，但其上行由 broadcast.js 丢弃。
 */
function guardUpgrade(allowViewer: boolean) {
  return (proxy: WsProxyServer): void => {
    const forward = proxy.ws.bind(proxy)
    proxy.ws = (req, socket, head) => {
      if (!runtimeRole.originMatches(req)) {
        denyUpgrade(socket, 'origin')
        return
      }
      const role = runtimeRole.applyProxyHeaders(req)
      if (!allowViewer && role !== 'teacher') {
        denyUpgrade(socket, 'viewer')
        return
      }
      forward(req, socket, head)
    }
  }
}

const WS_PROXY: Record<string, ProxyOptions> = {
  '/ws/plc': {
    target: 'ws://127.0.0.1:8081',
    ws: true,
    rewrite: (p: string) => p.replace(/^\/ws\/plc/, '') || '/',
    configure: guardUpgrade(false) as ProxyOptions['configure'],
  },
  '/ws/relay': {
    target: 'ws://127.0.0.1:8082',
    ws: true,
    rewrite: (p: string) => p.replace(/^\/ws\/relay/, '') || '/',
    configure: guardUpgrade(true) as ProxyOptions['configure'],
  },
};

/** 场景包 alias 自动派生：只认带 device.json 的目录，导入新场景无需改构建配置 */
const PACKAGES_DIR = path.resolve(__dirname, '..')
const sceneAliases: Record<string, string> = {}
for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = path.join(PACKAGES_DIR, entry.name)
  if (fs.existsSync(path.join(dir, 'device.json'))) {
    sceneAliases[`@digital-twin/${entry.name}`] = path.join(dir, 'src')
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
    {
      name: 'electron-csp-html',
      apply: 'build',
      closeBundle() {
        // Web 版 index.html 只放行 'self'；Electron file:// 需要直连内部 WS，
        // 因此构建期额外生成一份仅 Electron 加载、放宽 connect-src 的 HTML
        const dist = path.resolve(__dirname, 'dist')
        const src = path.join(dist, 'index.html')
        if (!fs.existsSync(src)) return
        const html = fs.readFileSync(src, 'utf8').replace(
          "connect-src 'self';",
          "connect-src 'self' ws://127.0.0.1:8081 ws://127.0.0.1:8082;",
        )
        fs.writeFileSync(path.join(dist, 'index-electron.html'), html)
      },
    },
  ],
  resolve: {
    alias: {
      '@digital-twin/shared': path.resolve(__dirname, '../shared/src'),
      ...sceneAliases,
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    // 现场网络不固定：教师机 IP、教室 WiFi、内网穿透域名都会变，
    // 不写死任何 hostname 白名单；dev server 只在内网使用，允许任意 Host 访问。
    // 但 WS 升级仍由 guardUpgrade 按 localAddress 判角色，LAN 只能订阅 relay。
    allowedHosts: true,
    proxy: WS_PROXY,
  },
  preview: { host: '0.0.0.0', proxy: WS_PROXY },
  build: {
    rollupOptions: {
      output: {
        /**
         * 函数式分组：把 React 单独拆出来，启动器首屏才不会为了 react-dom 而
         * 连带预加载 three / r3f（数组式会递归分配依赖，做不到这点）。
         * 3D / 物理库只在按需加载的工作区 chunk 里引用，不进首屏 preload。
         */
        manualChunks(id) {
          const p = id.replace(/\\/g, '/');
          // Vite 的 dynamic-import preload helper 必须跟 React 同组：否则主 chunk
          // 会为了它静态依赖 r3f chunk，进而把 three / r3f 重新拉回首屏 preload
          if (p.includes('vite/preload-helper')) return 'vendor-react';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(p)) return 'vendor-react';
          if (p.includes('/node_modules/three/')) return 'vendor-three';
          // Rapier 与 wasm 不手动分组：交给 Rollup 从「真正引用它的设备 chunk」里
          // 抽成共享 chunk，否则共享工具会把 vendor-r3f 拉上 2.26MB 的 wasm 依赖
          if (p.includes('/node_modules/@react-three/rapier/') || p.includes('/node_modules/@dimforge/')) return undefined;
          if (p.includes('/node_modules/@react-three/')) return 'vendor-r3f';
          return undefined;
        },
      },
    },
  },
})
