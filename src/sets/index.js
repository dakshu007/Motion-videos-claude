import { OfficeSet } from './office.js';
import { CafeSet } from './cafe.js';
import { KitchenSet } from './kitchen.js';
import { BedroomSet } from './bedroom.js';
import { ParkSet } from './park.js';
import { StudioSet } from './studio.js';

export { TIMES, lerpTime } from './common.js';

const SETS = { office: OfficeSet, cafe: CafeSet, kitchen: KitchenSet, bedroom: BedroomSet, park: ParkSet, studio: StudioSet };

export function createSet(name, scene, options) {
  const S = SETS[name] || OfficeSet;
  return new S(scene, options);
}
