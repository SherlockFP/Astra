import type { ClassId } from '../types/common';
import type { TownNpcRole } from '../types/dungeons';
import type { FamilyId } from '../types/v2';

/**
 * Karakter sözleri (barks) text. OWNER: content module. Read by systems/Barks.ts.
 * Rules: short Turkish, epic-fantasy tone, at most 70 characters per line, no slang and no jokes at the player's expense.
 * `{name}` = zone / dungeon name, `{family}` = creature family name. Every trigger has 6 to 8 variants.
 */

export type BarkTrigger =
  | 'levelup' | 'zone' | 'dungeon' | 'loot_rare' | 'loot_epic' | 'boss_kill' | 'family' | 'low_hp' | 'resurrect'
  | 'quest_done' | 'achievement' | 'idle_town' | 'mount' | 'pvp_zone' | 'arena_win';

/** The local player's own lines (speech bubble over the player + Söylenti chat line). */
export const PLAYER_LINES: Record<BarkTrigger, string[]> = {
  levelup: [
    'Bu yol bana yeni bir nefes verdi. Daha uzağa gidebilirim.',
    'Bileğim güçlendi, gözüm açıldı. Yolculuk sürüyor.',
    'Her seviye bir kapı. Bugün bir tanesini daha araladım.',
    'Kanım ısındı, adım ağırlaştı. Efsane biraz beklesin.',
    'Yıllar sonra bu günü anlatacağım. Şimdilik yürüyorum.',
    'Yükseldim. Ama zirve hâlâ çok uzakta görünüyor.',
    'Sınanmış çelik gibi güçlendim. Eğilmedim, kırılmadım.',
  ],
  zone: [
    '{name}. Havası başka. Burada yüzyıllar sessizce bekledi.',
    '{name} burada. Rüzgâr bile yabancı esiyor.',
    'Bu topraklar yabancıyı sevmez. Adımlarımı dikkatli atacağım.',
    '{name}. Haritanın boş bir köşesiydi. Artık değil.',
    'Buraya ilk kez ayak basıyorum. {name} sırlarını saklıyor.',
    '{name}. Duvarlarında unutulmuş adların izi var.',
    'Sessizlik burada da sürüyor, ama başka bir sessizlik bu.',
  ],
  dungeon: [
    '{name} kapısı ardında ne bekliyor, bilmiyorum. Öğreneceğim.',
    'Karanlık bu kez bana bakıyor. {name}, hazırım.',
    '{name}. Derinlerde biri uyanıyor olabilir.',
    'Taşlar bile nefes almıyor burada. {name} beni sınayacak.',
    'Kapı ağır açıldı. {name} içeri çağırıyor.',
    'Bu zindana girenler çıkmaz derler. Yine de giriyorum.',
    '{name} mahzeni adını hak ediyor. Silahımı sıkı tutacağım.',
  ],
  loot_rare: [
    'Nadir bir parıltı. Bu eşya gerçekten bana ait.',
    'Göz kamaştırmıyor ama sağlam. Bu iş bana yarar.',
    'Toprağın altından çıkan bu eşya bir hikâye taşıyor.',
    'Hazine kendini gösterdi. Şimdi onu hak etmeye bakarım.',
    'Nadir olanı bulmak için her taşı kaldırmaya değer.',
    'Bu parlaklık boşuna değil. Bir gün işime yarayacak.',
  ],
  loot_epic: [
    'Destansı bir eşya! Ellerim hâlâ titriyor.',
    'Bu çelik bir türküye konu olur. Yakında bilinecek.',
    'Kadim bir usta bunu dövmüş. Her çizgisi bir sır.',
    'Efsanenin kıyısından bir parça kopardım.',
    'Bu ganimet, bu yolun bedelini fazlasıyla ödedi.',
    'Bu parıltı bir kaderin işareti olabilir.',
    'Destansı! Buna layık bir gövde bulmam gerek.',
  ],
  boss_kill: [
    'Devrildi. Sessizlik çöktü, ama bunu kazandım.',
    'Bu karanlığın hükmü bitti. Dinlenmek için bir an var.',
    'Dev bile yere serilir. Bu gece kadehler kalkacak.',
    'Son darbe indi. Yankısı uzun süre kulaklarımda kalacak.',
    'Efsaneler böyle biter: bir canavar düşer, bir ad yazılır.',
    'Bu zafer kolay gelmedi. Yaraların bunu hatırlatacak.',
    'Yerdeki gölge son nefesini verdi. Yolumuz açık.',
  ],
  family: [
    'Yeni tanıdığım bir tür: {family}. Her düşman bir ders.',
    'Bu {family} sanki başka bir kökten. Notlarıma ekliyorum.',
    'Bu {family} ile ilk karşılaşmam. Kolay olmayacak belli.',
    'Demek {family} de buradaymış. Gözümü açık tutacağım.',
    'Yeni bir tür, yeni bir sır. Bu {family} tanınmalı.',
    'Bu {family} düştü. Kıvrımlarını ve huylarını öğrendim.',
  ],
  low_hp: [
    'Kan kaybediyorum. Bir nefes daha, sonra yeniden.',
    'Dizlerim titriyor. Dayanmak zorundayım.',
    'Bu kadar yakın olmak tehlikeli. Geri çekilmeliyim.',
    'Ölüm kapıda. Ama bugün kapıyı bana açmayacak.',
    'Yaram derin. Toparlanmak için bir fırsat lazım.',
    'Kalbim hızlanıyor, gözüm bulanıyor. Sakin ol.',
  ],
  resurrect: [
    'Karanlık geri çekildi. Yeniden ayaktayım.',
    'Bir kez daha döndüm. Bu yol kolay olmadı.',
    'Ölüm beni bu kez de tutamadı.',
    'Işık yüzüme vurdu. Silahımı yeniden kaldırıyorum.',
    'Ruh bedenime döndü. Kaldığım yerden devam.',
    'Toprak sıcak, nefesim tazelendi. Hadi, yine.',
  ],
  quest_done: [
    'Görev tamam. Sözünü tutan biri olarak dönüyorum.',
    'Bu iş bitti. Şimdi haberi götürme zamanı.',
    'Söz verdim, yerine getirdim. Hesap kapandı.',
    'Dağınık parçalar bir araya geldi. Görev tamam.',
    'Yolun sonunda bir ödül var. Hak ettim sanırım.',
    'İz sürmek zordu ama sonunda vardım.',
  ],
  achievement: [
    'Bu ad artık defterde. Unutulmayacak bir iz.',
    'Kayıtlara geçti. Bir kulvar daha tamam.',
    'Hangi yoldan geldiysem, sonunda bu da oldu.',
    'Kazındı bu başarı. Şimdi bir sonrakine bakıyorum.',
    'Sabır meyvesini verdi. Bunu kendime söylüyorum.',
    'Bu başarı bir hikâyenin satırı. Devamı var.',
  ],
  idle_town: [
    'Bir an durup nefes almak da savaşın parçası.',
    'Gökyüzü uzun süre aynı kaldı. Ben de öyle.',
    'Şehrin uğultusu bazen bir ninni gibi.',
    'Kılıcı kınına koy, bir dakika düşüneyim.',
    'Burada zaman başka akıyor. Acele etmeyeceğim.',
    'Kuzgunkale\'nin çanları uzakta çalıyor.',
    'Bir bardak sıcak içecek, bir sessizlik. Yeter bu kadar.',
  ],
  mount: [
    'Ayaklarım yorulmadan yol almak da bir nimet.',
    'Nal sesi yolu açıyor. Yürümek geçmişte kaldı.',
    'Eyerdeyim, rüzgâr yüzüme vuruyor.',
    'Yol uzun ama yoldaşım sabırlı. Hadi gidelim.',
    'Ufuk bana doğru kayıyor. Bu hız iyi geliyor.',
    'Bu yoldaş bana tuhaf bir güven veriyor.',
  ],
  pvp_zone: [
    'Bu topraklarda kılıçlar konuşur. Dikkatli ol.',
    'Burası savaş alanı. Kimse kimsenin dostu değil.',
    'Pusuya düşmemek için gözlerimi dört açacağım.',
    'Sınır geçildi. Artık herkes hedef olabilir.',
    'Bu bölgede onur kazanılır ya da kaybedilir.',
    'Kan kokusu geliyor. Tetikte kalmak zorundayım.',
  ],
  arena_win: [
    'Arenada son çan çaldı. Zafer bizim.',
    'Kalabalık ayağa kalktı. Bu galibiyet konuşulacak.',
    'Kılıçlar sustu. Kazanan biziz.',
    'Rakiplerimizin sessizliği en güzel alkıştı.',
    'Toz dindi, onur kaldı. İyi bir maçtı.',
    'Bu meydanda bir gün daha yaşadık ve kazandık.',
  ],
};

/**
 * Class flavour: the same trigger picks from the class pool when one exists (else PLAYER_LINES).
 * Paladin = holy (Nur), Warlock = dark (gölge, ruh), Rogue = witty, Druid = nature.
 */
export const CLASS_LINES: Partial<Record<ClassId, Partial<Record<BarkTrigger, string[]>>>> = {
  paladin: {
    levelup: [
      'Nur bana yeni bir yemin verdi. Onu bozmayacağım.',
      'Kutsal ateş daha parlak yanıyor. Yolum aydınlık.',
      'Işık bu kez de yolumu gösterdi. Yükseliyorum.',
      'Kalkanım sağlam, kalbim daha da sağlam.',
      'Her seviye bir dua, her dua bir adım.',
      'Göklerden bir fısıltı geldi: devam et.',
    ],
    boss_kill: [
      'Karanlık diz çöktü. Işık yine kazandı.',
      'Bu zafer, düşenlerin anısına kutsanmalı.',
      'Nur bu gece yeniden galip geldi.',
      'Adalet tecelli etti. Şimdi dualar zamanı.',
      'Canavar sustu. Kutsal bir sessizlik çöktü.',
      'Güç bize verildi, biz de hakkını verdik.',
    ],
    low_hp: [
      'Işık, bu son kıvılcımı koru. Dayanacağım.',
      'Yaralarım yanıyor ama inancım sönmedi.',
      'Kutsal ateş beni ayakta tutuyor. Bir adım daha.',
      'Ey Nur, bana bir fırsat daha ver.',
      'Kalkanım çatladı. İnancım henüz çatlamadı.',
      'Bu kadar yakın mı? Hayır, daha işim var.',
    ],
  },
  warlock: {
    levelup: [
      'Karanlık bana yeni bir fısıltı öğretti. Dinliyorum.',
      'Ruhumdaki gölge büyüdü. Bu güç bana ait.',
      'Her seviye, bir mühürün daha kırılması demek.',
      'Cehennem ateşi damarlarımda bir derece ısındı.',
      'Büyü kitabı kendiliğinden açıldı. Yeni bir söz öğrendim.',
      'Güç yükseldi, vicdan azaldı. Hesap sonra.',
    ],
    boss_kill: [
      'Ruhu yuttum. Bedeni de yakında toz olacak.',
      'Karanlık benim kadehimde. Kurban kabul edildi.',
      'Bu ruh artık benim. Ne tatlı bir ganimet.',
      'Sessizlik çöktü. Gölgeler zaferi fısıldıyor.',
      'Bir dev daha düştü. Mezar taşını ona göre yontun.',
      'Mühür kırıldı, öfke sustu. Sıra dağılan gölgelerde.',
    ],
    low_hp: [
      'Kanım azalıyor, ama gölgeler hâlâ benimle.',
      'Bu acı bile bana bir şey fısıldıyor. Dayan.',
      'Ruhum bu kez ucuza kurtulmadı. Nefes al.',
      'Cehennem kapısı aralandı, ama henüz geçmedim.',
      'Yara derin. Yine de büyüm bitmedi.',
      'Karanlığın kucağına düşmeden bir hamle yapmalıyım.',
    ],
  },
  rogue: {
    levelup: [
      'Seviye atladım. Artık pahalı zevklere de hakkım var.',
      'Yükseldim! Şimdi kimse beni hafife almaz. Belki.',
      'Bu gelişme gizli kalsın. Kimse öğrenmesin, lütfen.',
      'Kılıcımın keskinliği arttı, sözlerimin de.',
      'Yeni bir seviye, yeni bir yalan için bahane.',
      'Bir seviye daha. Gölgelerde bunu kimse fark etmedi.',
    ],
    boss_kill: [
      'Ağır bir bedel, ağır bir ödeme. Hesap kapandı.',
      'Dev düştü ve sırtını bana bıraktı. Ne nazik.',
      'Bu iş fazla büyüktü, tabii ki ben yine de yaptım.',
      'Zor bir gece, kolay bir hesap. Güzel.',
      'Bu kadar gürültüyle düşen bir canavar nadirdir.',
      'Ödül kimin, bilmiyorum; ama kesesi bana yakın.',
    ],
    low_hp: [
      'Hata. Kocaman bir hata. Şimdi çıkmalıyım buradan.',
      'Bu sefer şansım kıl payı kurtuldu.',
      'Biraz daha dayanırsam bunu hikâyeye yazarım.',
      'Kanama durmazsa plan B devreye girsin.',
      'Nefes alamıyorum, ama gülümsemeyi unutmadım.',
      'Kaçmak da bir sanattır. Bu gece sanatçıyım.',
    ],
  },
  druid: {
    levelup: [
      'Kök salıyorum, yaprak açıyorum. Yeni bir mevsim bu.',
      'Toprak beni daha güçlü bir ağaç olmaya çağırdı.',
      'Ormanın kalbi bir kez daha attı. Ben de yükseldim.',
      'Rüzgâr yapraklarımı okşadı, yeni bir bilgi taşıdı.',
      'Dal ne kadar uzanırsa kök o kadar derine iner.',
      'Doğa sabırlıdır. Ben de sabrı öğreniyorum.',
    ],
    boss_kill: [
      'Yaban dünya bu zaferi fısıldıyor. Yapraklar titriyor.',
      'Kadim ağaç sustu, ormanın nefesi yerine geldi.',
      'Canavar toprağa döndü. Toprak bunu unutmaz.',
      'Vahşi kuvvetler sakinleşti. Ağaçlar yine bizimle.',
      'Doğanın dengesi bozulmuştu. Şimdi yerine oturdu.',
      'Bu yenilgi kökleri besleyecek. Büyüme sırası bende.',
    ],
    low_hp: [
      'Kabuğum çatladı ama köküm sağlam. Toparlanacağım.',
      'Doğa beni tutuyor. Biraz daha dayan, ağaç.',
      'Yaprakları kopan bir dal gibiyim, yine de dikim.',
      'Vahşi ruh uyanıyor. Canım yanıyor ama çekilmem.',
      'Toprak sıcak. Nefesimi bulana kadar bir adım geri.',
      'Rüzgâr yönünü değiştirdi. Dikkat etmek lazım.',
    ],
  },
};

/** Role greetings: an NPC with no lines of its own greets the walking player with one of these (NPC.ts walk-by). */
export const ROLE_LINES: Partial<Record<TownNpcRole, string[]>> = {
  quest: [
    'Yardıma ihtiyacım var. Dinlersen sana bir iş var.',
    'Gel, yaklaş. Duvarların da kulağı var.',
    'Bir iş bekliyor. Kimin yapacağı henüz belli değil.',
    'Yolun açık olsun. Dönünce yine konuşuruz.',
    'Kayıp bir eşya, bir ödül. Hangisi ilgini çeker?',
    'Sözünü tutan birine iş vermeyi severim.',
  ],
  portal: [
    'Kapılar açık. Yalnızca hazır olanlar geçsin.',
    'Kadim işaretler titriyor. Yakında bir yol açılacak.',
    'Portal kararlı. Peki sen kararlı mısın?',
    'Bu kapı geri dönüşü olmayan yolları bilir.',
    'Kapının ardı sessiz. Ama sıcak bir bekleyiş bu.',
    'Dönüşü olan yolculuklar seçilmiş olanlara ait.',
  ],
  teleporter: [
    'Nereye gitmek istersin? Yol kısa, ama bedeli var.',
    'Haritanın kıvrımlarını bilirim. Bana bir yer söyle.',
    'Işık çemberi hazır. Adını söyle, seni götüreyim.',
    'Her yol bir hikâye, her hikâye bir bedel.',
    'Bekle, yol açılıyor. Kıpırdamadan dur.',
    'Kısa yollar bile sabır ister.',
  ],
  stable: [
    'Atlar huzursuz, ama sana güveniyorlar. Bin de gör.',
    'Eyerini sık, yol uzun.',
    'Bu hayvanlar uzun yolları sever. Kısa yolu sen seç.',
    'Nal sesi bu ahırda hiç susmaz.',
    'Yorgun atı bırakma. Sana da gerekecek.',
    'Bir at, bir yoldaş. İkisini de iyi seç.',
  ],
  codex: [
    'Kayıtlarımda eski bir isim var. Okumak ister misin?',
    'Mürekkep kurumadan bir not düş.',
    'Her sayfa bir sır taşır, her sır bir bedel.',
    'Kitap sessiz ama bilgisi çok. Sorular sor.',
    'Burada geçmişin tozu birikiyor. Dikkatli oku.',
    'Yazılmamış bir hikâye, sahibini bekliyor.',
  ],
  tierset: [
    'Parçaları bir araya getir, bütünün gücünü gör.',
    'Set bir kardeşlik gibidir. Eksik parça zayıflatır.',
    'Bu zırhın her parçası ayrı bir hikâye anlatır.',
    'Uyum ustalık ister. Acele etme.',
    'Tamamlanan bir set, bir yeminin karşılığıdır.',
    'Parçalar dağınık. Birlikte daha güçlü olacaklar.',
  ],
  crafting: [
    'Malzemeni getir, gerisini ocak halleder.',
    'Bu iş sabır ister. Çekiç acele etmez.',
    'Taş ve demir, ustanın elinde konuşur.',
    'Her zanaat bir öğrenme. Bugün ne öğreneceksin?',
    'Tezgâh boş değil. Hadi, bir şeyler yapalım.',
    'Kötü malzeme iyi eseri öldürür. Dikkat et.',
  ],
  home: [
    'Bir ev, bir ocak, bir pencere. Hepsi senin olabilir.',
    'Kapılar kapanmadan karar ver. Ev dolmak üzere.',
    'Ocağı yanan bir ev sana sıcak bir yer olur.',
    'Bahçem açık. Uykuya dalmak için iyi bir yer.',
    'Her duvar bir anıyı saklar. Kendininkini yaz.',
    'Yolun sonunda dönmek isteyeceğin bir yer olsun.',
  ],
  pvp: [
    'Meydanda onur kazanılır. Kılıcını sağlam tut.',
    'Rakibini tanı, zayıflığını bul. Sonra vur.',
    'Savaş alanı acımaz, ama adil olmayı bilir.',
    'Gerçek savaşçılar meydanda sınanır.',
    'Her kılıç bir hikâye, her yenilgi bir ders.',
    'Onur, kazananın değil sınanan cesaretin.',
  ],
  lobby: [
    'Burada herkes bir yolculuğa hazırlanır. Sen de hazırlan.',
    'Yeni yüzler gelir, yeni dostlar bulunur.',
    'Buluşma meydanı kalabalık. Bir yoldaş bul.',
    'Kimse yalnız yürümek zorunda değil.',
    'Sıcak bir ocak, sıcak bir sohbet. Hoş geldin.',
    'Grup kurmak istersen tanıdık bir yüz bulabilirsin.',
  ],
};

/** An elite or mini-boss with no lines of its own: its aggro line (bubble over the enemy + Söylenti). */
export const ENEMY_AGGRO_LINES: string[] = [
  'Bu yolda yürüyen herkes sonunda buraya gelir.',
  'Beni görmüş olman, son göreceğin şey olacak.',
  'Kılıcını çek, yoksa seni yerden toplayamam.',
  'Sessizliği bozdun. Bedeli ağır olacak.',
  'Buraya ait değilsin, yabancı. Yine de bekliyorum.',
  'Bu topraklar benim. Her adımın hesabı var.',
  'Hadi, bakalım kemiklerin ne kadar dayanacak.',
];

/** Named rares (enemy ids rare_*) with their own aggro bark; the others use ENEMY_AGGRO_LINES. */
export const RARE_AGGRO_LINES: Partial<Record<string, string[]>> = {
  rare_gumus_yele: ['Gümüş dişlerim sana doğru!', 'Vadinin gümüşü benim, sıra sende.', 'Kokunu aldım, avcı.'],
};

/** Death line of an elite or mini-boss killed by the local player (Söylenti chat line). */
export const ENEMY_DEATH_LINES: string[] = [
  'Bu kadar mı? Yazık.',
  'Karanlık beni çağırıyor. Hoşça kal, yabancı.',
  'Toprağa dönüyorum. Ardımdan kimse ağlamasın.',
  'Kılıcım yere düştü, ama adım burada kalacak.',
  'Bu sefer kazanan sen. Ama sıra sende de.',
  'Son nefesim bile sana bir uyarı. Dikkatli ol.',
];

/** Display names used by the family line. */
export const FAMILY_NAMES: Partial<Record<FamilyId, string>> = {
  beast: 'vahşi yaratık',
  undead_bone: 'kemik yığını',
  undead_flesh: 'çürümüş et',
  ghost: 'hayalet',
  insect: 'böcek sürüsü',
  slime: 'balçık',
  fungus: 'mantar',
  humanoid: 'insan kılıklı',
  cultist: 'tarikat üyesi',
  golem: 'taş dev',
  demon: 'şeytan',
  elemental_fire: 'ateş ruhu',
  elemental_frost: 'buz ruhu',
  dragon: 'ejderha',
};
