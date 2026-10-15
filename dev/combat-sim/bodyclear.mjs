// OWN-BODY CLEARANCE (src/camera/BodyClearance.ts), headless. The third-person lens must not sit inside the character it follows: its
// own helmet and arm within a few tenths of a metre fill the view as flat, textureless blocks. Checks: the parts the lens is inside (or
// within the hide margin of) are hidden; the ones it has left are shown again; a mesh something else hid is never shown by the hider;
// a new character drops what the old one had hidden; and the keep-out distance is a sane value.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/bodyclear.mjs [--v]
const root = new URL('../../src/', import.meta.url).href;
const THREE = await import('three');
const { BODY_KEEP_OUT, NearBodyHider } = await import(root + 'camera/BodyClearance.ts');
const verbose = process.argv.includes('--v');

let fails = 0, passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// a character: a head and an arm (unit boxes), one far prop, and one mesh another system hid
const character = () => {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  head.name = 'Head';
  head.position.set(0, 1.5, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), new THREE.MeshBasicMaterial());
  arm.name = 'Arm';
  arm.position.set(0.8, 1.0, 0);
  const far = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial());
  far.name = 'Far';
  far.position.set(0, 1.0, 5);
  const hiddenBySomeoneElse = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  hiddenBySomeoneElse.name = 'Cape';
  hiddenBySomeoneElse.position.set(0, 1.2, 0.2);
  hiddenBySomeoneElse.visible = false;
  g.add(head, arm, far, hiddenBySomeoneElse);
  g.updateMatrixWorld(true);
  return { g, head, arm, far, cape: hiddenBySomeoneElse };
};

// 1. the lens inside the head: the head (and the arm, which the lens is also near) are hidden; the far prop stays
{
  const c = character();
  const h = new NearBodyHider();
  h.update(c.g, new THREE.Vector3(0, 1.5, 0.3));
  ok('near.head-hidden', c.head.visible === false, 'the lens is inside the head: the head is hidden');
  ok('near.arm-hidden', c.arm.visible === false, 'the lens is within the hide margin of the arm: hidden');
  ok('near.far-kept', c.far.visible === true, 'a prop 4.7 m away is not touched');
  ok('near.other-kept', c.cape.visible === false, 'a mesh something else hid stays hidden (not the hider\'s to show)');
  // the lens leaves: the head and arm come back, the mesh hidden by someone else still does not
  h.update(c.g, new THREE.Vector3(0, 1.5, 8));
  ok('away.head-shown', c.head.visible === true && c.arm.visible === true, 'the lens is clear again: the parts are shown');
  ok('away.other-kept', c.cape.visible === false, 'the hider never shows a mesh it did not hide');
  h.reset();
}

// 2. the hide margin: just outside the sphere plus the margin is shown, just inside is hidden
{
  const c = character();
  const h = new NearBodyHider();
  // the head sphere: radius sqrt(3)/2 ~ 0.866, centre (0,1.5,0); the margin is in BodyClearance.ts (0.35)
  h.update(c.g, new THREE.Vector3(0, 1.5, 0.866 + 0.35 - 0.05));
  ok('margin.inside', c.head.visible === false, 'inside sphere + margin: hidden');
  h.update(c.g, new THREE.Vector3(0, 1.5, 0.866 + 0.35 + 0.1));
  ok('margin.outside', c.head.visible === true, 'outside sphere + margin: shown');
  h.reset();
}

// 3. a new character drops what the old one had hidden; a null root shows everything it hid
{
  const a = character();
  const b = character();
  const h = new NearBodyHider();
  h.update(a.g, new THREE.Vector3(0, 1.5, 0.3));
  ok('swap.hidden-before', a.head.visible === false, 'the old character is hidden while the lens is inside it');
  h.update(b.g, new THREE.Vector3(0, 1.5, 8));
  ok('swap.restored', a.head.visible === true, 'switching to a new character restores the old one');
  ok('swap.new-visible', b.head.visible === true, 'the new character is drawn');
  h.update(b.g, new THREE.Vector3(0, 1.5, 0.3));
  h.update(null, new THREE.Vector3(0, 1.5, 0.3));
  ok('null.restored', b.head.visible === true, 'no target: the hider shows what it hid');
}

// 4. the keep-out: the lens never closer than this to the pivot; far enough to clear the head and arm, close enough to frame the body
ok('keepout.value', BODY_KEEP_OUT >= 1.2 && BODY_KEEP_OUT <= 2.5, `BODY_KEEP_OUT ${BODY_KEEP_OUT} m`);

console.log(`\nbodyclear: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
