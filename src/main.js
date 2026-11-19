import './style.css';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Like the supplied animator kit, every scene pose is derived from a single time value.
const TOTAL = 24;
const canvas = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
camera.position.set(0, 0, 13);
scene.add(new THREE.HemisphereLight(0xe6d8ff, 0x302340, 2.4));
const key = new THREE.DirectionalLight(0xffe5f5, 3.2); key.position.set(-3, 6, 8); scene.add(key);
const rim = new THREE.DirectionalLight(0x9672ff, 4); rim.position.set(5, 1, -5); scene.add(rim);
const root = new THREE.Group(); scene.add(root);
const material = (color, metalness = 0, roughness = .4) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const purple = material(0x8b69dc, .32, .32), silver = material(0xc8bade, .75, .24), dark = material(0x292133, .5, .27);
const glow = new THREE.MeshBasicMaterial({color:0xc1a1ff});
function mesh(geometry, mat, parent, x=0,y=0,z=0) {const m = new THREE.Mesh(geometry, mat);m.position.set(x,y,z);parent.add(m);return m;}
function rounded(w,h,d,r,mat,parent,x=0,y=0,z=0){return mesh(new RoundedBoxGeometry(w,h,d,5,r),mat,parent,x,y,z)}
function screenTexture() {
  const c=document.createElement('canvas'); c.width=512;c.height=1024;const x=c.getContext('2d');
  const grad=x.createLinearGradient(0,0,512,1024);grad.addColorStop(0,'#e6d8ff');grad.addColorStop(.58,'#b69ae9');grad.addColorStop(1,'#8060c4');x.fillStyle=grad;x.fillRect(0,0,512,1024);
  // Subtle atmosphere on the lit screen.
  const orb=x.createRadialGradient(250,480,20,250,480,340);orb.addColorStop(0,'rgba(255,255,255,.6)');orb.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=orb;x.fillRect(0,0,512,1024);
  x.fillStyle='#413451';x.font='600 24px Arial';x.fillText('9:41',38,61);x.textAlign='right';x.fillText('●  ▰',473,61);x.textAlign='center';
  x.font='600 18px Arial';x.letterSpacing='4px';x.fillStyle='rgba(58,42,79,.65)';x.fillText('A LITTLE HELLO',256,270);x.letterSpacing='0px';
  x.font='600 57px Arial';x.fillStyle='#302340';x.fillText('Connected.',256,340);
  x.font='24px Arial';x.fillStyle='rgba(53,40,70,.65)';x.fillText('A world within reach',256,386);
  // waveform drawn into the device screen
  x.strokeStyle='#6948a9';x.lineWidth=7;x.lineCap='round';
  for(let i=0;i<25;i++){let h=12+55*Math.exp(-Math.pow((i-12)/6,2))*(.35+.65*Math.abs(Math.sin(i*2.7)));let px=87+i*14;x.beginPath();x.moveTo(px,585-h);x.lineTo(px,585+h);x.stroke()}
  x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.roundRect(130,748,252,73,36);x.fill();x.fillStyle='#55416f';x.font='600 21px Arial';x.fillText('SENDING SIGNAL',256,794);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const screenMat = new THREE.MeshBasicMaterial({map:screenTexture()});
function makePhone(){
  const g=new THREE.Group();
  rounded(2.03,4.12,.25,.22,silver,g);
  rounded(1.96,4.05,.12,.2,dark,g,0,0,.13);
  rounded(1.83,3.91,.04,.18,screenMat,g,0,0,.205);
  rounded(.58,.13,.025,.06,dark,g,0,1.73,.24);
  mesh(new THREE.CircleGeometry(.035,24),new THREE.MeshBasicMaterial({color:0x736888}),g,.2,1.73,.26);
  rounded(.035,.48,.04,.015,silver,g,-1.03,.85,0);
  rounded(.035,.3,.04,.015,silver,g,-1.03,.18,0);
  return g;
}
const phone=makePhone();root.add(phone);
const phone2=makePhone();root.add(phone2);
// Luminous orbital rings behind the device, made of real 3D geometry.
const rings=[];
for(let i=0;i<4;i++){
 const m=new THREE.MeshBasicMaterial({color:i%2?0xa97ef1:0xd1bbff,transparent:true,opacity:.23,depthWrite:false});
 const ring=mesh(new THREE.TorusGeometry(2.12+i*.41,.012,8,160),m,root,0,0,-.8-i*.02);rings.push(ring);
}
// Cell tower, built as a tapered structural lattice.
const tower=new THREE.Group();root.add(tower);
function rod(a,b,r,mat,parent){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);const o=mesh(new THREE.CylinderGeometry(r,r,d.length(),10),mat,parent);o.position.copy(start).add(end).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
const towerMat=material(0xc5b6db,.6,.3);
rod([-.75,-1.9,0],[-.13,1.65,0],.055,towerMat,tower);rod([.75,-1.9,0],[.13,1.65,0],.055,towerMat,tower);
for(let i=0;i<6;i++){const y=-1.75+i*.54;const w=.71-i*.09;rod([-w,y,0],[w,y,0],.025,towerMat,tower);if(i<5){const w2=w-.09;rod([-w,y,0],[w2,y+.54,0],.023,towerMat,tower);rod([w,y,0],[-w2,y+.54,0],.023,towerMat,tower)}}
rounded(.48,.18,.22,.06,purple,tower,0,1.7,0);rod([0,1.75,0],[0,2.35,0],.035,towerMat,tower);mesh(new THREE.SphereGeometry(.12,24,16),glow,tower,0,2.35,0);
for(const side of [-1,1]){rounded(.18,.85,.13,.07,silver,tower,side*.42,1.55,0);rod([side*.13,1.45,0],[side*.42,1.45,0],.03,towerMat,tower)}
// Deterministic drifting particles in the depth of the scene.
const particles=[];
for(let i=0;i<36;i++){const m=mesh(new THREE.SphereGeometry(i%5===0?.035:.018,8,8),new THREE.MeshBasicMaterial({color:i%3===0?0xe0caff:0x9f7bda,transparent:true,opacity:.65}),root);particles.push(m)}
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
let isMobile=false;
function resize(){const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();isMobile=rect.width<800;}
window.addEventListener('resize',resize);resize();
function renderAt(t){
 t=clamp(t,0,TOTAL); const chapter=Math.min(3,Math.floor(t/6));const local=t-chapter*6;
 root.position.set(isMobile?0:2.0,isMobile?-1.45:0,0);
 root.scale.setScalar(isMobile?.72:1);
 // Camera drift is a gentle, eased move rather than independent keyframe wobble.
 camera.position.x=.16*Math.sin(t/TOTAL*Math.PI);camera.lookAt(0,0,0);
 const pop=.88+.12*smooth(t/.8);
 phone.visible=chapter!==2;phone2.visible=chapter===3;tower.visible=chapter===2;
 phone.position.set(chapter===3?-1.15:0,.09*Math.sin(t*.75),.1);phone.scale.setScalar((chapter===3?.72:1)*pop);phone.rotation.set(-.06,-.24+Math.sin(t*.35)*.08,-.045);
 phone2.position.set(1.25,-.15,.0);phone2.scale.setScalar(.72);phone2.rotation.set(-.04,.23,.06);
 tower.position.y=-.15+(1-smooth(local/.8))*-.6;tower.rotation.y=-.12+Math.sin(t*.3)*.1;
 rings.forEach((r,i)=>{r.visible=true;r.scale.setScalar(.95+.035*Math.sin(t*1.2-i*.7));r.rotation.z=.12*Math.sin(t*.2+i*.3);r.material.opacity=chapter===1?.25+.12*Math.sin(t*2-i):.12+i*.015;});
 particles.forEach((p,i)=>{const a=hash(i+2)*Math.PI*2;const radius=2.4+hash(i+19)*1.5;p.position.set(Math.cos(a)*radius,Math.sin(a)*radius*.78+.1*Math.sin(t*.6+i),-.5+hash(i+50));p.material.opacity=.2+.4*(.5+.5*Math.sin(t+i));});
 renderer.render(scene,camera);
}
const chapters=[
 {tag:'THE BEGINNING',title:'It starts with<br><em>your voice.</em>',description:'Your phone transforms sound into digital information, ready to travel.',label:'YOUR PHONE<br><small>THE STORY STARTS HERE</small>'},
 {tag:'INTO THE AIR',title:'Now ride<br><em>the waves.</em>',description:'That information travels through the air as invisible radio waves.',label:'RADIO WAVES<br><small>INVISIBLE, BUT ALL AROUND US</small>'},
 {tag:'THE CONNECTION',title:'Say hello to<br><em>the network.</em>',description:'A nearby cell tower receives the signal and passes it into the network.',label:'CELL TOWER<br><small>YOUR LINK TO THE NETWORK</small>'},
 {tag:'THE DESTINATION',title:'And just like<br><em>that, hello.</em>',description:'The network routes the information to another phone, turning it back into sound.',label:'MESSAGE RECEIVED<br><small>CONNECTION COMPLETE</small>'}
];
const number=document.querySelector('#chapter-number'),tag=document.querySelector('#chapter-tag'),title=document.querySelector('#chapter-title'),description=document.querySelector('#chapter-description'),objectLabel=document.querySelector('#object-label');
const timeline=document.querySelector('#timeline'),current=document.querySelector('#current-time'),playButton=document.querySelector('#play-button'),playIcon=document.querySelector('#play-icon'),cards=[...document.querySelectorAll('.chapter-card')];
let time=0, playing=true, last=performance.now(),shown=-1;
function updateUI(){const i=Math.min(3,Math.floor(time/6));if(i!==shown){shown=i;const c=chapters[i];number.textContent=`0${i+1}`;tag.textContent=c.tag;title.innerHTML=c.title;description.textContent=c.description;objectLabel.innerHTML=c.label;cards.forEach((card,index)=>card.classList.toggle('active',index===i));}timeline.value=time;timeline.style.setProperty('--progress',`${time/TOTAL*100}%`);current.textContent=`00:${String(Math.floor(time)).padStart(2,'0')}`;playIcon.textContent=playing?'Ⅱ':'▶';playButton.setAttribute('aria-label',playing?'Pause animation':'Play animation');}
function frame(now){if(playing){time+=Math.min((now-last)/1000,.1);if(time>=TOTAL){time=TOTAL;playing=false}}last=now;renderAt(time);updateUI();requestAnimationFrame(frame)}
playButton.addEventListener('click',()=>{if(time>=TOTAL)time=0;playing=!playing;last=performance.now();updateUI()});
document.querySelector('#restart').addEventListener('click',()=>{time=0;playing=true;last=performance.now();updateUI()});
timeline.addEventListener('input',()=>{time=Number(timeline.value);last=performance.now();renderAt(time);updateUI()});
cards.forEach(card=>card.addEventListener('click',()=>{time=Number(card.dataset.time);playing=true;last=performance.now();renderAt(time);updateUI();document.querySelector('.film').scrollIntoView({behavior:'smooth',block:'center'})}));
// Expose a deterministic seek point for inspection and automation.
window.renderAt=(t)=>{time=clamp(t,0,TOTAL);playing=false;renderAt(time);updateUI()};
if (new URLSearchParams(location.search).has('offline')) { playing=false; renderAt(0); updateUI(); }
else requestAnimationFrame(frame);
