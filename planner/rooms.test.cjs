const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./room-geometry.js'),E=require('./room-export.js');
const {section,context}=require('./test-utils.cjs');
const existing=[[10,10],[50,10],[50,30],[53,30],[53,45],[50,45],[50,70],[10,70]];
test('new room follows all corners of a nearby jagged shared boundary without changing its neighbour',()=>{
 const before=JSON.stringify(existing),sketch=[[50.5,10],[90,10],[90,70],[50.5,70]];
 const result=G.snapPath(sketch,[existing],{width:1000,height:1000,tolerance:14});
 assert.ok(result.snappedEdges>=1);assert.ok(result.points.some(p=>p[0]===53&&p[1]===30));assert.ok(result.points.some(p=>p[0]===53&&p[1]===45));
 assert.ok(G.validPolygon(result.points));assert.equal(JSON.stringify(existing),before);assert.equal(sketch.length,4);
});
test('snap works in either direction and accepts endpoints partway along a wall',()=>{
 const line=[[50.3,20],[50.3,60]],r=G.snapPath(line,[existing],{width:1000,height:1000,tolerance:14,closed:false});
 assert.equal(r.snappedEdges,1);assert.ok(r.points.length>=6);assert.equal(r.points[0][1],20);assert.equal(r.points.at(-1)[1],60);
 const reverse=G.snapPath(line.slice().reverse(),[existing],{width:1000,height:1000,tolerance:14,closed:false});assert.deepEqual(reverse.points,r.points.slice().reverse());
});
test('far walls, deep detours and ambiguous parallel walls are not snapped',()=>{
 const line=[[60,15],[60,65]],r=G.snapPath(line,[existing],{width:1000,height:1000,tolerance:14,closed:false});assert.equal(r.snappedEdges,0);assert.deepEqual(r.points,line);
 const deep=[[10,10],[50,10],[50,30],[75,30],[75,45],[50,45],[50,70],[10,70]];
 assert.equal(G.snapPath([[50,15],[50,65]],[deep],{width:1000,height:1000,tolerance:14,closed:false}).snappedEdges,0);
 const left=[[0,0],[49,0],[49,80],[0,80]],right=[[51,0],[100,0],[100,80],[51,80]];
 assert.equal(G.snapPath([[50,20],[50,60]],[left,right],{width:1000,height:1000,tolerance:14,closed:false}).snappedEdges,0);
});
test('snapping proximity is in screen pixels at zoom and non-square aspect ratios',()=>{
 const line=[[51,15],[51,65]];
 assert.equal(G.snapPath(line,[existing],{width:1000,height:600,tolerance:14,closed:false}).snappedEdges,1);
 assert.equal(G.snapPath(line,[existing],{width:2000,height:1200,tolerance:14,closed:false}).snappedEdges,0);
});
test('invalid crossed or collapsed room shapes cannot be saved',()=>{
 assert.equal(G.validPolygon([[0,0],[10,10],[0,10],[10,0]]),false);
 assert.equal(G.validPolygon([[0,0],[1,1],[2,2]]),false);
 assert.equal(G.validPolygon([[0,0],[10,0],[10,10],[0,10]]),true);
});
test('room opacity survives shape serialization, preserves zero and multiplies without changing the base',()=>{
 const c=context(section('function parseRoomShape(','function pointInPolygon(')+section('function roomAppearance(','function openRoomExport('),{state:{ui:{roomOpacity:.5}}});
 const shape={type:'poly',pts:[[0,0],[10,0],[10,10]],appearance:{borderOpacity:1,fillOpacity:.5}};
 const serialized=c.serializeRoomShape(shape);const parsed=c.parseRoomShape(serialized),style=c.roomAppearance({shape:parsed});
 assert.equal(style.border,.5);assert.equal(style.fill,.25);assert.equal(shape.appearance.fillOpacity,.5);
 shape.appearance.fillOpacity=0;assert.equal(c.roomAppearance({shape}).fill,0);
 const legacy={type:'poly',pts:[[0,0],[10,0],[10,10]]};assert.equal(c.serializeRoomShape(legacy),JSON.stringify(legacy));
});
test('true-to-plan export preserves position and excludes other floors by supplied selection',()=>{
 const rooms=[{id:'a',points:[[10,20],[20,20],[20,40],[10,40]]},{id:'b',points:[[70,20],[80,20],[80,40],[70,40]]}];
 const plan=E.layout(rooms,1000,1000,'plan');assert.equal(plan.cells.length,1);assert.equal(plan.cells[0].bounds.x,100);assert.equal(plan.cells[0].bounds.width,700);assert.equal(plan.cells[0].bounds.height,200);
 const side=E.layout(rooms,1000,1000,'side');assert.equal(side.cells.length,2);assert.equal(side.cells[0].bounds.width,100);assert.ok(side.width<plan.width);assert.equal(side.cells[0].scale,side.cells[1].scale);
});
test('export composition caps large canvases, rejects empty selections and clips concave shapes',()=>{
 const rooms=Array.from({length:8},(_,i)=>({id:i,points:[[0,0],[100,0],[100,100],[0,100]]}));const result=E.layout(rooms,18000,12000,'side');assert.ok(result.width<=3200);assert.ok(result.height<=3200);
 assert.throws(()=>E.layout([],1000,1000),/Select/);
 const l=[[0,0],[40,0],[40,20],[20,20],[20,40],[0,40]];assert.equal(E.pointInside([10,30],l),true);assert.equal(E.pointInside([30,30],l),false);
});
