import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = process.cwd();
const iconsDir = path.resolve(rootDir, 'public', 'icons');
const sourceSvgPath = path.join(iconsDir, 'icon.svg');
const BRAND_GREEN = '#059669';

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Arquivo SVG fonte não encontrado em ${sourceSvgPath}`);
  }

  const svgBuffer = fs.readFileSync(sourceSvgPath);

  // Ícone padrão 192x192 (a partir do ícone completo)
  await sharp(svgBuffer, { density: 600 })
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-192x192.png'));

  // Ícone padrão 512x512 (a partir do ícone completo)
  await sharp(svgBuffer, { density: 600 })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-512x512.png'));

  // Apple Touch Icon 180x180 (ícone completo sobre fundo verde #059669, sem transparência e sem cantos arredondados)
  await sharp(svgBuffer, { density: 600 })
    .resize(180, 180, { fit: 'contain', background: BRAND_GREEN })
    .flatten({ background: BRAND_GREEN })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  // Ícone maskable 512x512 (fundo verde #059669 ocupando o quadrado inteiro, sem cantos arredondados,
  // com o cartão branco da tabela centralizado dentro da área segura de 80%)
  const safeZoneSize = Math.round(512 * 0.8); // 410px
  const maskableInnerBuffer = await sharp(svgBuffer, { density: 600 })
    .resize(safeZoneSize, safeZoneSize, { fit: 'contain', background: BRAND_GREEN })
    .flatten({ background: BRAND_GREEN })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: BRAND_GREEN,
    },
  })
    .composite([{ input: maskableInnerBuffer, gravity: 'center' }])
    .flatten({ background: BRAND_GREEN })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));

  console.log('Ícones PWA gerados com sucesso em public/icons/:');
  console.log(' - icon-192x192.png (192x192)');
  console.log(' - icon-512x512.png (512x512)');
  console.log(' - icon-maskable-512x512.png (512x512, fundo #059669, safe zone 80%)');
  console.log(' - apple-touch-icon.png (180x180, fundo #059669 sólido)');
}

main().catch((err) => {
  console.error('Erro ao gerar ícones PWA:', err);
  process.exit(1);
});
