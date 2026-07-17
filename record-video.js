import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const SLIDE_MS = 5000;
const TOTAL_SLIDES = 6;
const FRAMES_DIR = join(import.meta.dirname, '__frames__');
const OUTPUT = join(import.meta.dirname, 'ngay-moi-video.mp4');
const HTML_PATH = join(import.meta.dirname, 'ngay-moi-video.html');

async function main() {
  console.log('Chuan bi thu lap frames...');
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.goto(`file:///${HTML_PATH.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

  // Pause auto-play, we'll control manually
  await page.evaluate(() => {
    // Override the interval by setting playing to false via keyboard
    window.__frameCount = 0;
  });

  // We need to let the first slide render, then capture frames
  // Strategy: capture frames at 30fps for each slide duration
  const totalFrames = Math.ceil((SLIDE_MS / 1000) * FPS) * TOTAL_SLIDES;

  console.log(`Tong so frame: ${totalFrames} (${TOTAL_SLIDES} slides, ${FPS} fps)`);

  for (let slideIdx = 0; slideIdx < TOTAL_SLIDES; slideIdx++) {
    const framesPerSlide = Math.ceil((SLIDE_MS / 1000) * FPS);
    console.log(`\nDang chup slide ${slideIdx + 1}/${TOTAL_SLIDES} (${framesPerSlide} frames)...`);

    // Ensure correct slide is active
    if (slideIdx === 0) {
      // Wait for first slide to be active
      await new Promise(r => setTimeout(r, 800));
    }

    for (let f = 0; f < framesPerSlide; f++) {
      const frameNum = slideIdx * framesPerSlide + f;
      const padded = String(frameNum).padStart(6, '0');
      await page.screenshot({
        path: join(FRAMES_DIR, `frame_${padded}.png`),
        type: 'png',
      });

      // Small delay to simulate real-time
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }

    // Go to next slide
    if (slideIdx < TOTAL_SLIDES - 1) {
      await page.keyboard.press('ArrowRight');
      await new Promise(r => setTimeout(r, 900)); // wait for transition
    }
  }

  await browser.close();
  console.log('\nDa chup xong frames. Dang tao MP4...');

  // Use FFmpeg to combine frames into MP4
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-framerate', String(FPS),
    '-i', join(FRAMES_DIR, 'frame_%06d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-vf', `scale=${WIDTH}:${HEIGHT}`,
    OUTPUT,
  ].join(' ');

  console.log(`Chay: ${ffmpegCmd}\n`);
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Cleanup
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log(`\nDa tao xong: ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
