import sharp from "sharp";

type SharpImage = ReturnType<typeof sharp>;
type RawInfo = { width: number; height: number; channels: number };

/**
 * Real pixel-level measurements used by the Demo Mode analyzer (§25: "create
 * a mock/demo implementation" — this is that implementation for photo
 * scoring). Nothing here is random; every number comes from the actual
 * image. What it can't do is semantic/emotional understanding — that's
 * flagged explicitly wherever it's approximated (see demo-provider.ts).
 */

export type ImageMetrics = {
  width: number;
  height: number;
  aspectRatio: number;
  meanBrightness: number; // 0-255
  brightnessStdev: number; // contrast proxy
  meanSaturation: number; // 0-1
  sharpnessGlobal: number; // laplacian variance, log-scaled
  sharpnessCenter: number;
  sharpnessEdges: number;
  horizontalEnergy: number;
  verticalEnergy: number;
  gridEnergy: number[]; // 9 cells, row-major, edge energy per cell
  meanColor: [number, number, number];
  samplePalette: [number, number, number][];
};

const LAPLACIAN_KERNEL = { width: 3, height: 3, kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0] };
const HORIZONTAL_KERNEL = { width: 3, height: 3, kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1] };
const VERTICAL_KERNEL = { width: 3, height: 3, kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1] };

function variance(buf: Buffer): number {
  const n = buf.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (buf[i] - mean) ** 2;
  return sq / n;
}

function meanAbs(buf: Buffer): number {
  const n = buf.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(buf[i] - 128);
  return sum / n;
}

async function greyRaw(input: SharpImage): Promise<{ data: Buffer; info: RawInfo }> {
  return input.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
}

export async function computeImageMetrics(absolutePath: string): Promise<ImageMetrics> {
  const base = sharp(absolutePath).rotate(); // auto-orient via EXIF
  const metadata = await base.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Downscale for analysis — a few hundred px is plenty for these proxies
  // and keeps a 30-photo batch fast.
  const analysisWidth = Math.min(600, width || 600);
  const resized = base.clone().resize({ width: analysisWidth, withoutEnlargement: true });

  const stats = await resized.clone().stats();
  const channels = stats.channels;
  const meanColor: [number, number, number] = [
    Math.round(channels[0]?.mean ?? 128),
    Math.round(channels[1]?.mean ?? 128),
    Math.round(channels[2]?.mean ?? 128),
  ];
  const meanBrightness = (meanColor[0] * 0.299 + meanColor[1] * 0.587 + meanColor[2] * 0.114);
  const brightnessStdev = ((channels[0]?.stdev ?? 0) + (channels[1]?.stdev ?? 0) + (channels[2]?.stdev ?? 0)) / 3;

  const maxc = Math.max(...meanColor);
  const minc = Math.min(...meanColor);
  const meanSaturation = maxc === 0 ? 0 : (maxc - minc) / maxc;

  const { data: greyBuf, info } = await greyRaw(resized);
  const gw = info.width;
  const gh = info.height;

  const laplacian = await sharp(greyBuf, { raw: { width: gw, height: gh, channels: 1 } })
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer();
  const sharpnessGlobal = Math.log10(1 + variance(laplacian));

  // Center crop (middle 50%) vs whole-frame edges for focus/motion-blur proxies.
  const cx = Math.floor(gw * 0.25);
  const cy = Math.floor(gh * 0.25);
  const cw = Math.max(1, Math.floor(gw * 0.5));
  const ch = Math.max(1, Math.floor(gh * 0.5));
  const centerBuf = await sharp(greyBuf, { raw: { width: gw, height: gh, channels: 1 } })
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer();
  const sharpnessCenter = Math.log10(1 + variance(centerBuf));

  // "Edges" = whole frame minus center weight, approximated by comparing
  // global sharpness against a downsampled (blurred) version's residual.
  const blurredVariance = await sharp(greyBuf, { raw: { width: gw, height: gh, channels: 1 } })
    .blur(3)
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer();
  const sharpnessEdges = Math.log10(1 + variance(blurredVariance));

  const hBuf = await sharp(greyBuf, { raw: { width: gw, height: gh, channels: 1 } })
    .convolve(HORIZONTAL_KERNEL)
    .raw()
    .toBuffer();
  const vBuf = await sharp(greyBuf, { raw: { width: gw, height: gh, channels: 1 } })
    .convolve(VERTICAL_KERNEL)
    .raw()
    .toBuffer();
  const horizontalEnergy = meanAbs(hBuf);
  const verticalEnergy = meanAbs(vBuf);

  // 3x3 rule-of-thirds grid: edge energy per cell from the laplacian buffer.
  const gridEnergy: number[] = [];
  const cellW = Math.floor(gw / 3);
  const cellH = Math.floor(gh / 3);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      let count = 0;
      const startY = row * cellH;
      const endY = row === 2 ? gh : startY + cellH;
      const startX = col * cellW;
      const endX = col === 2 ? gw : startX + cellW;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          sum += laplacian[y * gw + x] ?? 0;
          count++;
        }
      }
      gridEnergy.push(count ? sum / count : 0);
    }
  }

  // Coarse 4x4 color palette sample for detectedColors.
  const paletteRaw = await resized
    .clone()
    .resize(4, 4, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const samplePalette: [number, number, number][] = [];
  const channelsCount = paletteRaw.info.channels;
  for (let i = 0; i < paletteRaw.data.length; i += channelsCount) {
    samplePalette.push([paletteRaw.data[i], paletteRaw.data[i + 1], paletteRaw.data[i + 2]]);
  }

  return {
    width,
    height,
    aspectRatio: height ? width / height : 1,
    meanBrightness,
    brightnessStdev,
    meanSaturation,
    sharpnessGlobal,
    sharpnessCenter,
    sharpnessEdges,
    horizontalEnergy,
    verticalEnergy,
    gridEnergy,
    meanColor,
    samplePalette,
  };
}
