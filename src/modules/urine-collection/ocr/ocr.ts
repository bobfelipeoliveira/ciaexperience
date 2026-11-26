/**
 * Leitura de texto em imagens (OCR) 100% no navegador.
 * O motor (Tesseract) e o idioma português são servidos pelo próprio site
 * (public/ocr/), então a imagem do prontuário NUNCA sai do computador.
 */
import type { Worker } from 'tesseract.js';

export type OcrProgress = (fraction: number, status: string) => void;

let workerPromise: Promise<Worker> | null = null;
let listener: OcrProgress | null = null;

const STATUS: Record<string, string> = {
  'loading tesseract core': 'Preparando o leitor…',
  'initializing tesseract': 'Preparando o leitor…',
  'loading language traineddata': 'Carregando o português…',
  'initializing api': 'Preparando o leitor…',
  'recognizing text': 'Lendo a imagem…',
};

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
      return createWorker('por', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        workerBlobURL: false,
        gzip: true,
        logger: (m: { status: string; progress: number }) => listener?.(m.progress ?? 0, STATUS[m.status] ?? 'Lendo a imagem…'),
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Amplia e converte para tons de cinza: melhora a leitura de prints pequenos. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1600 ? Math.min(3, 1600 / bmp.width) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  bmp.close();
  return c;
}

/** Lê uma imagem e devolve o texto (uma execução por vez). */
let queue: Promise<unknown> = Promise.resolve();
export function readImageText(file: Blob, onProgress?: OcrProgress): Promise<string> {
  const job = queue.then(async () => {
    listener = onProgress ?? null;
    onProgress?.(0, 'Preparando o leitor…');
    const worker = await getWorker();
    const canvas = await prepare(file);
    const { data } = await worker.recognize(canvas);
    onProgress?.(1, 'Concluído');
    listener = null;
    return (data.text ?? '').replace(/\n{3,}/g, '\n\n').trim();
  });
  queue = job.catch(() => undefined);
  return job;
}

export const OCR_ACCEPT = 'image/png,image/jpeg,image/webp';
export const OCR_MAX_BYTES = 10 * 1024 * 1024;
