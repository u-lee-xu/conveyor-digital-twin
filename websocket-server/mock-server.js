const ModbusRTU = require('modbus-serial');

const vector = {
    getCoil: (addr) => {
        console.log(`[MockServer] 读取线圈 地址: ${addr}, 值: ${coils[addr] || false}`);
        return coils[addr] || false;
    },
    setCoil: (addr, value) => {
        console.log(`[MockServer] 写入线圈 地址: ${addr}, 值: ${value}`);
        coils[addr] = value;
    },
    getDiscreteInput: (addr) => {
        console.log(`[MockServer] 读取离散输入 地址: ${addr}`);
        return false;
    },
    getHoldingRegister: (addr) => {
        console.log(`[MockServer] 读取保持寄存器 地址: ${addr}`);
        return 0;
    },
    setRegister: (addr, value) => {
        console.log(`[MockServer] 写入寄存器 地址: ${addr}, 值: ${value}`);
    }
};

const coils = {};
const serverTCP = new ModbusRTU.ServerTCP(vector, { host: "127.0.0.1", port: 502, debug: true });

serverTCP.on("initialized", () => {
    console.log("Mock ModbusTCP Server listening on 127.0.0.1:502");
});

serverTCP.on("socketError", (err) => {
    console.error(err);
});
