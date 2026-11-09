import { OfficeSet } from './office.js';
import { CafeSet } from './cafe.js';
import { KitchenSet } from './kitchen.js';
import { BedroomSet } from './bedroom.js';
import { ParkSet } from './park.js';
import { StudioSet } from './studio.js';
import { BlankSet } from './blank.js';

export { TIMES, lerpTime, IMAGES, loadImages } from './common.js';

const SETS = { office: OfficeSet, cafe: CafeSet, kitchen: KitchenSet, bedroom: BedroomSet, park: ParkSet, studio: StudioSet, blank: BlankSet };

export function createSet(name, scene, options) {
  const S = SETS[name] || OfficeSet;
  return new S(scene, options);
}
