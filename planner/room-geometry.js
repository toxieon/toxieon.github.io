/* Original room-boundary geometry. Coordinates are plan percentages; proximity is
 * measured in screen pixels so snapping stays predictable while zooming. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NDRoomGeometry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EPS=1e-7;
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const equal=(a,b)=>distance(a,b)<EPS;
  const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  function projection(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;const q=lerp(a,b,t);return {point:q,t,distance:distance(p,q)};}
  function nearest(p,polygon,tolerance){
    let best=null;
    polygon.forEach((a,i)=>{const hit=projection(p,a,polygon[(i+1)%polygon.length]);if(!best||hit.distance<best.distance)best={...hit,edge:i};});
    if(!best||best.distance>tolerance)return null;
    // Prefer an exact corner when it is almost as close as the wall projection.
    polygon.forEach((q,i)=>{const d=distance(p,q);if(d<=tolerance&&d<=best.distance+2)best={point:q.slice(),edge:i,t:0,distance:d};});
    return best;
  }
  function arc(polygon,from,to){
    const n=polygon.length,points=[from.point];
    if(from.edge===to.edge&&to.t>=from.t){points.push(to.point);return points;}
    let index=(from.edge+1)%n;
    for(let steps=0;steps<n;steps++){
      points.push(polygon[index]);
      if(index===to.edge){points.push(to.point);break;}
      index=(index+1)%n;
    }
    return clean(points);
  }
  function clean(points){return points.filter((p,i)=>!i||!equal(p,points[i-1])).map(p=>p.slice());}
  function signedArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;}
  function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
  function intersects(a,b,c,d){
    const on=(p,x,y)=>Math.abs(orient(x,y,p))<EPS&&p[0]>=Math.min(x[0],y[0])-EPS&&p[0]<=Math.max(x[0],y[0])+EPS&&p[1]>=Math.min(x[1],y[1])-EPS&&p[1]<=Math.max(x[1],y[1])+EPS;
    const ab1=orient(a,b,c),ab2=orient(a,b,d),cd1=orient(c,d,a),cd2=orient(c,d,b);
    return ((ab1>EPS&&ab2<-EPS||ab1<-EPS&&ab2>EPS)&&(cd1>EPS&&cd2<-EPS||cd1<-EPS&&cd2>EPS))||on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);
  }
  function validPolygon(points){
    if(points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||Math.abs(signedArea(points))<EPS)return false;
    for(let i=0;i<points.length;i++){
      const j=(i+1)%points.length;if(equal(points[i],points[j]))return false;
      for(let k=i+1;k<points.length;k++){const l=(k+1)%points.length;if(k===j||l===i)continue;if(intersects(points[i],points[j],points[k],points[l]))return false;}
    }
    return true;
  }
  function boundary(a,b,polygon,tolerance){
    const start=nearest(a,polygon,tolerance),end=nearest(b,polygon,tolerance);
    if(!start||!end)return null;
    const chord=distance(start.point,end.point);if(chord<Math.max(3,tolerance/2))return null;
    const routes=[arc(polygon,start,end),arc(polygon,end,start).reverse()];
    const candidates=routes.map(points=>({points,length:points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)})).filter(candidate=>{
      if(candidate.length>chord*1.8+EPS)return false;
      // Jagged corners may depart from the straight sketch, but a route around a
      // whole unrelated room or deep recess must never be inferred automatically.
      const maxDeviation=Math.max(tolerance*3,chord*.12);
      return candidate.points.every(p=>projection(p,start.point,end.point).distance<=maxDeviation);
    }).sort((x,y)=>x.length-y.length);
    if(!candidates.length)return null;
    if(candidates.length>1&&Math.abs(candidates[0].length-candidates[1].length)<1)return null;
    return {points:candidates[0].points,score:start.distance+end.distance+(candidates[0].length-chord)*.05};
  }
  function snapPath(points,rooms,options={}){
    const original=points.map(p=>p.slice());
    const width=Number(options.width),height=Number(options.height),tolerance=Math.max(3,Math.min(30,Number(options.tolerance)||12));
    if(!(width>0&&height>0)||points.length<2)return {points:original,snappedEdges:0,rejected:false};
    const toPx=p=>[p[0]*width/100,p[1]*height/100],toPlan=p=>[p[0]*100/width,p[1]*100/height];
    const polygons=(rooms||[]).filter(p=>validPolygon(p)).map(p=>p.map(toPx));
    const source=points.map(toPx),closed=options.closed!==false,out=[],edges=[],vertices=source.map(p=>p.slice());let snappedEdges=0;
    const count=closed?source.length:source.length-1;
    for(let i=0;i<count;i++){
      const a=source[i],b=source[(i+1)%source.length];
      const candidates=polygons.map(poly=>boundary(a,b,poly,tolerance)).filter(Boolean).sort((x,y)=>x.score-y.score);
      // Equal nearby walls are ambiguous. Leave the user's line alone.
      const winner=candidates[0]&&(!candidates[1]||candidates[1].score-candidates[0].score>1)?candidates[0]:null;
      edges.push(winner ? winner.points : null);
      if(winner){snappedEdges++;vertices[i]=winner.points[0];vertices[(i+1)%source.length]=winner.points[winner.points.length-1];}
    }
    edges.forEach((edge,i)=>{if(!i)out.push(vertices[i]);if(edge)edge.slice(1,-1).forEach(p=>out.push(p));out.push(vertices[(i+1)%source.length]);});
    if(closed)out.pop();
    const result=clean(out).map(toPlan);
    if(closed&&(!validPolygon(result)||Math.sign(signedArea(result))!==Math.sign(signedArea(original))||Math.abs(signedArea(result)-signedArea(original))>Math.abs(signedArea(original))*.35))return {points:original,snappedEdges:0,rejected:true};
    return {points:result,snappedEdges,rejected:false};
  }
  return {snapPath,validPolygon,projection,signedArea};
});
