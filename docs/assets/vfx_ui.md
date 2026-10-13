# VFX dokuları, UI görselleri ve ikonlar

Bu dosya `public/assets/textures/vfx/`, `public/assets/textures/ui/` ve `public/assets/icons/` altındaki **her** dosyayı listeler. URL yolları Vite `public/` köküne göredir (örn. `/assets/icons/skill-whirlwind.svg`). Lisans ve yazarlar: [credits-vfx-ui.md](credits-vfx-ui.md). İkonların makine-okunur listesi: [icons.json](icons.json).

## 1. VFX parçacık dokuları (`/assets/textures/vfx/`)

Kaynak: Kenney "Particle Pack" 1.1 (CC0), "PNG (Black background)" sürümünden dönüştürüldü. **Format:** 256x256 PNG, gri+alfa (RGB = beyaz, alfa = normalize edilmiş parlaklık). Böylece:

- Renk `material.color` ile verilir (dokuda renk yok), aynı doku ateş/buz/zehir için yeniden kullanılır.
- `THREE.AdditiveBlending` (parlayan efektler) ve `THREE.NormalBlending` (duman, toz, gölge) ikisi de çalışır. `depthWrite: false`, `transparent: true` kullanın.
- PSX görünümü için `texture.magFilter = texture.minFilter = THREE.NearestFilter`, `generateMipmaps = false` önerilir; daha yumuşak isteniyorsa LinearFilter.
- `ring-*`, `magic-circle-*`, `aura-*`, `telegraph-circle` zemin dekali olarak yatay düzleme (`rotation.x = -PI/2`) konur; geri kalanlar billboard sprite / Points içindir.

| Dosya (URL) | Boyut | Kaynak (Kenney) | Kullanım amacı |
|---|---|---|---|
| `/assets/textures/vfx/ring-01.png` | 256x256 | circle_01.png | Kalın yumuşak halka: şok dalgası, level-up halkası, AoE nabzı |
| `/assets/textures/vfx/ring-02.png` | 256x256 | circle_02.png | İnce keskin halka: hedef seçim dairesi, dalgalanma (ripple) |
| `/assets/textures/vfx/ring-03.png` | 256x256 | circle_03.png | Çift halka: telegraph dış çizgisi, büyü dairesi tabanı |
| `/assets/textures/vfx/ring-04.png` | 256x256 | circle_04.png | Orta halka: genişleyen nova / şok dalgası |
| `/assets/textures/vfx/glow-soft.png` | 256x256 | circle_05.png | Yuvarlak yumuşak parıltı: mermi çekirdeği, ışık halesi; siyah tint + NormalBlending ile karakter gölge lekesi |
| `/assets/textures/vfx/debris-01.png` | 256x256 | dirt_01.png | Toprak/taş parçaları: yere vurma (ground slam) enkazı, darbe tozu (NormalBlending, kahverengi tint) |
| `/assets/textures/vfx/fire-01.png` | 256x256 | fire_01.png | Ateş gürültü patlaması: ateş topu gövdesi, yanan zemin, patlama dolgusu |
| `/assets/textures/vfx/fire-02.png` | 256x256 | fire_02.png | Ateş gürültü patlaması (varyant) |
| `/assets/textures/vfx/flame-01.png` | 256x256 | flame_01.png | Kıvrılan alev bulutu: alev parçacıkları, meşale, yanma DoT |
| `/assets/textures/vfx/flame-02.png` | 256x256 | flame_02.png | Kıvrılan alev bulutu (varyant) |
| `/assets/textures/vfx/flame-03.png` | 256x256 | flame_04.png | Kıvrılan alev bulutu (varyant) |
| `/assets/textures/vfx/flame-tongue-01.png` | 256x256 | flame_05.png | Dikey alev dili: mum/meşale, ateş duvarı sütunları, volkanik |
| `/assets/textures/vfx/flame-tongue-02.png` | 256x256 | flame_06.png | Dikey alev dili (varyant) |
| `/assets/textures/vfx/flare-01.png` | 256x256 | flare_01.png | Küçük nokta parlaması: loot pırıltısı, mermi ucu, kıvılcım |
| `/assets/textures/vfx/aura-01.png` | 256x256 | light_01.png | Eş merkezli yumuşak disk: ayak altı buff aurası, kutsal ışık, consecration zemini |
| `/assets/textures/vfx/aura-02.png` | 256x256 | light_03.png | Eş merkezli yumuşak disk (varyant) |
| `/assets/textures/vfx/magic-circle-01.png` | 256x256 | magic_01.png | Rün dairesi (beşgen): büyü yapma dairesi, çağırma, keystone yerleştirme, portal |
| `/assets/textures/vfx/magic-circle-02.png` | 256x256 | magic_02.png | Rün dairesi (sekizgen, varyant) |
| `/assets/textures/vfx/magic-flare-01.png` | 256x256 | magic_03.png | Dört köşeli yıldız parlaması: kritik vuruş flaşı, efsanevi loot flaşı, level-up |
| `/assets/textures/vfx/magic-flare-02.png` | 256x256 | magic_04.png | Dört köşeli yıldız parlaması (varyant) |
| `/assets/textures/vfx/burst-jet-01.png` | 256x256 | muzzle_01.png | Yukarı fışkırma: zemin patlaması, volkanik, vuruş fışkırması |
| `/assets/textures/vfx/burst-jet-02.png` | 256x256 | muzzle_04.png | Yukarı fışkırma (dar varyant) |
| `/assets/textures/vfx/explosion-01.png` | 256x256 | scorch_01.png | Dikenli patlama: darbe flaşı, bursting affix, explosive orb ölümü |
| `/assets/textures/vfx/explosion-02.png` | 256x256 | scorch_03.png | Dikenli patlama (yoğun varyant) |
| `/assets/textures/vfx/claw-01.png` | 256x256 | scratch_01.png | Üç çizgili pençe izi: canavar saldırıları, claw strike, rend |
| `/assets/textures/vfx/slash-01.png` | 256x256 | slash_01.png | Hilal kesik izi: yakın dövüş savuruş izi (kılıç, whirlwind, cleave) |
| `/assets/textures/vfx/slash-02.png` | 256x256 | slash_02.png | Hilal kesik izi (geniş varyant) |
| `/assets/textures/vfx/slash-03.png` | 256x256 | slash_03.png | Dikey hilal kesik |
| `/assets/textures/vfx/slash-04.png` | 256x256 | slash_04.png | Yatay yay kesik |
| `/assets/textures/vfx/smoke-01.png` | 256x256 | smoke_01.png | Duman bulutu: toz, ölüm "puf"u, adım tozu (NormalBlending) |
| `/assets/textures/vfx/smoke-02.png` | 256x256 | smoke_04.png | Duman bulutu (yoğun varyant): smoke bomb |
| `/assets/textures/vfx/smoke-03.png` | 256x256 | smoke_07.png | Duman bulutu (keskin kenar varyant) |
| `/assets/textures/vfx/smoke-04.png` | 256x256 | smoke_09.png | Duman bulutu (delikli varyant) |
| `/assets/textures/vfx/smoke-ring-01.png` | 256x256 | smoke_10.png | Duman halkası: iniş darbesi, ground slam toz halkası |
| `/assets/textures/vfx/lightning-01.png` | 256x256 | spark_01.png | Şimşek bulutu: shock debuff, fırtına |
| `/assets/textures/vfx/lightning-02.png` | 256x256 | spark_02.png | Şimşek bulutu (yoğun varyant) |
| `/assets/textures/vfx/lightning-03.png` | 256x256 | spark_05.png | Dikey şimşek: zincir şimşek segmenti, gökten yıldırım |
| `/assets/textures/vfx/lightning-04.png` | 256x256 | spark_07.png | Yatay şimşek: zincir şimşek kirişi (beam) |
| `/assets/textures/vfx/star-01.png` | 256x256 | star_01.png | Yıldız pırıltısı: vuruş kıvılcımı, loot pırıltısı |
| `/assets/textures/vfx/star-02.png` | 256x256 | star_02.png | Halkalı yıldız: kritik vuruş, sersemletme yıldızları |
| `/assets/textures/vfx/star-03.png` | 256x256 | star_04.png | İnce dört köşeli yıldız |
| `/assets/textures/vfx/star-04.png` | 256x256 | star_06.png | Keskin dört köşeli yıldız |
| `/assets/textures/vfx/star-05.png` | 256x256 | star_09.png | Işınlı parlak yıldız: büyük vuruş flaşı |
| `/assets/textures/vfx/trace-01.png` | 256x256 | trace_01.png | İnce dikey çizgi: hız çizgileri, yağmur, ok izi, loot ışını detayı |
| `/assets/textures/vfx/trace-02.png` | 256x256 | trace_03.png | Dalgalı dikey çizgi: düşen meteor izi, enerji akışı |
| `/assets/textures/vfx/twirl-01.png` | 256x256 | twirl_01.png | Girdap: whirlwind, tornado (storming), portal girdabı |
| `/assets/textures/vfx/twirl-02.png` | 256x256 | twirl_02.png | Girdap (çok kollu varyant) |
| `/assets/textures/vfx/twirl-03.png` | 256x256 | twirl_03.png | Girdap (spiral varyant) |
| `/assets/textures/vfx/loot-beam.png` | 64x256 | üretildi (CC0) | ÜRETİLDİ (bu projede): dikey ışın, yerdeki loot üzerindeki nadirlik ışık sütunu (nadirlik rengine tint) |
| `/assets/textures/vfx/telegraph-circle.png` | 256x256 | üretildi (CC0) | ÜRETİLDİ (bu projede): AoE uyarı diski (soluk dolgu + parlak kenar), düşman zemin telegraph'ları (volcanic, quaking), kırmızı tint |
| `/assets/textures/vfx/LICENSE-kenney-particle-pack.txt` | - | License.txt | Kenney CC0 lisans metni |

## 2. UI görselleri (`/assets/textures/ui/`)

Kaynaklar: Kenney "Fantasy UI Borders" 1.0 (CC0) -> `frame-*`, `divider-*`; Kenney "UI Pack: RPG Expansion" (CC0) -> `bar-*`, `button-*`, `panel-*`, `cursor-*`, `arrow-*`, `icon-*`.

**Fantasy UI Borders (`frame-*`, `divider-*`)**: beyaz piksel-art, 48x48, 2x piksel ölçeği (her mantıksal piksel 2x2). Karanlık fantezi teması için renk CSS ile verilir:

```css
/* 9-slice: köşe süslemeleri 12px içinde biter, 16 güvenli dilim */
.panel { border: 32px solid transparent; border-image: url(/assets/textures/ui/frame-panel-005.png) 16 fill / 32px; image-rendering: pixelated; }
```

Renklendirme (altın, nadirlik rengi vb.) için en sağlam yol: PNG'yi 48x48 canvas'a çizip `ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = "#c9a24a"; ctx.fillRect(0, 0, 48, 48);` ile boyayın ve `canvas.toDataURL()` sonucunu `border-image` kaynağı yapın (tüm tarayıcılarda çalışır). Chromium/Safari'de `-webkit-mask-box-image` da kullanılabilir.

Panel varyantları: `000` sade, `003` çift iç çizgi, `005` köşeli fantastik (önerilen ana stil), `007` yuvarlatılmış, `009` iç köşe süslü, `014` kalın iç çerçeve, `024` köşe kareli, `027` basit pah.

**RPG Expansion (`bar-*`, `button-*`, `panel-*`, ...)**: hazır renkli (kahverengi/gri/parşömen). Barlar 3 parçadır: `left` (9x18) + `mid` (18x18, yatay tekrar/uzat) + `right` (9x18). `panel-*` 100x100 / 93x94, 9-slice dilim ~10px. `button-*-pressed` 4px daha kısadır (basılınca aşağı kayma efekti için).

| Dosya (URL) | Boyut | Kaynak | Kullanım amacı |
|---|---|---|---|
| `/assets/textures/ui/arrow-brown-left.png` | 22x21 | ui-pack-rpg-expansion: arrowBrown_left.png | Sol/sağ ok: sayfa / sekme / karakter seçimi |
| `/assets/textures/ui/arrow-brown-right.png` | 22x21 | ui-pack-rpg-expansion: arrowBrown_right.png | Sol/sağ ok: sayfa / sekme / karakter seçimi |
| `/assets/textures/ui/arrow-silver-left.png` | 22x21 | ui-pack-rpg-expansion: arrowSilver_left.png | Sol/sağ ok: sayfa / sekme / karakter seçimi |
| `/assets/textures/ui/arrow-silver-right.png` | 22x21 | ui-pack-rpg-expansion: arrowSilver_right.png | Sol/sağ ok: sayfa / sekme / karakter seçimi |
| `/assets/textures/ui/bar-back-left.png` | 9x18 | ui-pack-rpg-expansion: barBack_horizontalLeft.png | 3 parçalı yatay bar (left): boş bar arka planı |
| `/assets/textures/ui/bar-back-mid.png` | 18x18 | ui-pack-rpg-expansion: barBack_horizontalMid.png | 3 parçalı yatay bar (mid): boş bar arka planı |
| `/assets/textures/ui/bar-back-right.png` | 9x18 | ui-pack-rpg-expansion: barBack_horizontalRight.png | 3 parçalı yatay bar (right): boş bar arka planı |
| `/assets/textures/ui/bar-blue-left.png` | 9x18 | ui-pack-rpg-expansion: barBlue_horizontalLeft.png | 3 parçalı yatay bar (left): Mana barı |
| `/assets/textures/ui/bar-blue-mid.png` | 18x18 | ui-pack-rpg-expansion: barBlue_horizontalBlue.png | 3 parçalı yatay bar (mid): Mana barı |
| `/assets/textures/ui/bar-blue-right.png` | 9x18 | ui-pack-rpg-expansion: barBlue_horizontalRight.png | 3 parçalı yatay bar (right): Mana barı |
| `/assets/textures/ui/bar-green-left.png` | 9x18 | ui-pack-rpg-expansion: barGreen_horizontalLeft.png | 3 parçalı yatay bar (left): XP / stamina / düşman kuvvetleri % barı |
| `/assets/textures/ui/bar-green-mid.png` | 18x18 | ui-pack-rpg-expansion: barGreen_horizontalMid.png | 3 parçalı yatay bar (mid): XP / stamina / düşman kuvvetleri % barı |
| `/assets/textures/ui/bar-green-right.png` | 9x18 | ui-pack-rpg-expansion: barGreen_horizontalRight.png | 3 parçalı yatay bar (right): XP / stamina / düşman kuvvetleri % barı |
| `/assets/textures/ui/bar-red-left.png` | 9x18 | ui-pack-rpg-expansion: barRed_horizontalLeft.png | 3 parçalı yatay bar (left): Can (HP) barı |
| `/assets/textures/ui/bar-red-mid.png` | 18x18 | ui-pack-rpg-expansion: barRed_horizontalMid.png | 3 parçalı yatay bar (mid): Can (HP) barı |
| `/assets/textures/ui/bar-red-right.png` | 9x18 | ui-pack-rpg-expansion: barRed_horizontalRight.png | 3 parçalı yatay bar (right): Can (HP) barı |
| `/assets/textures/ui/bar-yellow-left.png` | 9x18 | ui-pack-rpg-expansion: barYellow_horizontalLeft.png | 3 parçalı yatay bar (left): Enerji / öfke / cast barı |
| `/assets/textures/ui/bar-yellow-mid.png` | 18x18 | ui-pack-rpg-expansion: barYellow_horizontalMid.png | 3 parçalı yatay bar (mid): Enerji / öfke / cast barı |
| `/assets/textures/ui/bar-yellow-right.png` | 9x18 | ui-pack-rpg-expansion: barYellow_horizontalRight.png | 3 parçalı yatay bar (right): Enerji / öfke / cast barı |
| `/assets/textures/ui/button-long-brown.png` | 190x49 | ui-pack-rpg-expansion: buttonLong_brown.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-long-brown-pressed.png` | 190x45 | ui-pack-rpg-expansion: buttonLong_brown_pressed.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-long-grey.png` | 190x49 | ui-pack-rpg-expansion: buttonLong_grey.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-long-grey-pressed.png` | 190x45 | ui-pack-rpg-expansion: buttonLong_grey_pressed.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-round-brown.png` | 35x38 | ui-pack-rpg-expansion: buttonRound_brown.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-round-grey.png` | 35x38 | ui-pack-rpg-expansion: buttonRound_grey.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-square-brown.png` | 45x49 | ui-pack-rpg-expansion: buttonSquare_brown.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-square-brown-pressed.png` | 45x45 | ui-pack-rpg-expansion: buttonSquare_brown_pressed.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-square-grey.png` | 45x49 | ui-pack-rpg-expansion: buttonSquare_grey.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/button-square-grey-pressed.png` | 45x45 | ui-pack-rpg-expansion: buttonSquare_grey_pressed.png | Hazır renkli düğme: menü / diyalog düğmeleri (pressed = basılı hali) |
| `/assets/textures/ui/cursor-gauntlet-bronze.png` | 30x30 | ui-pack-rpg-expansion: cursorGauntlet_bronze.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/cursor-gauntlet-grey.png` | 30x30 | ui-pack-rpg-expansion: cursorGauntlet_grey.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/cursor-hand-grey.png` | 27x28 | ui-pack-rpg-expansion: cursorHand_grey.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/cursor-sword-bronze.png` | 34x37 | ui-pack-rpg-expansion: cursorSword_bronze.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/cursor-sword-gold.png` | 34x37 | ui-pack-rpg-expansion: cursorSword_gold.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/cursor-sword-silver.png` | 34x37 | ui-pack-rpg-expansion: cursorSword_silver.png | Fare imleci (CSS cursor: url(...) 0 0, auto): kılıç = saldırı, eldiven = etkileşim, el = UI |
| `/assets/textures/ui/divider-000.png` | 96x22 | fantasy-ui-borders: Default/Divider/divider-000.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-001.png` | 96x22 | fantasy-ui-borders: Default/Divider/divider-001.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-002.png` | 96x10 | fantasy-ui-borders: Default/Divider/divider-002.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-003.png` | 96x18 | fantasy-ui-borders: Default/Divider/divider-003.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-004.png` | 96x14 | fantasy-ui-borders: Default/Divider/divider-004.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-005.png` | 96x18 | fantasy-ui-borders: Default/Divider/divider-005.png | Beyaz süslü ayırıcı çizgi: pencere başlık altı, liste ayırıcı |
| `/assets/textures/ui/divider-fade-000.png` | 96x22 | fantasy-ui-borders: Default/Divider Fade/divider-fade-000.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/divider-fade-001.png` | 96x22 | fantasy-ui-borders: Default/Divider Fade/divider-fade-001.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/divider-fade-002.png` | 96x10 | fantasy-ui-borders: Default/Divider Fade/divider-fade-002.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/divider-fade-003.png` | 96x18 | fantasy-ui-borders: Default/Divider Fade/divider-fade-003.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/divider-fade-004.png` | 96x14 | fantasy-ui-borders: Default/Divider Fade/divider-fade-004.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/divider-fade-005.png` | 96x18 | fantasy-ui-borders: Default/Divider Fade/divider-fade-005.png | Kenarları solan beyaz ayırıcı çizgi: tooltip bölümleri (stat / efsun / set) |
| `/assets/textures/ui/frame-border-000.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-000.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-003.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-003.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-005.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-005.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-007.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-007.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-009.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-009.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-014.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-014.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-024.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-024.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-border-027.png` | 48x48 | fantasy-ui-borders: Default/Border/panel-border-027.png | Beyaz yalnız-kenar 9-slice çerçeve: skill slotu, item tooltip kenarı (nadirlik rengine tint) |
| `/assets/textures/ui/frame-double-border-000.png` | 96x96 | fantasy-ui-borders: Double/Border/panel-border-000.png | Çift çizgili kenar 9-slice: efsanevi/set item tooltip kenarı |
| `/assets/textures/ui/frame-double-border-005.png` | 96x96 | fantasy-ui-borders: Double/Border/panel-border-005.png | Çift çizgili kenar 9-slice: efsanevi/set item tooltip kenarı |
| `/assets/textures/ui/frame-double-border-014.png` | 96x96 | fantasy-ui-borders: Double/Border/panel-border-014.png | Çift çizgili kenar 9-slice: efsanevi/set item tooltip kenarı |
| `/assets/textures/ui/frame-double-panel-000.png` | 96x96 | fantasy-ui-borders: Double/Panel/panel-000.png | Çift çizgili dolu 9-slice panel: önemli pencereler (M+ sonuç ekranı, demirci) |
| `/assets/textures/ui/frame-double-panel-005.png` | 96x96 | fantasy-ui-borders: Double/Panel/panel-005.png | Çift çizgili dolu 9-slice panel: önemli pencereler (M+ sonuç ekranı, demirci) |
| `/assets/textures/ui/frame-double-panel-014.png` | 96x96 | fantasy-ui-borders: Double/Panel/panel-014.png | Çift çizgili dolu 9-slice panel: önemli pencereler (M+ sonuç ekranı, demirci) |
| `/assets/textures/ui/frame-glass-000.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-000.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-003.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-003.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-005.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-005.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-007.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-007.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-009.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-009.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-014.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-014.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-024.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-024.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-glass-027.png` | 48x48 | fantasy-ui-borders: Default/Transparent center/panel-transparent-center-027.png | Beyaz kenar + yarı saydam merkez 9-slice: HUD paneli, sohbet kutusu, parti çerçevesi |
| `/assets/textures/ui/frame-panel-000.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-000.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-003.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-003.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-005.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-005.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-007.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-007.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-009.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-009.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-014.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-014.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-024.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-024.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/frame-panel-027.png` | 48x48 | fantasy-ui-borders: Default/Panel/panel-027.png | Beyaz dolu 9-slice panel (tint'lenebilir): pencere arka planı, tooltip, slot çerçevesi |
| `/assets/textures/ui/icon-check-bronze.png` | 16x15 | ui-pack-rpg-expansion: iconCheck_bronze.png | Onay işareti: hazır durumu, görev tamamlandı |
| `/assets/textures/ui/icon-check-grey.png` | 16x15 | ui-pack-rpg-expansion: iconCheck_grey.png | Onay işareti: hazır durumu, görev tamamlandı |
| `/assets/textures/ui/icon-circle-brown.png` | 17x17 | ui-pack-rpg-expansion: iconCircle_brown.png | Boş daire: radyo düğmesi, boş soket |
| `/assets/textures/ui/icon-circle-grey.png` | 17x17 | ui-pack-rpg-expansion: iconCircle_grey.png | Boş daire: radyo düğmesi, boş soket |
| `/assets/textures/ui/icon-cross-brown.png` | 16x15 | ui-pack-rpg-expansion: iconCross_brown.png | Çarpı: kapat, iptal, başarısız |
| `/assets/textures/ui/icon-cross-grey.png` | 16x15 | ui-pack-rpg-expansion: iconCross_grey.png | Çarpı: kapat, iptal, başarısız |
| `/assets/textures/ui/panel-brown.png` | 100x100 | ui-pack-rpg-expansion: panel_brown.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/panel-inset-brown.png` | 93x94 | ui-pack-rpg-expansion: panelInset_brown.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/panel-inset-parchment.png` | 93x94 | ui-pack-rpg-expansion: panelInset_beigeLight.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/panel-inset-slate.png` | 93x94 | ui-pack-rpg-expansion: panelInset_blue.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/panel-parchment.png` | 100x100 | ui-pack-rpg-expansion: panel_beigeLight.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/panel-slate.png` | 100x100 | ui-pack-rpg-expansion: panel_blue.png | Hazır renkli 9-slice panel: envanter / NPC diyalog / görev metni (parchment) |
| `/assets/textures/ui/LICENSE-kenney-fantasy-ui-borders.txt` | - | License.txt | Kenney CC0 lisans metni |
| `/assets/textures/ui/LICENSE-kenney-ui-pack-rpg-expansion.txt` | - | License.txt | Kenney CC0 lisans metni |

## 3. İkonlar (`/assets/icons/`, 304 adet SVG)

Kaynak: game-icons.net (github.com/game-icons/icons, master arşivi), **CC BY 3.0** (Zeromancer ve Viscious Speed CC0). Değişiklik: orijinal siyah 512x512 arka plan karesi kaldırıldı; ikonlar şeffaf zemin üzerinde **beyaz** (`fill="#fff"`), `viewBox="0 0 512 512"`.

Kullanım:

- `<img src="/assets/icons/skill-fireball.svg">` doğrudan beyaz çizer (koyu slot arka planı üzerinde).
- Renklendirmek için maske: `.icon { background: #ff8a3d; -webkit-mask: url(/assets/icons/skill-fireball.svg) center/contain no-repeat; mask: url(/assets/icons/skill-fireball.svg) center/contain no-repeat; }` (nadirlik rengi, cooldown karartması, debuff kırmızısı).
- PSX/piksel görünümü için küçük boyutta (32-48px) bir canvas'a çizip `image-rendering: pixelated` ile büyütün.
- Ad önekleri: `skill-` yetenek, `buff-` / `debuff-` durum etkileri, `affix-` Mythic+ haftalık affix, `item-` eşya / malzeme / para, `class-` sınıf, `stat-` karakter istatistiği, `ui-` arayüz.

### Yetenekler (90)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/skill-sword-slash.svg` | lorc/saber-slash.svg | Lorc | skill, warrior, knight, melee, physical, slash |
| `/assets/icons/skill-quick-slash.svg` | lorc/quick-slash.svg | Lorc | skill, warrior, rogue, melee, physical, slash |
| `/assets/icons/skill-double-strike.svg` | lorc/crossed-slashes.svg | Lorc | skill, warrior, melee, physical, combo |
| `/assets/icons/skill-whirlwind.svg` | lorc/spinning-sword.svg | Lorc | skill, warrior, barbarian, melee, aoe, spin |
| `/assets/icons/skill-blade-storm.svg` | lorc/spinning-blades.svg | Lorc | skill, warrior, barbarian, melee, aoe, channel |
| `/assets/icons/skill-shield-bash.svg` | delapouite/shield-bash.svg | Delapouite | skill, knight, melee, stun, shield |
| `/assets/icons/skill-shield-wall.svg` | lorc/surrounded-shield.svg | Lorc | skill, knight, defensive, shield |
| `/assets/icons/skill-charge.svg` | delapouite/charging-bull.svg | Delapouite | skill, warrior, barbarian, movement, gap-closer |
| `/assets/icons/skill-war-cry.svg` | lorc/shouting.svg | Lorc | skill, warrior, barbarian, buff, shout |
| `/assets/icons/skill-battle-shout.svg` | lorc/sonic-shout.svg | Lorc | skill, warrior, knight, buff, shout, aoe |
| `/assets/icons/skill-taunt.svg` | delapouite/shield-opposition.svg | Delapouite | skill, knight, tank, taunt |
| `/assets/icons/skill-berserk.svg` | delapouite/angry-eyes.svg | Delapouite | skill, barbarian, buff, rage |
| `/assets/icons/skill-cleave.svg` | lorc/axe-swing.svg | Lorc | skill, barbarian, warrior, melee, aoe, cleave |
| `/assets/icons/skill-leap.svg` | lorc/winged-leg.svg | Lorc | skill, warrior, barbarian, movement, leap |
| `/assets/icons/skill-ground-slam.svg` | lorc/quake-stomp.svg | Lorc | skill, barbarian, melee, aoe, stun |
| `/assets/icons/skill-execute.svg` | lorc/decapitation.svg | Lorc | skill, warrior, melee, finisher |
| `/assets/icons/skill-rend.svg` | lorc/serrated-slash.svg | Lorc | skill, warrior, melee, bleed, dot |
| `/assets/icons/skill-parry.svg` | lorc/sword-clash.svg | Lorc | skill, knight, defensive, parry |
| `/assets/icons/skill-riposte.svg` | andymeneely/riposte.svg | Andy Meneely | skill, knight, rogue, counter |
| `/assets/icons/skill-thrust.svg` | lorc/piercing-sword.svg | Lorc | skill, knight, melee, pierce |
| `/assets/icons/skill-iron-skin.svg` | delapouite/armor-upgrade.svg | Delapouite | skill, knight, defensive, buff, armor |
| `/assets/icons/skill-hammer-of-justice.svg` | delapouite/thor-hammer.svg | Delapouite | skill, knight, cleric, stun, holy |
| `/assets/icons/skill-claw-strike.svg` | lorc/claw-slashes.svg | Lorc | skill, barbarian, beast, melee, slash |
| `/assets/icons/skill-fireball.svg` | lorc/fireball.svg | Lorc | skill, mage, fire, projectile |
| `/assets/icons/skill-fire-wave.svg` | lorc/fire-wave.svg | Lorc | skill, mage, fire, aoe, cone |
| `/assets/icons/skill-fire-nova.svg` | lorc/fire-ring.svg | Lorc | skill, mage, fire, aoe, nova |
| `/assets/icons/skill-firewall.svg` | delapouite/firewall.svg | Delapouite | skill, mage, fire, ground, zone |
| `/assets/icons/skill-fire-breath.svg` | lorc/fire-breath.svg | Lorc | skill, mage, fire, cone, channel |
| `/assets/icons/skill-meteor.svg` | lorc/burning-meteor.svg | Lorc | skill, mage, fire, aoe, ultimate |
| `/assets/icons/skill-meteor-impact.svg` | lorc/meteor-impact.svg | Lorc | skill, mage, fire, aoe, impact |
| `/assets/icons/skill-frost-nova.svg` | lorc/snowflake-2.svg | Lorc | skill, mage, frost, aoe, nova, root |
| `/assets/icons/skill-frozen-orb.svg` | lorc/frozen-orb.svg | Lorc | skill, mage, frost, projectile, orb |
| `/assets/icons/skill-ice-lance.svg` | lorc/ice-spear.svg | Lorc | skill, mage, frost, projectile, pierce |
| `/assets/icons/skill-ice-bolt.svg` | lorc/ice-bolt.svg | Lorc | skill, mage, frost, projectile |
| `/assets/icons/skill-blizzard.svg` | lorc/snowing.svg | Lorc | skill, mage, frost, aoe, channel, zone |
| `/assets/icons/skill-ice-block.svg` | lorc/frozen-block.svg | Lorc | skill, mage, frost, defensive, immune |
| `/assets/icons/skill-frost-armor.svg` | delapouite/frozen-body.svg | Delapouite | skill, mage, frost, buff, armor |
| `/assets/icons/skill-arcane-missiles.svg` | lorc/comet-spark.svg | Lorc | skill, mage, arcane, projectile, channel |
| `/assets/icons/skill-arcane-orb.svg` | lorc/concentration-orb.svg | Lorc | skill, mage, arcane, projectile, orb |
| `/assets/icons/skill-arcane-explosion.svg` | lorc/bright-explosion.svg | Lorc | skill, mage, arcane, aoe, nova |
| `/assets/icons/skill-blink.svg` | lorc/teleport.svg | Lorc | skill, mage, arcane, movement, blink |
| `/assets/icons/skill-teleport.svg` | lorc/magic-portal.svg | Lorc | skill, mage, arcane, movement, portal |
| `/assets/icons/skill-chain-lightning.svg` | willdabeast/chain-lightning.svg | Willdabeast | skill, mage, lightning, chain |
| `/assets/icons/skill-lightning-bolt.svg` | lorc/focused-lightning.svg | Lorc | skill, mage, lightning, projectile |
| `/assets/icons/skill-thunderstorm.svg` | lorc/lightning-storm.svg | Lorc | skill, mage, lightning, aoe, zone |
| `/assets/icons/skill-thunderclap.svg` | lorc/thunder-struck.svg | Lorc | skill, mage, warrior, lightning, aoe, stun |
| `/assets/icons/skill-mana-shield.svg` | lorc/magic-shield.svg | Lorc | skill, mage, arcane, defensive, absorb |
| `/assets/icons/skill-poison-dagger.svg` | lorc/dripping-knife.svg | Lorc | skill, rogue, poison, melee, dot |
| `/assets/icons/skill-backstab.svg` | lorc/backstab.svg | Lorc | skill, rogue, melee, crit, positional |
| `/assets/icons/skill-shadow-step.svg` | lorc/shadow-follower.svg | Lorc | skill, rogue, shadow, movement, teleport |
| `/assets/icons/skill-smoke-bomb.svg` | darkzaitzev/smoke-bomb.svg | DarkZaitzev | skill, rogue, aoe, blind, stealth |
| `/assets/icons/skill-fan-of-knives.svg` | lorc/thrown-daggers.svg | Lorc | skill, rogue, aoe, projectile |
| `/assets/icons/skill-throw-knife.svg` | lorc/thrown-knife.svg | Lorc | skill, rogue, projectile |
| `/assets/icons/skill-shuriken.svg` | lorc/shuriken.svg | Lorc | skill, rogue, projectile |
| `/assets/icons/skill-stealth.svg` | darkzaitzev/hooded-figure.svg | DarkZaitzev | skill, rogue, stealth, buff |
| `/assets/icons/skill-vanish.svg` | lorc/cloak-dagger.svg | Lorc | skill, rogue, stealth, escape |
| `/assets/icons/skill-eviscerate.svg` | lorc/knife-thrust.svg | Lorc | skill, rogue, melee, finisher |
| `/assets/icons/skill-assassinate.svg` | lorc/diving-dagger.svg | Lorc | skill, rogue, melee, leap, finisher |
| `/assets/icons/skill-shadow-grasp.svg` | lorc/shadow-grasp.svg | Lorc | skill, rogue, shadow, root, pull |
| `/assets/icons/skill-dodge-roll.svg` | lorc/dodging.svg | Lorc | skill, generic, movement, evade |
| `/assets/icons/skill-dash.svg` | lorc/sprint.svg | Lorc | skill, generic, movement, dash |
| `/assets/icons/skill-poison-cloud.svg` | lorc/poison-gas.svg | Lorc | skill, rogue, poison, aoe, zone |
| `/assets/icons/skill-arrow-volley.svg` | lorc/arrow-cluster.svg | Lorc | skill, ranger, physical, aoe, arrow |
| `/assets/icons/skill-rain-of-arrows.svg` | lorc/striking-arrows.svg | Lorc | skill, ranger, physical, aoe, arrow |
| `/assets/icons/skill-multishot.svg` | delapouite/split-arrows.svg | Delapouite | skill, ranger, physical, projectile, arrow |
| `/assets/icons/skill-piercing-shot.svg` | lorc/supersonic-arrow.svg | Lorc | skill, ranger, physical, pierce, arrow |
| `/assets/icons/skill-aimed-shot.svg` | lorc/arrow-scope.svg | Lorc | skill, ranger, physical, crit, arrow |
| `/assets/icons/skill-rapid-fire.svg` | lorc/fast-arrow.svg | Lorc | skill, ranger, physical, channel, arrow |
| `/assets/icons/skill-fire-arrow.svg` | lorc/flaming-arrow.svg | Lorc | skill, ranger, fire, arrow |
| `/assets/icons/skill-frost-arrow.svg` | lorc/frozen-arrow.svg | Lorc | skill, ranger, frost, slow, arrow |
| `/assets/icons/skill-lightning-arrow.svg` | lorc/charged-arrow.svg | Lorc | skill, ranger, lightning, arrow |
| `/assets/icons/skill-poison-arrow.svg` | lorc/chemical-arrow.svg | Lorc | skill, ranger, poison, dot, arrow |
| `/assets/icons/skill-trap.svg` | lorc/wolf-trap.svg | Lorc | skill, ranger, trap, root |
| `/assets/icons/skill-snare-trap.svg` | lorc/mantrap.svg | Lorc | skill, ranger, trap, cc |
| `/assets/icons/skill-heal.svg` | delapouite/healing.svg | Delapouite | skill, cleric, heal, support |
| `/assets/icons/skill-renew.svg` | zeromancer/heart-plus.svg | Zeromancer | skill, cleric, heal, hot |
| `/assets/icons/skill-regeneration.svg` | sbed/regeneration.svg | Sbed | skill, cleric, heal, hot, buff |
| `/assets/icons/skill-holy-light.svg` | lorc/sunbeams.svg | Lorc | skill, cleric, holy, heal |
| `/assets/icons/skill-holy-nova.svg` | lorc/sun-radiations.svg | Lorc | skill, cleric, holy, aoe, nova |
| `/assets/icons/skill-divine-shield.svg` | lorc/energy-shield.svg | Lorc | skill, cleric, knight, holy, immune |
| `/assets/icons/skill-healing-shield.svg` | delapouite/healing-shield.svg | Delapouite | skill, cleric, holy, absorb |
| `/assets/icons/skill-consecration.svg` | lorc/holy-symbol.svg | Lorc | skill, cleric, knight, holy, ground, zone |
| `/assets/icons/skill-smite.svg` | delapouite/sun-spear.svg | Delapouite | skill, cleric, holy, projectile |
| `/assets/icons/skill-resurrect.svg` | lorc/angel-wings.svg | Lorc | skill, cleric, holy, revive |
| `/assets/icons/skill-prayer.svg` | lorc/prayer.svg | Lorc | skill, cleric, holy, buff |
| `/assets/icons/skill-holy-water.svg` | delapouite/holy-water.svg | Delapouite | skill, cleric, holy, cleanse |
| `/assets/icons/skill-summon-skeleton.svg` | skoll/raise-skeleton.svg | Skoll | skill, necromancer, summon, minion |
| `/assets/icons/skill-life-drain.svg` | lorc/bleeding-heart.svg | Lorc | skill, necromancer, shadow, leech |
| `/assets/icons/skill-curse.svg` | lorc/pentagram-rose.svg | Lorc | skill, necromancer, shadow, curse |
| `/assets/icons/skill-bone-spear.svg` | lorc/spine-arrow.svg | Lorc | skill, necromancer, physical, projectile, pierce |

### Buff (olumlu etkiler) (16)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/buff-haste.svg` | lorc/run.svg | Lorc | buff, speed, haste |
| `/assets/icons/buff-strength.svg` | lorc/muscle-up.svg | Lorc | buff, damage, strength |
| `/assets/icons/buff-defense.svg` | lorc/checked-shield.svg | Lorc | buff, armor, defense |
| `/assets/icons/buff-regen.svg` | sbed/health-increase.svg | Sbed | buff, heal, hot |
| `/assets/icons/buff-crit.svg` | lorc/on-target.svg | Lorc | buff, crit |
| `/assets/icons/buff-lifesteal.svg` | delapouite/vampire-dracula.svg | Delapouite | buff, leech, lifesteal |
| `/assets/icons/buff-absorb.svg` | delapouite/vibrating-shield.svg | Delapouite | buff, shield, absorb |
| `/assets/icons/buff-stealth.svg` | lorc/ninja-mask.svg | Lorc | buff, stealth |
| `/assets/icons/buff-mana-regen.svg` | lorc/droplets.svg | Lorc | buff, mana, regen |
| `/assets/icons/buff-aura.svg` | lorc/beams-aura.svg | Lorc | buff, aura, party |
| `/assets/icons/buff-blessing.svg` | lorc/angel-outfit.svg | Lorc | buff, holy, blessing |
| `/assets/icons/buff-thorns.svg` | lorc/thorn-helix.svg | Lorc | buff, thorns, reflect |
| `/assets/icons/buff-invulnerable.svg` | lorc/winged-shield.svg | Lorc | buff, immune, invulnerable |
| `/assets/icons/buff-reflect.svg` | lorc/shield-reflect.svg | Lorc | buff, reflect, spell |
| `/assets/icons/buff-loot.svg` | delapouite/sparkles.svg | Delapouite | buff, loot, magic-find |
| `/assets/icons/buff-xp.svg` | lorc/book-aura.svg | Lorc | buff, experience |

### Debuff (olumsuz etkiler) (18)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/debuff-stun.svg` | delapouite/knocked-out-stars.svg | Delapouite | debuff, cc, stun |
| `/assets/icons/debuff-slow.svg` | lorc/snail.svg | Lorc | debuff, cc, slow |
| `/assets/icons/debuff-poison.svg` | lorc/poison-bottle.svg | Lorc | debuff, poison, dot |
| `/assets/icons/debuff-burn.svg` | lorc/small-fire.svg | Lorc | debuff, fire, dot |
| `/assets/icons/debuff-freeze.svg` | delapouite/ice-cubes.svg | Delapouite | debuff, frost, cc, freeze |
| `/assets/icons/debuff-chill.svg` | lorc/snowflake-1.svg | Lorc | debuff, frost, slow |
| `/assets/icons/debuff-bleed.svg` | lorc/bleeding-wound.svg | Lorc | debuff, physical, dot, bleed |
| `/assets/icons/debuff-curse.svg` | lorc/cursed-star.svg | Lorc | debuff, shadow, curse |
| `/assets/icons/debuff-silence.svg` | delapouite/silenced.svg | Delapouite | debuff, cc, silence |
| `/assets/icons/debuff-root.svg` | delapouite/tree-roots.svg | Delapouite | debuff, cc, root |
| `/assets/icons/debuff-fear.svg` | lorc/terror.svg | Lorc | debuff, cc, fear |
| `/assets/icons/debuff-armor-break.svg` | lorc/broken-shield.svg | Lorc | debuff, armor, sunder |
| `/assets/icons/debuff-weakness.svg` | lorc/broken-bone.svg | Lorc | debuff, damage-down |
| `/assets/icons/debuff-blind.svg` | delapouite/blindfold.svg | Delapouite | debuff, cc, blind |
| `/assets/icons/debuff-shock.svg` | sbed/electric.svg | Sbed | debuff, lightning, shock |
| `/assets/icons/debuff-sleep.svg` | lorc/sleepy.svg | Lorc | debuff, cc, sleep |
| `/assets/icons/debuff-healing-reduction.svg` | lorc/broken-heart.svg | Lorc | debuff, anti-heal |
| `/assets/icons/debuff-marked.svg` | sbed/targeted.svg | Sbed | debuff, mark, vulnerable |

### Mythic+ affix'leri (21)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/affix-fortified.svg` | lorc/locked-fortress.svg | Lorc | affix, mythic-plus, weekly, trash |
| `/assets/icons/affix-tyrannical.svg` | lorc/crowned-skull.svg | Lorc | affix, mythic-plus, weekly, boss |
| `/assets/icons/affix-bolstering.svg` | delapouite/team-upgrade.svg | Delapouite | affix, mythic-plus, death-trigger |
| `/assets/icons/affix-raging.svg` | delapouite/enrage.svg | Delapouite | affix, mythic-plus, enrage |
| `/assets/icons/affix-sanguine.svg` | skoll/blood.svg | Skoll | affix, mythic-plus, death-trigger, pool |
| `/assets/icons/affix-bursting.svg` | lorc/burst-blob.svg | Lorc | affix, mythic-plus, death-trigger, dot |
| `/assets/icons/affix-explosive.svg` | lorc/unstable-orb.svg | Lorc | affix, mythic-plus, orb, add |
| `/assets/icons/affix-necrotic.svg` | darkzaitzev/death-juice.svg | DarkZaitzev | affix, mythic-plus, stacking, anti-heal |
| `/assets/icons/affix-volcanic.svg` | lorc/volcano.svg | Lorc | affix, mythic-plus, ground, ranged |
| `/assets/icons/affix-quaking.svg` | lorc/earth-crack.svg | Lorc | affix, mythic-plus, aoe, interrupt |
| `/assets/icons/affix-storming.svg` | lorc/tornado.svg | Lorc | affix, mythic-plus, ground, moving |
| `/assets/icons/affix-grievous.svg` | lorc/ragged-wound.svg | Lorc | affix, mythic-plus, dot, bleed |
| `/assets/icons/affix-inspiring.svg` | delapouite/inspiration.svg | Delapouite | affix, mythic-plus, aura, cc-immune |
| `/assets/icons/affix-spiteful.svg` | lorc/spectre.svg | Lorc | affix, mythic-plus, death-trigger, add |
| `/assets/icons/affix-afflicted.svg` | delapouite/plague-doctor-profile.svg | Delapouite | affix, mythic-plus, add, dispel |
| `/assets/icons/affix-incorporeal.svg` | lorc/ghost.svg | Lorc | affix, mythic-plus, add, cc |
| `/assets/icons/affix-entangling.svg` | lorc/thorny-vine.svg | Lorc | affix, mythic-plus, root, ground |
| `/assets/icons/affix-thundering.svg` | lorc/lightning-helix.svg | Lorc | affix, mythic-plus, lightning, debuff |
| `/assets/icons/affix-teeming.svg` | lorc/minions.svg | Lorc | affix, mythic-plus, trash, extra-mobs |
| `/assets/icons/affix-prideful.svg` | lorc/sharp-crown.svg | Lorc | affix, mythic-plus, seasonal, buff |
| `/assets/icons/affix-seasonal.svg` | delapouite/all-seeing-eye.svg | Delapouite | affix, mythic-plus, seasonal, void |

### Eşyalar, malzemeler, para, anahtarlar (82)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/item-helm.svg` | lorc/visored-helm.svg | Lorc | item, armor, helm, head, plate |
| `/assets/icons/item-helm-heavy.svg` | lorc/heavy-helm.svg | Lorc | item, armor, helm, head, plate |
| `/assets/icons/item-helm-horned.svg` | lorc/horned-helm.svg | Lorc | item, armor, helm, head, barbarian |
| `/assets/icons/item-hood.svg` | lorc/hood.svg | Lorc | item, armor, helm, head, cloth, leather |
| `/assets/icons/item-chest.svg` | lorc/breastplate.svg | Lorc | item, armor, chest, plate |
| `/assets/icons/item-chest-leather.svg` | lorc/leather-vest.svg | Lorc | item, armor, chest, leather |
| `/assets/icons/item-chest-cloth.svg` | lorc/robe.svg | Lorc | item, armor, chest, cloth |
| `/assets/icons/item-gloves.svg` | delapouite/gauntlet.svg | Delapouite | item, armor, hands, plate |
| `/assets/icons/item-gloves-leather.svg` | delapouite/gloves.svg | Delapouite | item, armor, hands, leather |
| `/assets/icons/item-boots.svg` | delapouite/metal-boot.svg | Delapouite | item, armor, feet, plate |
| `/assets/icons/item-boots-leather.svg` | lorc/leather-boot.svg | Lorc | item, armor, feet, leather |
| `/assets/icons/item-pants.svg` | irongamer/armored-pants.svg | Irongamer | item, armor, legs, plate |
| `/assets/icons/item-pants-cloth.svg` | lorc/trousers.svg | Lorc | item, armor, legs, cloth |
| `/assets/icons/item-shoulders.svg` | delapouite/shoulder-armor.svg | Delapouite | item, armor, shoulders, plate |
| `/assets/icons/item-shoulders-spiked.svg` | delapouite/spiked-shoulder-armor.svg | Delapouite | item, armor, shoulders |
| `/assets/icons/item-belt.svg` | lucasms/belt.svg | Lucas | item, armor, waist, belt |
| `/assets/icons/item-cape.svg` | delapouite/cape.svg | Delapouite | item, armor, back, cape |
| `/assets/icons/item-ring.svg` | delapouite/ring.svg | Delapouite | item, jewelry, ring |
| `/assets/icons/item-ring-gem.svg` | delapouite/diamond-ring.svg | Delapouite | item, jewelry, ring |
| `/assets/icons/item-ring-power.svg` | delapouite/power-ring.svg | Delapouite | item, jewelry, ring |
| `/assets/icons/item-amulet.svg` | lorc/gem-pendant.svg | Lorc | item, jewelry, amulet, neck |
| `/assets/icons/item-necklace.svg` | delapouite/emerald-necklace.svg | Delapouite | item, jewelry, amulet, neck |
| `/assets/icons/item-trinket.svg` | delapouite/glowing-artifact.svg | Delapouite | item, jewelry, trinket |
| `/assets/icons/item-sword.svg` | lorc/broadsword.svg | Lorc | item, weapon, sword, one-hand |
| `/assets/icons/item-sword-2h.svg` | delapouite/two-handed-sword.svg | Delapouite | item, weapon, sword, two-hand |
| `/assets/icons/item-sword-rune.svg` | lorc/rune-sword.svg | Lorc | item, weapon, sword, epic |
| `/assets/icons/item-axe.svg` | lorc/battle-axe.svg | Lorc | item, weapon, axe, one-hand |
| `/assets/icons/item-axe-2h.svg` | delapouite/war-axe.svg | Delapouite | item, weapon, axe, two-hand |
| `/assets/icons/item-mace.svg` | delapouite/flanged-mace.svg | Delapouite | item, weapon, mace, one-hand |
| `/assets/icons/item-mace-spiked.svg` | lorc/spiked-mace.svg | Lorc | item, weapon, mace |
| `/assets/icons/item-hammer.svg` | delapouite/warhammer.svg | Delapouite | item, weapon, hammer, two-hand |
| `/assets/icons/item-staff.svg` | lorc/wizard-staff.svg | Lorc | item, weapon, staff, two-hand, caster |
| `/assets/icons/item-staff-skull.svg` | delapouite/skull-staff.svg | Delapouite | item, weapon, staff, caster, necromancer |
| `/assets/icons/item-wand.svg` | lorc/crystal-wand.svg | Lorc | item, weapon, wand, caster |
| `/assets/icons/item-wand-orb.svg` | willdabeast/orb-wand.svg | Willdabeast | item, weapon, wand, caster |
| `/assets/icons/item-dagger.svg` | lorc/plain-dagger.svg | Lorc | item, weapon, dagger, one-hand |
| `/assets/icons/item-dagger-curved.svg` | lorc/curvy-knife.svg | Lorc | item, weapon, dagger, one-hand |
| `/assets/icons/item-bow.svg` | lorc/pocket-bow.svg | Lorc | item, weapon, bow, ranged |
| `/assets/icons/item-bow-long.svg` | delapouite/bow-arrow.svg | Delapouite | item, weapon, bow, ranged |
| `/assets/icons/item-crossbow.svg` | carl-olsen/crossbow.svg | Carl Olsen | item, weapon, crossbow, ranged |
| `/assets/icons/item-quiver.svg` | delapouite/quiver.svg | Delapouite | item, offhand, quiver, ranged |
| `/assets/icons/item-spear.svg` | lorc/barbed-spear.svg | Lorc | item, weapon, spear, two-hand |
| `/assets/icons/item-scythe.svg` | lorc/reaper-scythe.svg | Lorc | item, weapon, scythe, two-hand |
| `/assets/icons/item-shield.svg` | delapouite/templar-shield.svg | Delapouite | item, offhand, shield |
| `/assets/icons/item-shield-round.svg` | delapouite/viking-shield.svg | Delapouite | item, offhand, shield |
| `/assets/icons/item-shield-tower.svg` | delapouite/roman-shield.svg | Delapouite | item, offhand, shield |
| `/assets/icons/item-tome.svg` | delapouite/spell-book.svg | Delapouite | item, offhand, tome, caster |
| `/assets/icons/item-potion-health.svg` | delapouite/health-potion.svg | Delapouite | item, consumable, potion, health |
| `/assets/icons/item-potion-mana.svg` | delapouite/magic-potion.svg | Delapouite | item, consumable, potion, mana |
| `/assets/icons/item-potion-elixir.svg` | lorc/standing-potion.svg | Lorc | item, consumable, potion, elixir |
| `/assets/icons/item-potion-flask.svg` | lorc/round-bottom-flask.svg | Lorc | item, consumable, potion, flask |
| `/assets/icons/item-potion-orb.svg` | lorc/potion-ball.svg | Lorc | item, consumable, potion |
| `/assets/icons/item-scroll.svg` | lorc/scroll-unfurled.svg | Lorc | item, consumable, scroll |
| `/assets/icons/item-scroll-tied.svg` | lorc/tied-scroll.svg | Lorc | item, consumable, scroll, teleport |
| `/assets/icons/item-book.svg` | lorc/open-book.svg | Lorc | item, consumable, book, skill-book |
| `/assets/icons/item-gem-emerald.svg` | lorc/emerald.svg | Lorc | item, material, gem |
| `/assets/icons/item-gem-diamond.svg` | lorc/cut-diamond.svg | Lorc | item, material, gem |
| `/assets/icons/item-gems.svg` | lorc/gems.svg | Lorc | item, material, gem |
| `/assets/icons/item-gem-fire.svg` | delapouite/fire-gem.svg | Delapouite | item, material, gem, socket |
| `/assets/icons/item-crystal.svg` | lorc/crystal-cluster.svg | Lorc | item, material, crystal |
| `/assets/icons/item-crystal-shard.svg` | lorc/floating-crystal.svg | Lorc | item, material, crystal, shard |
| `/assets/icons/item-upgrade-stone.svg` | lorc/crystalize.svg | Lorc | item, material, upgrade, blacksmith |
| `/assets/icons/item-efsun-orb.svg` | lorc/crystal-ball.svg | Lorc | item, material, efsun, reroll |
| `/assets/icons/item-enchant-scroll.svg` | delapouite/scroll-quill.svg | Delapouite | item, material, efsun, enchant, scroll |
| `/assets/icons/item-ore.svg` | faithtoken/ore.svg | Faithtoken | item, material, ore |
| `/assets/icons/item-gold-nuggets.svg` | delapouite/gold-nuggets.svg | Delapouite | item, material, ore, gold |
| `/assets/icons/item-metal-bar.svg` | lorc/metal-bar.svg | Lorc | item, material, ingot |
| `/assets/icons/item-gold-bar.svg` | willdabeast/gold-bar.svg | Willdabeast | item, material, ingot, gold |
| `/assets/icons/item-gold-coins.svg` | delapouite/two-coins.svg | Delapouite | item, currency, gold |
| `/assets/icons/item-coins.svg` | delapouite/coins.svg | Delapouite | item, currency, gold |
| `/assets/icons/item-coins-pile.svg` | delapouite/coins-pile.svg | Delapouite | item, currency, gold, loot |
| `/assets/icons/item-keystone.svg` | lorc/rune-stone.svg | Lorc | item, mythic-plus, keystone |
| `/assets/icons/item-key.svg` | lorc/key.svg | Lorc | item, key |
| `/assets/icons/item-skeleton-key.svg` | lorc/skeleton-key.svg | Lorc | item, key, dungeon |
| `/assets/icons/item-boss-key.svg` | delapouite/boss-key.svg | Delapouite | item, key, boss |
| `/assets/icons/item-chest-locked.svg` | lorc/locked-chest.svg | Lorc | item, container, chest, loot |
| `/assets/icons/item-chest-open.svg` | skoll/open-treasure-chest.svg | Skoll | item, container, chest, loot |
| `/assets/icons/item-chest-plain.svg` | delapouite/chest.svg | Delapouite | item, container, chest |
| `/assets/icons/item-mimic.svg` | delapouite/mimic-chest.svg | Delapouite | item, container, chest, monster |
| `/assets/icons/item-bag.svg` | lorc/swap-bag.svg | Lorc | item, container, bag |
| `/assets/icons/item-chalice.svg` | lorc/jeweled-chalice.svg | Lorc | item, quest, treasure |
| `/assets/icons/item-junk.svg` | delapouite/broken-pottery.svg | Delapouite | item, junk, vendor |

### Sınıflar (6)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/class-knight.svg` | delapouite/black-knight-helm.svg | Delapouite | class, knight, tank |
| `/assets/icons/class-barbarian.svg` | delapouite/barbarian.svg | Delapouite | class, barbarian, melee |
| `/assets/icons/class-mage.svg` | delapouite/wizard-face.svg | Delapouite | class, mage, caster |
| `/assets/icons/class-rogue.svg` | darkzaitzev/hooded-assassin.svg | DarkZaitzev | class, rogue, melee |
| `/assets/icons/class-ranger.svg` | delapouite/archer.svg | Delapouite | class, ranger, ranged |
| `/assets/icons/class-cleric.svg` | delapouite/sun-priest.svg | Delapouite | class, cleric, healer |

### İstatistikler (20)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/stat-strength.svg` | delapouite/biceps.svg | Delapouite | stat, attribute, strength |
| `/assets/icons/stat-dexterity.svg` | lorc/feather.svg | Lorc | stat, attribute, dexterity |
| `/assets/icons/stat-intelligence.svg` | lorc/brain.svg | Lorc | stat, attribute, intelligence |
| `/assets/icons/stat-vitality.svg` | delapouite/heart-beats.svg | Delapouite | stat, attribute, vitality |
| `/assets/icons/stat-life.svg` | lorc/heart-organ.svg | Lorc | stat, life, health |
| `/assets/icons/stat-mana.svg` | sbed/water-drop.svg | Sbed | stat, mana, resource |
| `/assets/icons/stat-armor.svg` | lorc/armor-vest.svg | Lorc | stat, defense, armor |
| `/assets/icons/stat-damage.svg` | lorc/pointy-sword.svg | Lorc | stat, offense, damage |
| `/assets/icons/stat-crit.svg` | lorc/targeting.svg | Lorc | stat, offense, crit |
| `/assets/icons/stat-attack-speed.svg` | lorc/dervish-swords.svg | Lorc | stat, offense, speed |
| `/assets/icons/stat-move-speed.svg` | delapouite/running-shoe.svg | Delapouite | stat, utility, speed |
| `/assets/icons/stat-cooldown.svg` | delapouite/extra-time.svg | Delapouite | stat, utility, cooldown |
| `/assets/icons/stat-block.svg` | lorc/shield-echoes.svg | Lorc | stat, defense, block |
| `/assets/icons/stat-dodge.svg` | felbrigg/dodge.svg | Felbrigg | stat, defense, evade |
| `/assets/icons/stat-fire-resist.svg` | lorc/fire-shield.svg | Lorc | stat, resist, fire |
| `/assets/icons/stat-cold-resist.svg` | lorc/ice-shield.svg | Lorc | stat, resist, frost |
| `/assets/icons/stat-lightning-resist.svg` | lorc/lightning-shield.svg | Lorc | stat, resist, lightning |
| `/assets/icons/stat-poison-resist.svg` | lorc/biohazard.svg | Lorc | stat, resist, poison |
| `/assets/icons/stat-magic-find.svg` | lorc/crystal-eye.svg | Lorc | stat, utility, loot |
| `/assets/icons/stat-gold-find.svg` | delapouite/gold-stack.svg | Delapouite | stat, utility, gold |

### Arayüz (51)

| Dosya (URL) | Orijinal (game-icons.net) | Yazar | Etiketler / kullanım |
|---|---|---|---|
| `/assets/icons/ui-bag.svg` | delapouite/backpack.svg | Delapouite | ui, inventory, bag |
| `/assets/icons/ui-character.svg` | delapouite/character.svg | Delapouite | ui, character, equipment |
| `/assets/icons/ui-talent-tree.svg` | delapouite/skills.svg | Delapouite | ui, talents, skills |
| `/assets/icons/ui-passive-tree.svg` | delapouite/family-tree.svg | Delapouite | ui, passive-tree, talents |
| `/assets/icons/ui-spellbook.svg` | delapouite/book-cover.svg | Delapouite | ui, skills, abilities |
| `/assets/icons/ui-map.svg` | lorc/treasure-map.svg | Lorc | ui, map |
| `/assets/icons/ui-compass.svg` | lorc/compass.svg | Lorc | ui, map, minimap |
| `/assets/icons/ui-settings.svg` | lorc/cog.svg | Lorc | ui, settings, options |
| `/assets/icons/ui-gears.svg` | lorc/gears.svg | Lorc | ui, settings |
| `/assets/icons/ui-skull.svg` | lorc/skull-crossed-bones.svg | Lorc | ui, danger, death |
| `/assets/icons/ui-death.svg` | sbed/death-skull.svg | Sbed | ui, death, deaths-counter |
| `/assets/icons/ui-tombstone.svg` | lorc/tombstone.svg | Lorc | ui, death, graveyard |
| `/assets/icons/ui-crown.svg` | lorc/crown.svg | Lorc | ui, leader, party-leader |
| `/assets/icons/ui-hourglass.svg` | lorc/hourglass.svg | Lorc | ui, timer, mythic-plus |
| `/assets/icons/ui-hourglass-empty.svg` | lorc/empty-hourglass.svg | Lorc | ui, timer, depleted |
| `/assets/icons/ui-timer.svg` | lorc/stopwatch.svg | Lorc | ui, timer, mythic-plus |
| `/assets/icons/ui-party.svg` | delapouite/three-friends.svg | Delapouite | ui, party, social |
| `/assets/icons/ui-invite.svg` | delapouite/team-idea.svg | Delapouite | ui, party, invite |
| `/assets/icons/ui-trophy.svg` | lorc/trophy.svg | Lorc | ui, achievement, reward |
| `/assets/icons/ui-leaderboard.svg` | delapouite/podium-winner.svg | Delapouite | ui, leaderboard, rating |
| `/assets/icons/ui-rank-1.svg` | skoll/rank-1.svg | Skoll | ui, rank, rating |
| `/assets/icons/ui-rank-2.svg` | skoll/rank-2.svg | Skoll | ui, rank, rating |
| `/assets/icons/ui-rank-3.svg` | skoll/rank-3.svg | Skoll | ui, rank, rating |
| `/assets/icons/ui-laurels.svg` | lorc/laurels.svg | Lorc | ui, rating, mythic-plus, score |
| `/assets/icons/ui-medal.svg` | lorc/medal.svg | Lorc | ui, achievement |
| `/assets/icons/ui-star.svg` | delapouite/round-star.svg | Delapouite | ui, favorite, rarity |
| `/assets/icons/ui-key-upgrade.svg` | delapouite/star-key.svg | Delapouite | ui, mythic-plus, keystone, upgrade |
| `/assets/icons/ui-key-depleted.svg` | lorc/broken-tablet.svg | Lorc | ui, mythic-plus, keystone, depleted |
| `/assets/icons/ui-vault.svg` | delapouite/strongbox.svg | Delapouite | ui, mythic-plus, weekly-vault, reward |
| `/assets/icons/ui-lock.svg` | lorc/padlock.svg | Lorc | ui, locked |
| `/assets/icons/ui-unlock.svg` | delapouite/padlock-open.svg | Delapouite | ui, unlocked |
| `/assets/icons/ui-shop.svg` | delapouite/shop.svg | Delapouite | ui, vendor, shop |
| `/assets/icons/ui-blacksmith.svg` | delapouite/blacksmith.svg | Delapouite | ui, blacksmith, upgrade, npc |
| `/assets/icons/ui-anvil.svg` | lorc/anvil.svg | Lorc | ui, blacksmith, upgrade |
| `/assets/icons/ui-anvil-impact.svg` | lorc/anvil-impact.svg | Lorc | ui, blacksmith, upgrade, success |
| `/assets/icons/ui-upgrade-fail.svg` | lorc/shattered-sword.svg | Lorc | ui, blacksmith, upgrade, fail |
| `/assets/icons/ui-dungeon.svg` | delapouite/dungeon-gate.svg | Delapouite | ui, dungeon, mythic-plus |
| `/assets/icons/ui-portal.svg` | lorc/portal.svg | Lorc | ui, portal, teleport |
| `/assets/icons/ui-town.svg` | lorc/castle.svg | Lorc | ui, town, hub |
| `/assets/icons/ui-exit.svg` | delapouite/exit-door.svg | Delapouite | ui, exit, leave |
| `/assets/icons/ui-chat.svg` | delapouite/chat-bubble.svg | Delapouite | ui, chat, social |
| `/assets/icons/ui-speaker.svg` | delapouite/speaker.svg | Delapouite | ui, audio, sound |
| `/assets/icons/ui-speaker-off.svg` | delapouite/speaker-off.svg | Delapouite | ui, audio, mute |
| `/assets/icons/ui-check.svg` | delapouite/check-mark.svg | Delapouite | ui, confirm, ready |
| `/assets/icons/ui-cancel.svg` | sbed/cancel.svg | Sbed | ui, cancel, close |
| `/assets/icons/ui-level-up.svg` | delapouite/upgrade.svg | Delapouite | ui, level-up, progression |
| `/assets/icons/ui-boss.svg` | lorc/daemon-skull.svg | Lorc | ui, boss, enemy |
| `/assets/icons/ui-elite.svg` | lorc/horned-skull.svg | Lorc | ui, elite, enemy |
| `/assets/icons/ui-enemy-forces.svg` | lorc/crossed-swords.svg | Lorc | ui, mythic-plus, enemy-forces, combat |
| `/assets/icons/ui-quest.svg` | delapouite/checklist.svg | Delapouite | ui, quest, journal |
| `/assets/icons/ui-target.svg` | lorc/archery-target.svg | Lorc | ui, target, focus |

Ek dosya: `/assets/icons/LICENSE-game-icons.txt` (game-icons.net arşivindeki orijinal lisans/yazar listesi).

`icons.json` alanları: `name` (dosya adı, uzantısız), `path` (public URL), `sourceAuthor`, `source` (orijinal game-icons yolu), `license`, `category` (ad öneki), `tags`.

