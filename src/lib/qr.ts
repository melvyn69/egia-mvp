const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const SIZE = 21;
const DATA_CODEWORDS = 19;
const ECC_CODEWORDS = 7;

type Matrix = boolean[][];

type BitBuffer = {
  bits: boolean[];
  add: (value: number, length: number) => void;
};

const makeBitBuffer = (): BitBuffer => {
  const bits: boolean[] = [];
  return {
    bits,
    add: (value, length) => {
      for (let i = length - 1; i >= 0; i -= 1) {
        bits.push(((value >>> i) & 1) === 1);
      }
    }
  };
};

const expTable = new Array<number>(512);
const logTable = new Array<number>(256);

let fieldValue = 1;
for (let i = 0; i < 255; i += 1) {
  expTable[i] = fieldValue;
  logTable[fieldValue] = i;
  fieldValue <<= 1;
  if ((fieldValue & 0x100) !== 0) {
    fieldValue ^= 0x11d;
  }
}
for (let i = 255; i < 512; i += 1) {
  expTable[i] = expTable[i - 255];
}

const gfMultiply = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0;
  return expTable[logTable[a] + logTable[b]];
};

const multiplyPolynomials = (a: number[], b: number[]) => {
  const result = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      result[i + j] ^= gfMultiply(a[i], b[j]);
    }
  }
  return result;
};

const buildGenerator = (degree: number) => {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    generator = multiplyPolynomials(generator, [1, expTable[i]]);
  }
  return generator;
};

const generator = buildGenerator(ECC_CODEWORDS);

const computeEcc = (data: number[]) => {
  const result = new Array<number>(ECC_CODEWORDS).fill(0);
  for (const value of data) {
    const factor = value ^ result[0];
    result.copyWithin(0, 1);
    result[ECC_CODEWORDS - 1] = 0;
    for (let i = 0; i < ECC_CODEWORDS; i += 1) {
      result[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }
  return result;
};

const encodeAlphanumeric = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new Error("QR value is empty.");
  }
  if (normalized.length > 25) {
    throw new Error("QR value is too long for version 1-L.");
  }
  for (const char of normalized) {
    if (!ALPHANUMERIC.includes(char)) {
      throw new Error(`Unsupported QR character: ${char}`);
    }
  }

  const buffer = makeBitBuffer();
  buffer.add(0b0010, 4);
  buffer.add(normalized.length, 9);

  for (let i = 0; i < normalized.length; i += 2) {
    const first = ALPHANUMERIC.indexOf(normalized[i]);
    const second = ALPHANUMERIC.indexOf(normalized[i + 1] ?? "");
    if (i + 1 < normalized.length) {
      buffer.add(first * 45 + second, 11);
    } else {
      buffer.add(first, 6);
    }
  }

  const maxBits = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, maxBits - buffer.bits.length);
  buffer.add(0, terminator);

  while (buffer.bits.length % 8 !== 0) {
    buffer.bits.push(false);
  }

  const data: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (buffer.bits[i + j] ? 1 : 0);
    }
    data.push(byte);
  }

  let pad = 0xec;
  while (data.length < DATA_CODEWORDS) {
    data.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  return data;
};

const getBit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

const computeFormatBits = (mask: number) => {
  const errorCorrectionLow = 1;
  const data = (errorCorrectionLow << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
};

const createEmptyMatrix = () => ({
  modules: Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false)),
  reserved: Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
});

const inBounds = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < SIZE && y < SIZE;

const createVersionOneMatrix = (codewords: number[]): Matrix => {
  const { modules, reserved } = createEmptyMatrix();

  const setFunction = (x: number, y: number, dark: boolean) => {
    if (!inBounds(x, y)) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  const drawFinder = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (!inBounds(x, y)) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(SIZE - 4, 3);
  drawFinder(3, SIZE - 4);

  for (let i = 8; i < SIZE - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }

  setFunction(8, SIZE - 8, true);

  const formatBits = computeFormatBits(0);
  for (let i = 0; i <= 5; i += 1) {
    setFunction(8, i, getBit(formatBits, i));
  }
  setFunction(8, 7, getBit(formatBits, 6));
  setFunction(8, 8, getBit(formatBits, 7));
  setFunction(7, 8, getBit(formatBits, 8));
  for (let i = 9; i < 15; i += 1) {
    setFunction(14 - i, 8, getBit(formatBits, i));
  }
  for (let i = 0; i < 8; i += 1) {
    setFunction(SIZE - 1 - i, 8, getBit(formatBits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    setFunction(8, SIZE - 15 + i, getBit(formatBits, i));
  }

  const dataBits: boolean[] = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i -= 1) {
      dataBits.push(((byte >>> i) & 1) === 1);
    }
  }

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let x = right; x >= right - 1; x -= 1) {
        if (reserved[y][x]) continue;
        let dark = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
        bitIndex += 1;
        if ((x + y) % 2 === 0) {
          dark = !dark;
        }
        modules[y][x] = dark;
      }
    }
    upward = !upward;
  }

  return modules;
};

export const createQrMatrix = (value: string): Matrix => {
  const data = encodeAlphanumeric(value);
  const ecc = computeEcc(data);
  return createVersionOneMatrix([...data, ...ecc]);
};
