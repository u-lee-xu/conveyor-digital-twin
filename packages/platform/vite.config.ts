import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
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
    })
  ],
  resolve: {
    alias: {
      '@digital-twin/shared': path.resolve(__dirname, '../shared/src'),
      '@digital-twin/conveyor-sorting': path.resolve(__dirname, '../conveyor-sorting/src'),
      '@digital-twin/pneumatic-robot': path.resolve(__dirname, '../pneumatic-robot/src'),
      '@digital-twin/traffic-light': path.resolve(__dirname, '../traffic-light/src'),
      '@digital-twin/auto-dispensing': path.resolve(__dirname, '../auto-dispensing/src'),
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
        manualChunks: {
          'vendor-three': ['three'],
          'vendor-rapier': ['@react-three/rapier'],
          'vendor-r3f': ['@react-three/fiber', '@react-three/drei'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
})
