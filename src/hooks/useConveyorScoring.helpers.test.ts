import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/modbus-websocket', () => ({
  modbusService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    writeCoil: vi.fn(),
    readCoils: vi.fn(),
    getStatus: vi.fn(),
  },
  MODBUS_ADDRESSES: {
    START: 0,
    RESET: 1,
    FEED_CYLINDER_VALVE: 100,
    SORTING1_CYLINDER_VALVE: 101,
    SORTING2_CYLINDER_VALVE: 102,
    CONVEYOR: 103,
    SENSOR_FEED: 8,
    SENSOR_COLOR: 9,
    SENSOR_MATERIAL: 10,
    MAGNETIC_FEED_RETRACT: 2,
    MAGNETIC_FEED_EXTEND: 3,
    MAGNETIC_SORTING1_RETRACT: 4,
    MAGNETIC_SORTING1_EXTEND: 5,
    MAGNETIC_SORTING2_RETRACT: 6,
    MAGNETIC_SORTING2_EXTEND: 7,
  },
}));

import { isSingleCoilRetractCommandSatisfied } from './useConveyorScoring';

describe('isSingleCoilRetractCommandSatisfied', () => {
  it('returns true on a falling edge', () => {
    const prev = Array(104).fill(false);
    const cur = Array(104).fill(false);

    prev[100] = true;
    cur[100] = false;

    expect(isSingleCoilRetractCommandSatisfied(cur, prev, 100)).toBe(true);
  });

  it('returns true when polling misses the edge but the coil is already off', () => {
    const prev = Array(104).fill(false);
    const cur = Array(104).fill(false);

    prev[100] = false;
    cur[100] = false;

    expect(isSingleCoilRetractCommandSatisfied(cur, prev, 100)).toBe(true);
  });

  it('returns false while the coil is still energized', () => {
    const prev = Array(104).fill(false);
    const cur = Array(104).fill(false);

    prev[100] = true;
    cur[100] = true;

    expect(isSingleCoilRetractCommandSatisfied(cur, prev, 100)).toBe(false);
  });
});
