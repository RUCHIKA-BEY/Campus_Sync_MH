// End-to-end check of the ticket → scanner pipeline: a pass QR generated
// with the ticket's colours must be decodable by the organizer's scanner.
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const PLUM = [0x4a, 0x2e, 0x35], WHITE = [255, 255, 255];

function render(text: string, scale = 6, margin = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, size = (n + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - margin, my = Math.floor(y / scale) - margin;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && modules.get(my, mx);
      const [r, g, b] = dark ? PLUM : WHITE;
      const i = (y * size + x) * 4;
      data[i] = r!; data[i + 1] = g!; data[i + 2] = b!; data[i + 3] = 255;
    }
  }
  return { data, size };
}

describe('ticket QR is scannable', () => {
  it('a real pass (CAMPUSSYNC|<32 hex>) round-trips through jsQR', () => {
    const text = `CAMPUSSYNC|${'0123456789abcdef'.repeat(2)}`;
    const { data, size } = render(text);
    expect(jsQR(data, size, size, { inversionAttempts: 'dontInvert' })?.data).toBe(text);
  });
  it('a demo pass round-trips too', () => {
    const text = 'CAMPUSSYNC-DEMO|hackgrid|DEMO-B66BED93421E';
    const { data, size } = render(text);
    expect(jsQR(data, size, size, { inversionAttempts: 'dontInvert' })?.data).toBe(text);
  });
});
