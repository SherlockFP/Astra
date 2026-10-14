/**
 * Şaman StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. OWNER: shaman kit.
 * Shared statuses are used as they are: burn (Alev Şoku, Lav Kamçısı), shock (Toprak Şoku, Çatırdayan Yıldırım), root
 * (Toprak Bağlama Totemi), slow, empower (Yükseliş), silence (Rüzgâr Kesişi via the interrupt behaviour).
 * HoT statuses (riptide, rain_hot, stream_totem) use the `hot` rule: the magnitude is HP per second.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_SHAMAN: Partial<Record<StatusId, StatusDef>> = {
  // Hayalet Kurt (shaman_ghost_wolf): +40 % move speed for 15 s
  ghost_wolf: { id: 'ghost_wolf', name: 'Hayalet Kurt', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.4 }, dispellable: true },
  // Fırtına Bekçisi (shaman_stormkeeper, m45): 2 stacks, each Yıldırım Oku spends one (instant + empowered, procs_kit_shaman.ts)
  stormkeeper: { id: 'stormkeeper', name: 'Fırtına Bekçisi', icon: I('buff-haste'), kind: 'buff', maxStacks: 2, dispellable: true },
  // Rüzgar Silahı (Windfury, Geliştirme): a melee hit may grant the next Fırtına Vuruşu a second strike (procs_kit_shaman.ts)
  windfury: { id: 'windfury', name: 'Rüzgar Silahı', icon: I('buff-strength'), kind: 'buff', dispellable: false },
  // Lav Dalgası (Lava Surge, Elementel): a Alev Şoku cast may grant it; the next Lav Patlaması is instant (procs_kit_shaman.ts)
  lava_surge: { id: 'lava_surge', name: 'Lav Dalgası', icon: I('buff-haste'), kind: 'buff', dispellable: false },
  // Doğal Öfke (shaman_enh_unleash, m45): +30 % attack speed for 12 s
  unleash: { id: 'unleash', name: 'Doğal Öfke', icon: I('buff-strength'), kind: 'buff', stats: { attackSpeed: 0.3 }, dispellable: true },
  // Kan Coşkusu (shaman_bloodlust, party): +30 % attack speed and +20 % move speed for 30 s
  bloodlust: { id: 'bloodlust', name: 'Kan Coşkusu', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.3, moveSpeedPct: 0.2 }, dispellable: true },
  // Doğa Çabukluğu (shaman_nature_swiftness, m45): cast speed +100 % for 8 s
  swiftness: { id: 'swiftness', name: 'Doğa Çabukluğu', icon: I('buff-haste'), kind: 'buff', stats: { castSpeed: 1.0 }, dispellable: true },
  // Gel-Git Dalgası (shaman_riptide): HoT on the ally, 15 s
  riptide: { id: 'riptide', name: 'Gel-Git Dalgası', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop', dispellable: true },
  // Yağmur Fırtınası (shaman_healing_rain): HoT on each ally inside the rain, 8 s
  rain_hot: { id: 'rain_hot', name: 'Yağmur', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop', dispellable: true },
  // Astral Kayma (shaman_astral_shift, s3): 40 % damage reduction for 8 s
  astral_shift: { id: 'astral_shift', name: 'Astral Kayma', icon: I('buff-absorb'), kind: 'buff', stats: { damageReductionPct: 0.4 }, dispellable: false },
  // Lanet (shaman_hex): hard incapacitate for 6 s (a frog)
  hex: { id: 'hex', name: 'Lanet', icon: I('debuff-silence'), kind: 'debuff', cc: true, dispellable: true },
  // Şifa Akıntısı (shaman_stream_totem, shaman_tide_totem): HoT on allies inside the totem's radius
  stream_totem: { id: 'stream_totem', name: 'Şifa Akıntısı', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop', dispellable: true },
};

export const STATUS_RULES_KIT_SHAMAN: Partial<Record<StatusId, StatusRule>> = {
  ghost_wolf: { stack: 'refresh' },
  stormkeeper: { stack: 'stack' },
  windfury: { stack: 'refresh' },
  lava_surge: { stack: 'refresh' },
  unleash: { stack: 'refresh' },
  bloodlust: { stack: 'refresh' },
  swiftness: { stack: 'refresh' },
  riptide: { stack: 'refresh', hot: true },
  rain_hot: { stack: 'refresh', hot: true },
  stream_totem: { stack: 'refresh', hot: true },
  astral_shift: { stack: 'refresh' },
  hex: { stack: 'strongest', group: 'hard', hard: true },
};
