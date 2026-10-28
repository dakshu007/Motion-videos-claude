import { Human } from './human.js';
import { Mascot } from './mascot.js';

export { EXPRESSIONS, blendExpr } from './faces.js';

export function createCharacter(id, spec, slot) {
  return (spec.type || 'human') === 'human' ? new Human(id, spec, slot) : new Mascot(id, spec, slot);
}
