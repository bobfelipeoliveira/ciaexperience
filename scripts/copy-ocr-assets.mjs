/**
 * Copia o motor de OCR (Tesseract) e o idioma português para public/ocr/,
 * para que a leitura de imagens funcione SEM baixar nada de servidores externos.
 * Executado automaticamente antes de "npm run dev" e "npm run build".
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public', 'ocr');
const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'lang/por.traineddata.gz'],
];
for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dst = path.join(out, to);
  if (!fs.existsSync(src)) { console.error(`[ocr] arquivo não encontrado: ${from} — rode "npm ci".`); process.exit(1); }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log(`[ocr] ${copies.length} arquivos copiados para public/ocr/`);
