/* Static access rules for ordinary private cars during offline OSM extraction. */
const modes = ['motorcar', 'motor_vehicle', 'vehicle', 'access'];
const allowed = new Set(['yes', 'permissive', 'designated', 'official']);
const restrictiveBarriers = new Set(['block', 'bollard', 'bus_trap', 'chain', 'cycle_barrier', 'gate', 'jersey_barrier',
  'kissing_gate', 'lift_gate', 'log', 'motorcycle_barrier', 'rope', 'sliding_gate', 'swing_gate', 'sump_buster']);
function access(tags, direction) {
  for (const key of modes) {
    if (direction && tags[key + ':' + direction + ':conditional'] || tags[key + ':conditional']) return 'conditional';
    const value = direction && tags[key + ':' + direction] || tags[key];
    if (value) return value;
  }
}

export function blockedNode(tags) {
  const permission = access(tags);
  return permission ? !allowed.has(permission) || tags.locked === 'yes'
    : restrictiveBarriers.has(tags.barrier) || tags.locked === 'yes';
}

export function directions(tags) {
  if (tags['oneway:conditional'] || modes.some(key => tags['oneway:' + key + ':conditional'])) return 0;
  const one = tags['oneway:motorcar'] || tags['oneway:motor_vehicle'] || tags['oneway:vehicle'] || tags.oneway;
  let flags = 3;
  if (['yes', '1', 'true'].includes(one) || (!one && (tags.junction === 'roundabout' || tags.highway === 'motorway'))) flags = 1;
  else if (one === '-1') flags = 2;
  else if (one && !['no', '0', 'false'].includes(one)) return 0;
  for (const [direction, bit] of [['forward', 1], ['backward', 2]]) {
    const permission = access(tags, direction);
    const uncertain = tags.highway === 'track' || ['driveway', 'drive-through', 'emergency_access'].includes(tags.service);
    if ((permission && !allowed.has(permission)) || (uncertain && !permission)) flags &= ~bit;
  }
  return flags;
}

