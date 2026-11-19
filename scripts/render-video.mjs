// Deterministic offline capture of the actual browser film, frame by frame.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('='); return [k,v ?? true]}));
const fps=Number(args.fps||30), duration=Number(args.seconds||24), width=Number(args.width||1280), height=Number(args.height||720);
const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
const server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port:0,allowedHosts:true},logLevel:'error'});
await server.listen();
const port=server.httpServer.address().port;
let browser;
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || await chromium.executablePath(),headless:true,args:[...chromium.args,'--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars']});
  const page=await browser.newPage();
  await page.setViewport({width,height,deviceScaleFactor:1});
  page.on('pageerror',error=>console.error('Page error:',error.message));
  await page.goto(`http://127.0.0.1:${port}/?offline=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction('typeof window.renderAt === "function"',{timeout:60000});
  await page.addStyleTag({content:`html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#1b1725!important}.site-shell{padding:0!important;max-width:none!important}.topbar,.intro,.player,.chapters,footer{display:none!important}.film{width:100vw!important;height:100vh!important;border-radius:0!important}.film-copy{top:25%!important}.object-label{top:50%!important;bottom:auto!important}`});
  await page.evaluate(()=>{document.querySelector('.film-bottom span:last-child').textContent='24 SECONDS  ·  SOUND ON'; window.dispatchEvent(new Event('resize'));window.renderAt(0)});
  const gpu=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'});
  console.log(`Renderer: ${gpu}; ${width}x${height} at ${fps} fps`);
  if(args.stills){
    fs.mkdirSync('output/stills',{recursive:true});
    for(const t of String(args.stills).split(',').map(Number)){await page.evaluate(t=>window.renderAt(t),t);await page.screenshot({path:`output/stills/frame-${t}.png`});console.log(`Still: ${t}s`)}
  } else {
    const out=args.out||'output/how-mobile-phones-work.mp4'; fs.mkdirSync('output',{recursive:true});
    const ffArgs=['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0'];
    if(args.audio)ffArgs.push('-i',args.audio);
    ffArgs.push('-map','0:v:0');if(args.audio)ffArgs.push('-map','1:a:0','-c:a','aac','-b:a','192k','-af','loudnorm=I=-14:TP=-1.5:LRA=11','-shortest');
    ffArgs.push('-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',out);
    const ff=spawn(ffmpeg,ffArgs,{stdio:['pipe','inherit','inherit']});
    let error; ff.on('error',e=>{error=e}); ff.stdin.on('error',e=>{error=e});
    const frames=Math.round(duration*fps),start=Date.now();
    for(let i=0;i<frames;i++){
      if(error)throw error;
      await page.evaluate(t=>window.renderAt(t),i/fps);
      const image=await page.screenshot({type:'jpeg',quality:90});
      if(!ff.stdin.write(image))await once(ff.stdin,'drain');
      if((i+1)%30===0){const elapsed=(Date.now()-start)/1000;console.log(`frame ${i+1}/${frames}, ${elapsed.toFixed(0)}s elapsed, ~${((frames-i-1)*elapsed/(i+1)).toFixed(0)}s left`)}
    }
    ff.stdin.end();const [code]=await once(ff,'close');if(code!==0)throw Error(`ffmpeg exited ${code}`);
    console.log(`Video -> ${out}`);
  }
} finally { if(browser)await browser.close();await server.close(); }
