/**
 * 最小 S7 ISO-on-TCP 软件 PLC 服务端（替代 PLCSIM/实体 S7 CPU）。
 * 支持 nodes7 客户端的 COTP 握手、PDU 协商、Read Var / Write Var，
 * 变量值存在内存 Map 里；不依赖博途、PLCSIM 或任何真实硬件。
 * 端口 1102（避开本机 s7oiehsx64 占用的 :102）。
 */
const net = require('net');

const PORT = Number(process.env.DT_S7_MOCK_PORT || 1102);
/**
 * 按**字节地址**存原始内存（不是按变量名存数值）。
 * nodes7 会把地址相邻的变量合并成一个连续字节块读写（例如 M130.0/M131.0
 * 合成 2 字节块、MW1000/MW1002 合成 4 字节块），所以软件 PLC 必须保持真实的
 * 字节布局，客户端才能按 bit/word 偏移正确取值。
 */
const mem = new Map();          // key: "area:byteAddr" -> byte(0..255)
const readBytes = (area, base, len) => {
  const b = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) b[i] = mem.get(`${area}:${base + i}`) ?? 0;
  return b;
};
const writeBytes = (area, base, bytes) => {
  for (let i = 0; i < bytes.length; i += 1) mem.set(`${area}:${base + i}`, bytes[i]);
};
let frames = 0;

const CC = Buffer.from([
  0x03, 0x00, 0x00, 0x16, 0x11, 0xd0, 0x00, 0x00, 0x00, 0x02, 0x00,
  0xc0, 0x01, 0x0a, 0xc1, 0x02, 0x01, 0x00, 0xc2, 0x02, 0x01, 0x02,
]);
/** 27 字节标准 PDU 协商响应（nodes7 checkRFCData 注释里的原包），paramLen=8、PDU=240 */
const SETUP_ACK = Buffer.from([
  0x03, 0x00, 0x00, 0x1b, 0x02, 0xf0, 0x80, 0x32, 0x03, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0xf0,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0xf0,
]);

/**
 * S7 响应头是 12 字节（比请求的 10 字节多 error class/code 两字节）：
 *   TPKT(4) + COTP(3) + S7(12) + 参数区 + 数据区
 * nodes7 的 dataPointer 恒为 21 = 4+3+12+2，所以参数区固定 2 字节、数据从 21 开始。
 */
function buildPDU(req, params, data) {
  const total = 4 + 3 + 12 + params.length + data.length;
  const b = Buffer.alloc(total);
  b[0] = 0x03; b[1] = 0x00; b.writeUInt16BE(total, 2);
  b[4] = 0x02; b[5] = 0xf0; b[6] = 0x80;
  b[7] = 0x32; b[8] = 0x03; b[9] = 0x00; b[10] = 0x00;
  b.writeUInt16BE(req.readUInt16BE(11), 11);   // PDU reference 回显
  b.writeUInt16BE(params.length, 13);
  b.writeUInt16BE(data.length, 15);
  b[17] = 0x00; b[18] = 0x00;                  // error class / code = 0
  params.copy(b, 19);
  data.copy(b, 19 + params.length);
  return b;
}

/** Read Var 请求：offset 17=0x04, 18=item count, 每个 item 12 字节从 19 开始 */
function parseItems(pkt, count, itemOffset) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const o = itemOffset + i * 12;
    const transport = pkt[o + 3];
    const cnt = pkt.readUInt16BE(o + 4);
    const area = pkt[o + 8];
    const addr = (pkt[o + 9] << 16) | (pkt[o + 10] << 8) | pkt[o + 11];
    const byteAddr = addr >> 3;
    out.push({ transport, cnt, area, byteAddr, key: `${area}:${byteAddr}` });
  }
  return out;
}

function byteLengthOf(it) {
  switch (it.transport) {
    case 0x01: return Math.max(1, Math.ceil(it.cnt / 8));  // BIT
    case 0x02: return it.cnt;                              // BYTE
    case 0x03: return it.cnt;                              // CHAR
    case 0x04: return it.cnt * 2;                          // WORD
    case 0x06: return it.cnt * 4;                          // DWORD/DINT
    default: return Math.max(1, it.cnt * 2);
  }
}

function valueBuffer(len, value) {
  const b = Buffer.alloc(len);
  if (len === 1) b[0] = value & 0xff;
  else if (len === 2) b.writeUInt16BE(value & 0xffff, 0);
  else if (len === 4) b.writeUInt32BE(value >>> 0, 0);
  return b;
}

function handleRead(req) {
  const count = req[18];
  const items = parseItems(req, count, 19);
  const parts = items.map((it) => {
    const len = byteLengthOf(it);
    const head = Buffer.alloc(4);
    head[0] = 0xff;              // return code OK
    head[1] = 0x04;              // nodes7 readTransportCode 默认 0x04
    head.writeUInt16BE(len * 8, 2); // 0x04 时长度字段按 bit 计
    const pad = len % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([head, readBytes(it.area, it.byteAddr, len), pad]);
  });
  console.error(`[S7Mock] READ count=${count} keys=${JSON.stringify(items.map((i) => `${i.key}/t${i.transport}/c${i.cnt}`))} bytes=${JSON.stringify(items.map((i) => [...readBytes(i.area, i.byteAddr, byteLengthOf(i))]))}`);
  return buildPDU(req, Buffer.from([0x04, count]), Buffer.concat(parts));
}

function handleWrite(req) {
  const count = req[18];
  const items = parseItems(req, count, 19);
  // Write Var 参数区后紧跟数据区：每个 item 4 字节头 + 值
  let ptr = 19 + count * 12;
  for (const it of items) {
    const len = byteLengthOf(it);
    const valueBuf = req.slice(ptr + 4, ptr + 4 + len);
    writeBytes(it.area, it.byteAddr, valueBuf);
    ptr += 4 + len + (len % 2 ? 1 : 0);
  }
  console.error(`[S7Mock] WRITE count=${count} keys=${JSON.stringify(items.map((i) => `${i.key}/t${i.transport}/c${i.cnt}`))} mem=${JSON.stringify(Object.fromEntries(mem))}`);
  const ack = Buffer.alloc(count, 0xff);
  return buildPDU(req, Buffer.from([0x05, count]), ack);
}

const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt16BE(2);
      if (len < 4 || buf.length < len) break;
      const pkt = buf.slice(0, len);
      buf = buf.slice(len);
      frames += 1;
      try {
        if (pkt[5] === 0xe0) sock.write(CC);                          // COTP CR → CC
        else if (pkt[7] === 0x32) {
          const fn = pkt[17];
          if (fn === 0xf0) sock.write(SETUP_ACK);                     // PDU 协商
          else if (fn === 0x04) sock.write(handleRead(pkt));
          else if (fn === 0x05) sock.write(handleWrite(pkt));
        }
      } catch (e) {
        console.error('[S7Mock] 帧处理失败:', e.message);
      }
    }
  });
  sock.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[S7Mock] 软件 PLC 监听 127.0.0.1:${PORT}（COTP/S7 变量层）`);
});

// 状态口：供验收脚本直接查看内存变量与帧数
require('http').createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/status') {
    res.end(JSON.stringify({ success: true, role: 's7-mock-plc', port: PORT, frames,
      variables: Object.fromEntries(mem) }));
  } else if (url.pathname === '/reset') {
    mem.clear(); res.end(JSON.stringify({ success: true }));
  } else {
    res.statusCode = 404; res.end('{}');
  }
}).listen(Number(process.env.DT_S7_MOCK_HTTP || 5093), '127.0.0.1', () => {
  console.log(`[S7Mock] 状态口 http://127.0.0.1:${process.env.DT_S7_MOCK_HTTP || 5093}/status`);
});
