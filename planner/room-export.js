/* Neill Planner room cutouts. Original, dependency-free canvas composition.
 * open({rooms,selectedRoomId,title,filename,loadImage,loadPdf,nodes}) */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NDPlannerRoomExport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bounds=points=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};};
  function layout(rooms,width,height,mode='plan',cap=3200){
    if(!rooms.length)throw Error('Select at least one room.');
    if(!(width>0&&height>0))throw Error('The floor plan has no image dimensions.');
    const groups=mode==='side'?rooms.map(room=>[room]):[rooms];
    const crops=groups.map(group=>{const b=bounds(group.flatMap(r=>r.points));return {x:b.x/100*width,y:b.y/100*height,width:b.width/100*width,height:b.height/100*height};});
    if(crops.some(b=>b.width<=0||b.height<=0))throw Error('A selected room has no area. Edit its outline first.');
    const columns=mode==='side'?Math.min(3,rooms.length):1,rows=Math.ceil(groups.length/columns),gap=24,heading=58,label=mode==='side'?36:0;
    const maxW=Math.max(...crops.map(b=>b.width)),maxH=Math.max(...crops.map(b=>b.height));
    const scale=Math.min(1,(cap-gap*(columns+1))/(columns*maxW),(cap-heading-gap*(rows+1)-label*rows)/(rows*maxH));
    if(!(scale>0))throw Error('Too many room panels for one image. Select fewer rooms or use True to plan.');
    const cellW=maxW*scale,cellH=maxH*scale+label;
    return {width:Math.ceil(columns*cellW+gap*(columns+1)),height:Math.ceil(rows*cellH+heading+gap*(rows+1)),scale,
      cells:groups.map((group,i)=>({rooms:group,bounds:crops[i],x:gap+(i%columns)*(cellW+gap)+(cellW-crops[i].width*scale)/2,y:heading+gap+Math.floor(i/columns)*(cellH+gap)+label,scale,labelY:heading+gap+Math.floor(i/columns)*(cellH+gap)+20}))};
  }
  function pointInside(point,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  function path(ctx,room,width,height){ctx.beginPath();room.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p[0]*width/100,p[1]*height/100));ctx.closePath();}
  function compose(image,rooms,options={}){
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    const plan=layout(rooms,width,height,options.mode),canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#18231d';ctx.font='bold 20px system-ui,sans-serif';ctx.fillText(options.title||'Neill Planner · Room export',24,30,Math.max(1,canvas.width-48));
    ctx.fillStyle='#627066';ctx.font='12px system-ui,sans-serif';ctx.fillText(options.mode==='side'?'Side by side · cropped room sections':'True to plan · original relative positions',24,49,Math.max(1,canvas.width-48));
    plan.cells.forEach(cell=>{
      if(options.mode==='side'&&options.labels!==false){ctx.fillStyle='#233029';ctx.font='bold 15px system-ui,sans-serif';ctx.fillText(cell.rooms[0].name,cell.x,cell.labelY,Math.max(1,cell.bounds.width*cell.scale));}
      ctx.save();ctx.translate(cell.x,cell.y);ctx.scale(cell.scale,cell.scale);ctx.translate(-cell.bounds.x,-cell.bounds.y);
      cell.rooms.forEach(room=>{
        ctx.save();path(ctx,room,width,height);ctx.clip();ctx.drawImage(image,0,0,width,height);
        if(options.shading){ctx.fillStyle='rgba(14,165,233,'+Math.max(0,Math.min(1,room.fill??.18))+')';ctx.fillRect(0,0,width,height);}
        if(options.nodes)(options.nodeList||[]).forEach(node=>{
          if(!pointInside([node.x,node.y],room.points))return;
          const x=node.x*width/100,y=node.y*height/100,r=Math.max(2,width*.003*(node.size||1));
          ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=/^#[\da-f]{3,8}$/i.test(node.color||'')?node.color:'#2563eb';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,r/4);ctx.stroke();
          ctx.font='bold '+Math.max(7,r*1.1)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(String(node.label||'').slice(0,4),x,y,r*1.8);ctx.textAlign='start';ctx.textBaseline='alphabetic';
        });
        if(options.mode!=='side'&&options.labels!==false){
          const b=bounds(room.points),p=room.labelPoint||[b.x+b.width/2,b.y+b.height/2];
          const size=Math.max(12/Math.max(cell.scale,.1),width*.006);ctx.font='bold '+size+'px system-ui';ctx.textAlign='center';
          const maxWidth=b.width*width/100*.9,textWidth=Math.min(ctx.measureText(room.name).width,maxWidth);
          ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(p[0]*width/100-textWidth/2-5,p[1]*height/100-size,textWidth+10,size*1.4);
          ctx.fillStyle='#1b2c22';ctx.fillText(room.name,p[0]*width/100,p[1]*height/100,Math.max(1,maxWidth));ctx.textAlign='start';
        }
        ctx.restore();
      });
      if(options.outlines!==false)cell.rooms.forEach(room=>{path(ctx,room,width,height);ctx.strokeStyle='rgba(35,116,165,'+Math.max(0,Math.min(1,room.border??.85))+')';ctx.lineWidth=1.5/cell.scale;ctx.stroke();});
      ctx.restore();
    });
    return canvas;
  }
  let active=null;
  function open(options){
    if(active)active.close();
    const prior=document.activeElement,overflow=document.body.style.overflow;
    const rooms=options.rooms||[],selected=new Set([options.selectedRoomId]);
    if(!document.getElementById('ndre-style')){
      const style=document.createElement('style');style.id='ndre-style';style.textContent='.ndre{position:fixed;inset:0;z-index:12000;background:#101711;color:#edf4ee;display:flex;flex-direction:column;font:14px/1.5 system-ui;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));gap:14px;box-sizing:border-box}.ndre *{box-sizing:border-box}.ndre header,.ndre-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.ndre h2{font-size:20px;margin:0}.ndre p{margin:5px 0;color:#acbdae}.ndre button,.ndre a{font:inherit;min-height:44px;border:1px solid #47624d;border-radius:8px;padding:9px 14px;background:#26382a;color:#edf4ee;cursor:pointer;text-decoration:none}.ndre button:disabled{opacity:.4;cursor:default}.ndre button:focus-visible,.ndre a:focus-visible,.ndre input:focus-visible{outline:3px solid #b8ea91;outline-offset:3px}.ndre-body{display:grid;grid-template-columns:280px 1fr;gap:18px;min-height:0;flex:1}.ndre-options{overflow:auto;border:1px solid #354638;border-radius:10px;padding:16px}.ndre fieldset{border:0;padding:0;margin:0 0 20px}.ndre legend{font-weight:700;margin-bottom:9px}.ndre label{display:flex;gap:10px;align-items:center;min-height:44px}.ndre input{accent-color:#b8ea91}.ndre-preview{min-height:150px;overflow:auto;background:#26332a;border-radius:10px;padding:16px;display:flex;align-items:flex-start;justify-content:center}.ndre-preview img{max-width:100%;height:auto;background:white;object-fit:contain}.ndre-status{min-height:21px;font-size:12px}.ndre [hidden]{display:none!important}.ndre-output{display:flex;gap:8px;align-items:center;flex-wrap:wrap}@media(max-width:700px){.ndre{padding:10px;overflow:auto}.ndre-body{display:flex;flex-direction:column;overflow:auto}.ndre-options{overflow:visible;flex:none}.ndre-options fieldset{margin-bottom:12px}.ndre-preview{flex:none;min-height:160px}.ndre h2{font-size:17px}.ndre header p{font-size:12px}.ndre button,.ndre a{font-size:12px}}';document.head.appendChild(style);
    }
    const el=document.createElement('section');el.className='ndre';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Export rooms');
    el.innerHTML='<header><div><h2>Export rooms</h2><p>'+escape(options.title||'Selected floor')+' · Rooms on this floor</p></div><button data-close>Close</button></header><div class="ndre-body"><div class="ndre-options"><fieldset><legend>Include rooms</legend>'+rooms.map(r=>'<label><input type="checkbox" data-room="'+escape(r.id)+'" '+(selected.has(r.id)?'checked':'')+'>'+escape(r.name)+'</label>').join('')+'</fieldset><fieldset><legend>Layout</legend><label><input type="radio" name="ndre-layout" value="plan" checked>True to plan</label><label><input type="radio" name="ndre-layout" value="side">Side by side</label></fieldset><fieldset><legend>Include in the cutouts</legend><label><input type="checkbox" data-option="labels" checked>Room names</label><label><input type="checkbox" data-option="nodes" checked>Node markers</label><label><input type="checkbox" data-option="outlines" checked>Room borders</label><label><input type="checkbox" data-option="shading">Room fill</label></fieldset><p>True to plan keeps the rooms in their original positions. Side by side arranges cropped panels at a common scale. Areas outside the selected outlines are excluded.</p></div><div class="ndre-preview"><img alt="Selected room cutouts preview" hidden></div></div><p class="ndre-status" role="status" aria-live="polite">Loading the floor plan…</p><div class="ndre-actions"><div class="ndre-output"><a data-png hidden>Download PNG ↓</a><button data-share-png hidden>Share PNG</button><button data-pdf disabled>Prepare PDF</button></div><div class="ndre-output"><a data-save-pdf hidden>Download PDF ↓</a><a data-open-pdf target="_blank" rel="noopener" hidden>Open PDF</a><button data-share-pdf hidden>Share PDF</button></div></div>';
    document.body.appendChild(el);document.body.style.overflow='hidden';
    const q=selector=>el.querySelector(selector),status=q('.ndre-status'),preview=q('img');let closed=false,image=null,canvas=null,version=0,pngUrl=null,pdfUrl=null,pngFile=null,pdfFile=null,sourceUrl=null;
    const base=String(options.filename||'Neill-room-export').replace(/[\\/:*?"<>|]/g,'-').slice(0,100);
    const canShare=file=>{try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));}catch(_){return false;}};
    function close(){closed=true;version++;[pngUrl,pdfUrl,sourceUrl].filter(Boolean).forEach(url=>URL.revokeObjectURL(url));el.remove();document.body.style.overflow=overflow;active=null;if(prior?.isConnected)prior.focus();}
    async function refresh(){
      const request=++version;
      q('[data-save-pdf]').hidden=q('[data-open-pdf]').hidden=q('[data-share-pdf]').hidden=true;
      q('[data-pdf]').disabled=true;pdfFile=null;
      if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}
      q('[data-png]').hidden=q('[data-share-png]').hidden=true;preview.hidden=true;pngFile=null;
      if(!image)return;
      try{
        const chosen=rooms.filter(r=>selected.has(r.id));if(!chosen.length){status.textContent='Select at least one room.';return;}
        const config={mode:q('[name="ndre-layout"]:checked').value,title:options.title,nodeList:options.nodes||[]};
        el.querySelectorAll('[data-option]').forEach(input=>config[input.dataset.option]=input.checked);
        status.textContent='Preparing room cutouts…';
        canvas=compose(image,chosen,config);
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('Image export failed.')),'image/png'));
        if(closed||request!==version)return;
        if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(blob);pngFile=new File([blob],base+'.png',{type:'image/png'});
        preview.src=pngUrl;preview.hidden=false;q('[data-png]').href=pngUrl;q('[data-png]').download=pngFile.name;q('[data-png]').hidden=false;q('[data-share-png]').hidden=!canShare(pngFile);q('[data-pdf]').disabled=!options.loadPdf;
        status.textContent=chosen.length+' room(s) · '+canvas.width+' × '+canvas.height+' px · '+(config.mode==='plan'?'True to plan':'Side by side');
      }catch(error){status.textContent=error.message||'Could not prepare the cutouts.';}
    }
    el.addEventListener('change',event=>{if(event.target.dataset.room){if(event.target.checked)selected.add(event.target.dataset.room);else selected.delete(event.target.dataset.room);}refresh();});
    q('[data-close]').onclick=close;
    q('[data-pdf]').onclick=async()=>{
      const request=version,currentCanvas=canvas;if(!currentCanvas)return;
      q('[data-pdf]').disabled=true;status.textContent='Preparing PDF…';
      try{
        const JsPDF=await options.loadPdf();if(closed||request!==version)return;
        const pdf=new JsPDF({orientation:currentCanvas.width>currentCanvas.height?'landscape':'portrait',unit:'mm',format:'a4'});
        const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight(),scale=Math.min((w-16)/currentCanvas.width,(h-16)/currentCanvas.height);
        pdf.addImage(currentCanvas.toDataURL('image/png'),'PNG',(w-currentCanvas.width*scale)/2,(h-currentCanvas.height*scale)/2,currentCanvas.width*scale,currentCanvas.height*scale);
        const blob=pdf.output('blob');pdfFile=new File([blob],base+'.pdf',{type:'application/pdf'});pdfUrl=URL.createObjectURL(blob);
        q('[data-save-pdf]').href=q('[data-open-pdf]').href=pdfUrl;q('[data-save-pdf]').download=pdfFile.name;q('[data-save-pdf]').hidden=q('[data-open-pdf]').hidden=false;q('[data-share-pdf]').hidden=!canShare(pdfFile);status.textContent='PDF ready. Download, open or share it.';
      }catch(error){status.textContent='PDF could not be created: '+error.message;}finally{if(!closed&&request===version)q('[data-pdf]').disabled=false;}
    };
    ['png','pdf'].forEach(kind=>q('[data-share-'+kind+']').onclick=()=>{const file=kind==='png'?pngFile:pdfFile;if(file&&canShare(file))navigator.share({files:[file],title:options.title}).catch(error=>{if(error.name!=='AbortError')status.textContent='Sharing is unavailable. Use Download or Open instead.';});});
    el.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
      if(event.key==='Tab'){const focusable=Array.from(el.querySelectorAll('button:not(:disabled),input,a[href]')).filter(node=>!node.hidden&&node.getClientRects().length);const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    });
    q('[data-close]').focus();
    const ready=(async()=>{try{let source=await options.loadImage();if(closed)return false;if(source instanceof Blob){sourceUrl=URL.createObjectURL(source);source=sourceUrl;}image=new Image();image.src=source;await image.decode();if(closed)return false;await refresh();return true;}catch(error){if(!closed)status.textContent='Could not load the floor plan: '+error.message;return false;}})();
    active={close,ready};return active;
  }
  return {layout,compose,pointInside,bounds,open};
});
