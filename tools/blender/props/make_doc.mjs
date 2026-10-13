#!/usr/bin/env node
// Generate docs/assets/generated-props.md from tools/blender/props/manifest.json + the GLBs themselves.
// Usage: node tools/blender/props/make_doc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const glbDir = path.join(root, 'public/assets/models/gen/props');
const out = path.join(root, 'docs/assets/generated-props.md');
const man = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8'));

function gltf(file) {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const CAT = {
  nature: 'Doğa (ağaçlar, çalılar, kayalar, çitler)',
  town: 'Kasaba / kamp',
  dungeon: 'Zindan',
  special: 'Özel oynanış objeleri (Mythic+)',
};

const rows = { nature: [], town: [], dungeon: [], special: [] };
let totalBytes = 0, totalTris = 0;
for (const id of Object.keys(man).sort()) {
  const m = man[id];
  const file = path.join(glbDir, `${id}.glb`);
  if (!fs.existsSync(file)) continue;
  const g = gltf(file);
  const bytes = fs.statSync(file).size;
  totalBytes += bytes; totalTris += m.tris;
  const anims = (g.animations || []).map((a) => a.name);
  const meshNodes = (g.nodes || []).filter((n) => n.mesh !== undefined).map((n) => n.name);
  const empties = (g.nodes || []).filter((n) => n.mesh === undefined).map((n) => n.name);
  const emissiveMats = (g.materials || []).filter((mt) => mt.emissiveTexture || (mt.emissiveFactor && mt.emissiveFactor.some((v) => v > 0)))
    .map((mt) => mt.name);
  const alphaMats = (g.materials || []).filter((mt) => mt.alphaMode === 'MASK').map((mt) => mt.name);
  const [w, h, d] = m.size;
  const nodesInfo = [];
  if (meshNodes.length > 1) nodesInfo.push(`mesh: ${meshNodes.map((n) => '`' + n + '`').join(', ')}`);
  if (empties.length) nodesInfo.push(`boş: ${empties.map((n) => '`' + n + '`').join(', ')}`);
  if (alphaMats.length) nodesInfo.push(`alfa MASK: ${alphaMats.join(', ')}`);
  const attach = [m.attach, nodesInfo.join('; ')].filter(Boolean).join(' — ');
  const emis = m.emissive ? `${m.emissive} (mat: ${emissiveMats.join(', ') || '-'})` : (emissiveMats.length ? `mat: ${emissiveMats.join(', ')}` : '-');
  rows[m.category].push(
    `| \`${id}\` | \`/assets/models/gen/props/${id}.glb\` | ${m.name_tr} | ${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)} | ${m.tris} | ${anims.length ? anims.join(', ') : '-'} | ${m.use} | ${emis} | ${attach || '-'} | ${(bytes / 1024).toFixed(1)} |`,
  );
}

const count = Object.values(rows).reduce((a, r) => a + r.length, 0);
let md = `# Üretilmiş PSX Proplar (props)

EFSUN ONLINE – Kadim Zindanlar için Blender 5.2 ile **arka planda (headless)** prosedürel olarak üretilmiş ${count} çevre/oynanış objesi.
Toplam ${totalTris} üçgen, ${(totalBytes / 1024).toFixed(0)} KB (tüm dokular GLB içine gömülü).

![props önizleme](previews/props.png)

## Sözleşme

- **Ölçek:** 1 Blender birimi = 1 oyun birimi (metre). Karakter ~2.5, zindan karosu 4×4, duvar 4, kapı ~2.5×3.5.
- **Eksenler:** glTF +Y yukarı. Modeller **+Z yönüne bakar** (Blender'da -Y). Sandık kilidi, tabela yüzü, portal ön yüzü vb. +Z'dedir.
- **Orijin:** taban merkezi (zemin teması, y=0). İstisnalar: \`chains_hanging\` (orijin üstte, tavana as), \`lamp_post\` (orijin direk dibinde, fener kolu +Z'ye uzanır).
- **Boyut sütunu:** W × H × D = glTF X × Y × Z (metre), AABB.
- **Malzeme:** Principled BSDF → glTF metallic-roughness (roughness 0.9, metallic 0). 16×16 – 64×64 piksel dokular, **NEAREST** filtre
  (sampler mag 9728 / min 9984). Her asset ~8–20 renklik sınırlı palet, ordered (Bayer) dither, elle boyanmış kenar/ışık detayları.
- **Vertex renkleri:** tüm meshlerde \`COLOR_0\` (zemine yakın AO + aşağı bakan yüz karartması + PSX tarzı ±%5 yüz titremesi).
  three.js GLTFLoader bunu otomatik \`vertexColors\` ile base color'a çarpar.
- **Emissive:** \`emissiveTexture\` + \`KHR_materials_emissive_strength\` (1.5–3.0) → bloom eşiğini geçer. Emissive yalnız rün/kristal/ateş/cam piksellerindedir.
- **Alfa kartlar:** çimen, çiçek, alevler \`alphaMode: MASK\` + \`doubleSided\` (kumaşlar da çift yüzlü). Diğer tüm malzemeler tek yüzlü (backface culling).
- **Animasyon:** sandıklarda \`Open\` klibi (0.625 s, \`lid\` node'u yerel X ekseninde 0 → -105°, hafif sekme). Diğer hareketli parçalar ayrı node olarak verildi (oyun kodu döndürür/salınım verir).

## Oyun içi kullanım ipuçları (three.js)

- **Sandık:** \`gltf.animations\` içindeki \`Open\` klibini \`AnimationMixer\` ile \`LoopOnce\` + \`clampWhenFinished\` oynat; ya da \`scene.getObjectByName('lid').rotation.x = -1.83\`.
  Ganimet efekti için \`loot_fx\` boş node'unu kullan.
- **Portal:** \`portal_surface\` UV'leri girdap merkezi (0.5, 0.5) olacak şekilde ayarlı: \`map.center.set(0.5, 0.5); map.rotation += dt\` (aynı dokuyu \`emissiveMap\` için de döndür).
  Anahtar taşı yokken \`emissiveIntensity\` düşür / mesh'i gizle. \`enter_trigger\` giriş noktası.
- **Güç Kaynağı:** \`rune_ring\` (orijini halka merkezinde) Y ekseninde döndür, \`shards\` aşağı-yukarı salla; anahtar taşı \`keystone_socket\` noktasına konur (\`keystone.glb\` orijini alt merkez).
- **Toplanma dikilitaşı:** \`slot_1\`..\`slot_5\` her parti üyesi için ayrı mesh; materyal paylaşıldığı için yakmadan önce \`material.clone()\` yap.
- **Işık / efekt noktaları:** \`light_0\` boş node'larına PointLight (fener sıcak sarı, kristaller mavi/mor, portal mor), \`fire_fx\` noktalarına parçacık ekle.
  \`flame\` mesh'leri (çapraz alev kartları) ölçek/opacity titreşimi ile canlandırılabilir.
- **Rüzgar:** sancaklarda \`cloth\`, pazar tezgahında \`roof_cloth\` ayrı mesh: vertex shader dalgası veya basit rotasyon salınımı.
- **Diğer hareketli parçalar:** \`wagon\` tekerlekleri (\`wheel_*\`, yerel X ekseni), \`well\` kovası (\`bucket\`), \`iron_cage\` kapısı (\`door\`, dikey eksen),
  \`sarcophagus\` kapağı (\`lid\`, kaydır), kazan sıvısı (\`liquid\`, UV kaydır).
- **Instancing:** \`grass_tuft\`, \`flowers\`, kayalar ve ağaçlar InstancedMesh için uygundur (tek mesh, 1–3 malzeme).

`;

for (const cat of ['special', 'town', 'dungeon', 'nature']) {
  md += `## ${CAT[cat]}\n\n`;
  md += '| id | URL | Türkçe ad | Boyut W×H×D (m) | Tris | Animasyon | Kullanım | Emissive parçalar | Bağlantı / node bilgisi | KB |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  md += rows[cat].join('\n') + '\n\n';
}

md += `## Yeniden üretim

Tüm üreticiler \`tools/blender/props/\` altında (Blender penceresi açılmaz):

\`\`\`bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
# tüm proplar (veya --cat nature,town,dungeon,special  /  --only chest_epic,mplus_portal)
"$B" --background --factory-startup --python tools/blender/props/build_props.py -- --out public/assets/models/gen/props
# önizleme sayfası (GLB'leri yeniden içe aktarır = export doğrulaması); --frame 15 sandıkları açık gösterir
"$B" --background --factory-startup --python tools/blender/props/render_preview.py -- public/assets/models/gen/props docs/assets/previews/props.png --cols 8 --cell 240
node tools/glb-inspect.mjs public/assets/models/gen/props --short
node tools/blender/props/make_doc.mjs
\`\`\`

| Dosya | İçerik |
|---|---|
| \`psx_lib.py\` | numpy piksel doku üreticileri (tahta, tuğla, kaya, metal, kumaş, yaprak, rün, girdap, kor, alev…), low-poly primitifler (Part), UV modları, malzeme/obje/COLOR_0, GLB export, manifest |
| \`common.py\` | ortak paletler ve bileşenler (kasa, fıçı, çuval, kütük, mum, alev kartları, sandık kapağı, \`Open\` animasyonu) |
| \`props_nature.py\` / \`props_town.py\` / \`props_dungeon.py\` / \`props_special.py\` | asset tanımları (\`@asset\` dekoratörü: id, Türkçe ad, kullanım, emissive, bağlantı notu) |
| \`build_props.py\` | sürücü (\`--only\`, \`--cat\`, \`--list\`), \`manifest.json\` yazar |
| \`render_preview.py\` | EEVEE ortografik 3/4 kontakt sayfası (\`--frame\` ile animasyon karesi) |
| \`make_doc.mjs\` | bu dokümanı üretir |
`;

fs.writeFileSync(out, md, 'utf8');
console.log('wrote', out, count, 'assets', totalTris, 'tris', (totalBytes / 1024).toFixed(0), 'KB');
