// Framing calculator: where do the New York landmarks land in the frame?
//   node tools/frame-check.mjs [lens] [cx] [cy] [cz] [tx] [ty] [tz]
// Prints each landmark's screen position, its height as a fraction of the frame,
// and whether it is cut by the frame edge. 1920×1080 (16:9).
import * as THREE from "three";

const [lens = 50, cx = 70, cy = 400, cz = -1620, tx = -10, ty = 185, tz = 220] = process.argv
  .slice(2)
  .map(Number);

const W = 1920;
const H = 1080;
const vFov = (2 * Math.atan(12 / lens) * 180) / Math.PI;
const cam = new THREE.PerspectiveCamera(vFov, W / H, 1, 90000);
cam.position.set(cx, cy, cz);
cam.lookAt(new THREE.Vector3(tx, ty, tz));
cam.updateMatrixWorld();
cam.updateProjectionMatrix();

const LM = [
  ["Empire State", 0, 0, 130, 60, 443],
  ["Chrysler", 640, -720, 62, 62, 319],
  ["One Vanderbilt", 250, -720, 74, 74, 490],
  ["30 Rock", -560, -1200, 140, 62, 259],
  ["Central Park Tower", -980, -2050, 62, 52, 500],
  ["111 W57", -1060, -1960, 44, 34, 480],
  ["432 Park", 440, -1980, 30, 30, 426],
  ["53W53", -320, -1600, 52, 46, 320],
  ["One57", -900, -1880, 52, 42, 306],
  ["Helmsley", 420, -950, 90, 62, 166],
  ["MetLife", 420, -830, 100, 62, 246],
  ["UN", 1330, -1050, 90, 26, 154],
  ["Flatiron", 0, 990, 22, 60, 87],
  ["Woolworth", -560, 3050, 60, 60, 241],
  ["8 Spruce", -820, 3050, 52, 52, 265],
  ["One WTC", 260, 5600, 62, 62, 541],
  ["30 HY", -1880, -40, 66, 66, 427],
  ["35 HY", -1990, -260, 54, 54, 308],
  ["One Times Sq", -400, -730, 34, 30, 111],
  ["Plaza", -40, -2010, 90, 60, 76],
  ["St Patrick", 60, -1270, 60, 100, 100],
  ["Grand Central", 420, -690, 180, 90, 38],
  ["9 DeKalb", 3020, 5050, 46, 46, 325],
  ["99 Hudson", -2760, 4560, 50, 46, 274],
  ["Skyline Tower", 3420, -2050, 46, 46, 237],
];

console.log(`lens ${lens}mm  vFOV ${vFov.toFixed(1)}°  camera (${cx}, ${cy}, ${cz}) → (${tx}, ${ty}, ${tz})`);
console.log("name                 dist    screenX  top%   base%   height%  note");
const v = new THREE.Vector3();
for (const [name, x, z, w, d, h] of LM) {
  const top = new THREE.Vector3(x, h, z).project(cam);
  const base = new THREE.Vector3(x, 0, z).project(cam);
  const sx = (top.x * 0.5 + 0.5) * W;
  const syTop = (1 - (top.y * 0.5 + 0.5)) * H;
  const syBase = (1 - (base.y * 0.5 + 0.5)) * H;
  v.set(x, 0, z);
  const dist = Math.hypot(x - cx, z - cz);
  const behind = v.clone().sub(cam.position).dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)) < 0;
  const onScreen = sx > -200 && sx < W + 200 && !behind;
  const cut = syTop < 0;
  console.log(
    `${name.padEnd(20)} ${String(Math.round(dist)).padStart(6)}  ${String(Math.round(sx)).padStart(7)}  ${String(Math.round(syTop)).padStart(5)}  ${String(
      Math.round(syBase),
    ).padStart(5)}  ${String(Math.round(Math.abs(syBase - syTop))).padStart(6)}  ${behind ? "BEHIND" : onScreen ? (cut ? "<-- CUT at top" : "") : "off-screen"}`,
  );
}
