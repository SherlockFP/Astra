/**
 * Baked credits (source of truth: docs/assets/credits-*.md). CC-BY attributions are MANDATORY and live in
 * entries flagged `required: true` (they get a gold marker in the credits screen).
 * To add a pack: append an entry to the right section (or push a new section at the end).
 */
export interface CreditEntry {
  /** Work / pack name. */
  title: string;
  /** Author(s). */
  by: string;
  licence: string;
  note?: string;
  /** Licence demands attribution (CC BY and similar). */
  required?: boolean;
}

export interface CreditSection {
  title: string;
  icon: string;
  intro?: string;
  entries: CreditEntry[];
  /** Verbatim attribution paragraph (shown in an inset box). */
  attribution?: string;
}

export const CREDITS: CreditSection[] = [
  {
    title: 'Oyun',
    icon: '/assets/icons/ui-crown.svg',
    entries: [
      { title: 'Efsun Online: Kadim Zindanlar', by: 'Efsun Online ekibi', licence: 'Tasarım, kod, 3B üretim ve ses entegrasyonu', note: 'Bu oyun tarayıcıda çalışan açık web teknolojileriyle yapılmıştır.' },
      { title: 'three.js', by: 'mrdoob ve katkıda bulunanlar', licence: 'MIT' },
      { title: 'Vite', by: 'Evan You ve Vite ekibi', licence: 'MIT' },
      { title: 'TypeScript', by: 'Microsoft', licence: 'Apache-2.0' },
      { title: 'Trystero (WebRTC eşler arası ağ)', by: 'Dan Kantor', licence: 'MIT' },
      { title: 'Cinzel ve Cinzel Decorative yazı tipleri', by: 'Natanael Gama', licence: 'SIL OFL 1.1' },
      { title: 'Alegreya Sans yazı tipi', by: 'Juan Pablo del Peral (Huerta Tipográfica)', licence: 'SIL OFL 1.1' },
    ],
  },
  {
    title: '3B Karakterler ve Canavarlar',
    icon: '/assets/icons/class-knight.svg',
    entries: [
      { title: 'KayKit Character Pack: Adventurers 1.0', by: 'Kay Lousberg (kaylousberg.com)', licence: 'CC0 1.0' },
      { title: 'KayKit Character Pack: Skeletons 1.0', by: 'Kay Lousberg (kaylousberg.com)', licence: 'CC0 1.0' },
      { title: 'Canavar ve NPC modelleri (Slime, Goblin, Orc, Yeti, Ejderha, Kral, İşçi ve diğerleri)', by: 'Quaternius (quaternius.com), Poly Pizza aracılığıyla', licence: 'CC0 1.0' },
    ],
  },
  {
    title: 'Çevre ve Zindan Modelleri',
    icon: '/assets/icons/ui-dungeon.svg',
    entries: [
      { title: 'KayKit Dungeon Remastered 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0' },
      { title: 'KayKit Halloween Bits 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0' },
      { title: 'KayKit Furniture Bits 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0' },
      { title: 'KayKit Medieval Hexagon Pack 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0' },
      { title: 'KayKit Fantasy Weapons Bits 1.0', by: 'Kay Lousberg', licence: 'CC0 1.0' },
      { title: 'Fantasy Town Kit, Castle Kit, Graveyard Kit, Survival Kit, Nature Kit', by: 'Kenney (kenney.nl)', licence: 'CC0 1.0' },
      { title: 'PSX Dungeon', by: 'Goblinatron (goblinatron.itch.io/psx-dungeon)', licence: 'CC BY 4.0', required: true, note: 'Atıf zorunludur. Lisans: creativecommons.org/licenses/by/4.0' },
      { title: 'PSX Style: Going Medieval', by: 'valsekamerplant (itch.io)', licence: 'CC0 1.0' },
      { title: 'PSX Style: Walls & Fences', by: 'valsekamerplant (itch.io)', licence: 'CC0 1.0' },
      { title: 'PSX Fantasy Pack: Nocturnal Watch', by: 'toboas (itch.io)', licence: 'CC0 1.0' },
      { title: 'Retro PSX Nature Pack (ağaç, çalı ve çimen)', by: 'Elegant Crow (itch.io)', licence: 'CC0 1.0' },
      { title: 'Retro PSX Tree Pack', by: 'itch.io (yazar belirtilmemiş)', licence: 'CC0 1.0' },
    ],
    attribution: 'Zindan modülleri: "PSX Dungeon" - Goblinatron (https://goblinatron.itch.io/psx-dungeon) - CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
  },
  {
    title: 'Gökyüzü ve Dokular',
    icon: '/assets/icons/ui-compass.svg',
    entries: [
      { title: 'PSX Skyboxes Free', by: 'heyheythere (heyheythere.itch.io/psx-skyboxes-free)', licence: 'CC BY 4.0', required: true, note: 'Atıf zorunludur. Lisans: creativecommons.org/licenses/by/4.0' },
      { title: 'Cloudy Skyboxes - Panorama', by: 'Screaming Brain Studios (itch.io)', licence: 'CC0 1.0' },
      { title: 'Tiny Texture Pack 1, 2 ve 3', by: 'Screaming Brain Studios (itch.io)', licence: 'CC0 1.0' },
    ],
    attribution: '"PSX Skyboxes Free" by heyheythere - https://heyheythere.itch.io/psx-skyboxes-free - CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
  },
  {
    title: 'Özgün Üretimler',
    icon: '/assets/icons/ui-anvil.svg',
    entries: [
      { title: 'Silahlar, yaratıklar, patronlar ve sahne nesneleri (PSX stili)', by: 'Efsun Online ekibi, Blender ile', licence: 'Özgün çalışma' },
      { title: 'Yükleme ışını ve uyarı dairesi dokuları', by: 'Efsun Online ekibi (prosedürel)', licence: 'CC0 1.0' },
    ],
  },
  {
    title: 'Arayüz ve Görsel Efektler',
    icon: '/assets/icons/ui-gears.svg',
    entries: [
      { title: 'Particle Pack 1.1', by: 'Kenney (kenney.nl)', licence: 'CC0 1.0' },
      { title: 'Fantasy UI Borders 1.0', by: 'Kenney (kenney.nl)', licence: 'CC0 1.0' },
      { title: 'UI Pack: RPG Expansion', by: 'Kenney (kenney.nl)', licence: 'CC0 1.0' },
      { title: 'Brackeys VFX Bundle', by: 'Brackeys; Picster, Kenney, Thomas Iché, CodeManu', licence: 'CC0 1.0' },
      { title: 'Super Pixel Effects Gigapack', by: 'Will Tice / unTied Games', licence: 'unTied Games lisansı (atıf zorunlu)', required: true, note: 'untiedgames.com/files/license.txt' },
      { title: 'Skill Icon Pack 4.0', by: 'Wenrexa (itch.io)', licence: 'CC0 1.0' },
    ],
    attribution: 'Piksel efektleri: Super Pixel Effects Gigapack - Will Tice / unTied Games (untiedgames.com).',
  },
  {
    title: 'İkonlar',
    icon: '/assets/icons/ui-spellbook.svg',
    intro: 'Oyundaki beceri, eşya, durum ve arayüz ikonlarının büyük bölümü game-icons.net kaynaklıdır.',
    entries: [
      { title: 'game-icons.net', by: 'Lorc, Delapouite, Andy Meneely, Carl Olsen, DarkZaitzev, Faithtoken, Felbrigg, Irongamer, Lucas, Sbed, Skoll, Willdabeast', licence: 'CC BY 3.0', required: true, note: 'Zeromancer ikonları CC0 1.0. Arka plan kareleri kaldırılmıştır.' },
    ],
    attribution:
      'İkonlar: Andy Meneely, Carl Olsen, DarkZaitzev, Delapouite, Faithtoken, Felbrigg, Irongamer, Lorc, Lucas, Sbed, Skoll, Willdabeast, Zeromancer tarafından yapılmıştır; game-icons.net, CC BY 3.0 lisansı ile (arka planlar kaldırıldı). ' +
      'Icons made by Andy Meneely, Carl Olsen, DarkZaitzev, Delapouite, Faithtoken, Felbrigg, Irongamer, Lorc, Lucas, Sbed, Skoll, Willdabeast, Zeromancer from game-icons.net, licensed under CC BY 3.0 (backgrounds removed).',
  },
  {
    title: 'Müzik',
    icon: '/assets/icons/ui-speaker.svg',
    entries: [
      { title: '"The Fall of Arcana" ve "Colossal Boss Battle Theme"', by: 'Matthew Pablo (matthewpablo.com)', licence: 'CC BY 3.0', required: true },
      { title: '"Rise of Spirit"', by: 'Alexandr Zhelanov', licence: 'CC BY 3.0', required: true },
      { title: '"Cold Sanctuary" ve "Heated Lands"', by: 'Jonathan Shaw (www.jshaw.co.uk)', licence: 'CC BY 3.0', required: true },
      { title: 'Şehir, zindan ve savaş müzikleri', by: 'RandomMind, cynicmusic, Juhani Junkala (SubspaceAudio), Spring Spring, yd, HaelDB, qubodup, Kresiek The Furry', licence: 'CC0 1.0' },
    ],
    attribution:
      '"The Fall of Arcana" ve "Colossal Boss Battle Theme": Matthew Pablo (http://www.matthewpablo.com), CC BY 3.0. "Rise of Spirit": Alexandr Zhelanov (opengameart.org/content/rise-of-spirit), CC BY 3.0. ' +
      '"Cold Sanctuary" ve "Heated Lands": Jonathan Shaw (www.jshaw.co.uk), CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).',
  },
  {
    title: 'Ses Efektleri ve Sesler',
    icon: '/assets/icons/ui-speaker.svg',
    entries: [
      { title: '"8 Magic Attacks" ve "8 Heals and Buffs SFX"', by: 'Leohpaz (opengameart.org)', licence: 'CC BY 4.0', required: true },
      { title: '"Fire Loop" ve "Shimmer glitter magic"', by: 'qubodup (Iwan Gabovitch)', licence: 'CC BY 3.0', required: true },
      { title: 'RPG Audio, Impact Sounds, Interface Sounds, UI Audio, Music Jingles', by: 'Kenney (kenney.nl)', licence: 'CC0 1.0' },
      { title: 'Çeşitli RPG, yaratık, kılıç ve büyü efekt paketleri', by: 'rubberduck, artisticdude, StarNinjas, JaggedStone, remaxim, wobbleboxx, Ogrebane, SketchMan3', licence: 'CC0 1.0' },
      { title: 'Basic Spell Impacts ve Healing Spell Impacts', by: 'Lentikula (itch.io)', licence: 'CC0 1.0' },
      { title: 'Warrior, Mage ve Orc Voice Pack', by: 'John Carroll (@jhncrrll_)', licence: 'CC0 1.0' },
    ],
    attribution:
      '"8 Magic Attacks" ve "8 Heals and Buffs SFX": Leohpaz (opengameart.org), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). ' +
      '"Fire Loop" ve "Shimmer glitter magic": qubodup (Iwan Gabovitch, opengameart.org), CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).',
  },
];

export const CREDITS_THANKS = 'Ve bu oyunu oynayan, zindanlarda birlikte savaşan herkese teşekkürler.';
