/* Shared card renderer used by the Studio and the Bulk page. Exposes window.CR */
window.CR = (function(){
"use strict";
const CR = { onImageLoad:null };
const SIZES = { image9:[170,310], image45:[170,212], prompt:[170,170] };
const TYPE_LABEL = { image9:"9:16", image45:"4:5", prompt:"1:1" };
const PALETTES = {
  purple:{ label:"Purple", brand:"#CCABFF", from:"#F3ECFF", to:"#AE8AFF" },
  pink:  { label:"Pink",   brand:"#FF9B99", from:"#FFEDEA", to:"#FFAEA9" },
  blue:  { label:"Blue",   brand:"#C1E2FA", from:"#EAF5FF", to:"#B6DAF7" },
  yellow:{ label:"Yellow", brand:"#FCF0CC", from:"#FFF8E0", to:"#F5E1A4" }
};

const uid = () => Math.random().toString(36).slice(2,9);
function blank(type){
  return { id:uid(), type, segment:"neutral", category:"", treatment:"contrejour",
    kicker:"", headline:"", sub:"", align:"left", img:null, zoom:1, ox:0, oy:0,
    scrimSource:"sugg1", scrimColor:"#20483a", scrimH:55,
    question:"", subtext:"", palette:"purple", mascot:"", createdAt:Date.now() };
}

/* ---------- Image cache ---------- */
const imgCache = new Map();
function imgEntry(src){
  let e=imgCache.get(src);
  if(!e){
    e={img:new Image(),ok:false,failed:false};
    if(!src.startsWith("data:")) e.img.crossOrigin="anonymous";
    e.img.onload=()=>{ e.ok=true; CR.onImageLoad&&CR.onImageLoad(); };
    e.img.onerror=()=>{ e.failed=true; };
    e.img.src=src; imgCache.set(src,e);
  }
  return e;
}
function getImg(src){ if(!src) return null; const e=imgEntry(src); return e.ok?e.img:null; }
function loadImg(src){
  return new Promise(res=>{
    if(!src) return res(null);
    const e=imgEntry(src); if(e.ok) return res(e.img); if(e.failed) return res(null);
    e.img.addEventListener("load",()=>res(e.img)); e.img.addEventListener("error",()=>res(null));
  });
}

/* ---------- Rendering ---------- */
function coverRect(img,c,W,H){
  const base=Math.max(W/img.width,H/img.height)*c.zoom;
  const dw=img.width*base, dh=img.height*base;
  return { dw, dh, dx:(W-dw)/2 + c.ox*(dw-W)/2, dy:(H-dh)/2 + c.oy*(dh-H)/2 };
}
function drawCover(ctx,img,c,W,H){ const r=coverRect(img,c,W,H); ctx.drawImage(img,r.dx,r.dy,r.dw,r.dh); }
function sampleBottom(img,c,W,H){
  const w=34,h=Math.max(8,Math.round(34*H/W)), cv=document.createElement("canvas");
  cv.width=w; cv.height=h; const x=cv.getContext("2d"); drawCover(x,img,c,w,h);
  const y0=Math.floor(h*.6), d=x.getImageData(0,y0,w,h-y0).data; let r=0,g=0,b=0,n=d.length/4;
  for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
  return [r/n*.7, g/n*.7, b/n*.7].map(Math.round);
}
const hex2rgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const rgba = (c,a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function wrap(ctx,text,maxW){
  const out=[];
  for(const para of String(text).split("\n")){
    const words=para.split(/\s+/).filter(Boolean); let cur="";
    for(const w of words){ const t=cur?cur+" "+w:w; if(ctx.measureText(t).width>maxW && cur){out.push(cur);cur=w;} else cur=t; }
    if(cur) out.push(cur);
  }
  return out;
}
function setFont(ctx,weight,size,ls){
  ctx.font=`${weight} ${size}px "DM Sans", system-ui, sans-serif`;
  if("letterSpacing" in ctx) ctx.letterSpacing=(ls||0)+"px";
}
const palCache=new Map();
function paletteFor(src){
  if(!src) return null; if(palCache.has(src)) return palCache.get(src);
  const img=getImg(src); if(!img) return null;
  let p=null; try{ p=Palette.extract(img); }catch(e){}
  palCache.set(src,p); return p;
}
function gradientColor(c,img,W,H){
  if(c.scrimSource==="custom"||!img) return hex2rgb(c.scrimColor);
  const pal=paletteFor(c.img);
  const m=/^sugg([123])$/.exec(c.scrimSource), sg=pal&&pal.suggestions;
  const sw=m ? (sg&&(sg[m[1]-1]||sg[0])) : pal&&(pal[c.scrimSource]||pal.dominant);
  return sw?sw.rgb:sampleBottom(img,c,W,H);
}
function drawImageCard(ctx,c,W,H){
  const img=getImg(c.img);
  ctx.fillStyle="#1b1b1f"; ctx.fillRect(0,0,W,H);
  if(img){ drawCover(ctx,img,c,W,H); }
  else { ctx.fillStyle="#8d8a97"; setFont(ctx,500,9,0); ctx.textAlign="center"; ctx.fillText("Add an image",W/2,H/2); }
  // bottom gradient
  const col = gradientColor(c,img,W,H);
  const dark = col.map(v=>Math.round(v*.45));
  const top = H*(1-c.scrimH/100);
  const g=ctx.createLinearGradient(0,top,0,H);
  g.addColorStop(0,rgba(col,0)); g.addColorStop(.5,rgba(col,.78)); g.addColorStop(1,rgba(dark,.97));
  ctx.fillStyle=g; ctx.fillRect(0,top,W,H-top);
  // text
  const pad=12, right=c.align==="right", x=right?W-pad:pad;
  ctx.textAlign=right?"right":"left"; ctx.textBaseline="alphabetic"; ctx.fillStyle="#fff";
  let cursor=H-pad;
  const stack=(text,weight,size,ls,lh,gap,maxW)=>{
    if(!text||!text.trim()) return;
    setFont(ctx,weight,size,ls);
    const lines=wrap(ctx,text.toUpperCase(),maxW); let base=cursor;
    for(let i=lines.length-1;i>=0;i--){ ctx.fillText(lines[i],x,base); base-=lh; }
    cursor=(base+lh)-size*.72-gap;
  };
  stack(c.sub,600,6.5,.4,8.5,4.5,W-2*pad);
  stack(c.headline,900,15,0,14.2,3.5,W*.74);
  stack(c.kicker,600,6.5,.4,8.5,0,W-2*pad);
  if("letterSpacing" in ctx) ctx.letterSpacing="0px";
}
function drawMascotDefault(ctx,x,y,s){
  const g=ctx.createRadialGradient(x+s*.4,y+s*.3,s*.05,x+s*.5,y+s*.5,s*.6);
  g.addColorStop(0,"#A57BFF"); g.addColorStop(1,"#4A1FD1");
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(x+s*.5,y+s*.55,s*.46,s*.42,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff";
  for(const ex of [.36,.62]){ ctx.beginPath(); ctx.ellipse(x+s*ex,y+s*.55,s*.055,s*.1,0,0,Math.PI*2); ctx.fill(); }
}
function drawPrompt(ctx,c,W,H){
  const p=PALETTES[c.palette]||PALETTES.purple;
  const g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,p.from); g.addColorStop(1,p.to);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const mh=30, m=c.mascot?getImg(c.mascot):null;
  if(m) ctx.drawImage(m,14,14,mh*m.width/m.height,mh); else drawMascotDefault(ctx,14,14,mh);
  ctx.fillStyle="#14121a"; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  setFont(ctx,400,15,-.1);
  const lines=wrap(ctx,c.question||"",W-28); let y=70;
  for(const l of lines){ ctx.fillText(l,14,y); y+=17.5; }
  if(c.subtext){ setFont(ctx,600,6.5,.4); ctx.fillStyle="rgba(20,18,26,.6)"; ctx.fillText(c.subtext.toUpperCase(),14,H-12); if("letterSpacing" in ctx) ctx.letterSpacing="0px"; }
}
function render(c,canvas,scale){
  const [W,H]=SIZES[c.type];
  canvas.width=Math.round(W*scale); canvas.height=Math.round(H*scale);
  const ctx=canvas.getContext("2d"); ctx.setTransform(scale,0,0,scale,0,0);
  (c.type==="prompt"?drawPrompt:drawImageCard)(ctx,c,W,H);
}


Object.assign(CR,{SIZES,TYPE_LABEL,PALETTES,uid,blank,getImg,loadImg,paletteFor,gradientColor,coverRect,render,drawMascotDefault});
return CR;
})();
