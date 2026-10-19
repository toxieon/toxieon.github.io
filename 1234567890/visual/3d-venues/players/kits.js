import * as T from 'three';

export async function loadKits(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('kits');
  return r.json();
}

function jumperTexture(kit) {
  const j = kit.jumper || { pattern: 'plain', colors: ['#888'] };
  const colors = j.colors || ['#888'];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const bands = j.bands || 6;
  if (j.pattern === 'stripes') {
    const w = c.width / (bands * 2);
    for (let i = 0; i < bands * 2; i++) {
      x.fillStyle = colors[i % colors.length];
      x.fillRect(i * w, 0, w, c.height);
    }
  } else if (j.pattern === 'hoops') {
    const h = c.height / bands;
    for (let i = 0; i < bands; i++) {
      x.fillStyle = colors[i % colors.length];
      x.fillRect(0, i * h, c.width, h);
    }
  } else {
    x.fillStyle = colors[0];
    x.fillRect(0, 0, c.width, c.height);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

export function kitMaterials(scene, kit) {
  const ref = {};
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.name) ref[o.material.name] = o.material;
  });
  const std = (color) => new T.MeshStandardMaterial({ color, roughness: 0.78 });
  const mats = {};
  mats.jumper = new T.MeshStandardMaterial({ map: jumperTexture(kit), roughness: 0.82 });
  mats.shorts = std(kit.shorts);
  mats.skin = ref.skin ? ref.skin.clone() : std(0xe8b598);
  mats.hair = ref.hair ? ref.hair.clone() : std(0x2a2018);
  mats.socks = std(kit.socks?.base || kit.shorts);
  mats.sockTop = std(kit.socks?.top || kit.socks?.base || '#ffffff');
  mats.boots = std(kit.boots || '#222222');
  return mats;
}
