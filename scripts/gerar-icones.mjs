import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = process.cwd();
const iconsDir = path.resolve(rootDir, 'public', 'icons');
const sourceSvgPath = path.join(iconsDir, 'icon.svg');

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Arquivo SVG fonte não encontrado em ${sourceSvgPath}`);
  }

  const svgBuffer = fs.readFileSync(sourceSvgPath);

  // Ícone padrão 192x192
  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-192x192.png'));

  // Ícone padrão 512x512
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-512x512.png'));

  // Ícone maskable 512x512 (zona segura de 80% no centro: 408x408 sobre fundo sólido #ffffff)
  const maskableInnerBuffer = await sharp(svgBuffer, { density: 300 })
    .resize(408, 408, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([{ input: maskableInnerBuffer, gravity: 'center' }])
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));

  // Apple Touch Icon 180x180 (fundo branco sólido sem transparência)
  await sharp(svgBuffer, { density: 300 })
    .resize(180, 180, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  console.log('Ícones PWA gerados com sucesso em public/icons/:');
  console.log(' - icon-192x192.png (192x192)');
  console.log(' - icon-512x512.png (512x512)');
  console.log(' - icon-maskable-512x512.png (512x512, safe zone 80%)');
  console.log(' - apple-touch-icon.png (180x180)');
}

main().catch((err) => {
  console.error('Erro ao gerar ícones PWA:', err);
  process.exit(1);
});
