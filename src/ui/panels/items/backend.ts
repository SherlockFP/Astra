import * as Vendor from '../../../systems/Vendor';
import * as Upgrade from '../../../systems/Upgrade';
import { describeItem } from '../../../systems/ItemGen';

/**
 * Thin indirection over the systems this module talks to (items module: ItemGen / Vendor / Upgrade).
 * Production code never touches these objects directly; the dev page (dev/panels-items.html) may replace members
 * with mocks to force outcomes (e.g. an always-failing upgrade) when testing the animations.
 */
export const itemApi = {
  describe: describeItem,
};

export const vendorApi = {
  entries: Vendor.vendorEntries,
  buy: Vendor.buy,
  sell: Vendor.sell,
  sellMaterial: Vendor.sellMaterial,
  buyback: Vendor.buyback,
  buybackList: Vendor.buybackList,
  buybackEntries: Vendor.buybackEntries,
  /** Mühürdar (Av Mührü vendor) */
  sealOffers: Vendor.sealOffers,
  sealCount: Vendor.sealCount,
  buySealOffer: Vendor.buySealOffer,
  /** Gizemli Tüccar (gamble vendor) */
  gambleOptions: Vendor.gambleOptions,
  gambleCost: Vendor.gambleCost,
  gamble: Vendor.gamble,
  gambleMinLevel: Vendor.GAMBLE_MIN_LEVEL,
};

export const forgeApi = {
  upgradeCost: Upgrade.upgradeCost,
  upgradeItem: Upgrade.upgradeItem,
  repairCost: Upgrade.repairCost,
  repairItem: Upgrade.repairItem,
  isBoundItem: Upgrade.isBoundItem,
  efsunCost: Upgrade.efsunCost,
  efsun: Upgrade.efsun,
  kadimEfsun: Upgrade.kadimEfsun,
  takviye: Upgrade.takviye,
  socketGem: Upgrade.socketGem,
  removeGem: Upgrade.removeGem,
  addSocket: Upgrade.addSocket,
  addSocketCost: Upgrade.addSocketCost,
  maxSocketsOf: Upgrade.maxSocketsOf,
  combineGems: Upgrade.combineGems,
  combineCost: Upgrade.combineCost,
  salvageItem: Upgrade.salvageItem,
  salvageAll: Upgrade.salvageAll,
};
