// Report times shown in Sydney (display only). Run with TZ unset/UTC: the output must not depend on the device zone.
const test=require('node:test'),assert=require('node:assert/strict');
const {section,context}=require('./test-utils.cjs');
const time=section('function nowStamp()','function parseBool(');

test('stored UTC stamps render as Sydney time with AEDT/AEST', () => {
  const ctx=context(time,{});
  assert.equal(ctx.sydneyFromStored('2026-10-05 23:42'),'6 Oct 2026, 10:42 am AEDT');   // nowStamp() format, UTC
  assert.equal(ctx.sydneyFromStored('2026-10-05T23:42:10.123Z'),'6 Oct 2026, 10:42 am AEDT');
  assert.equal(ctx.sydneyFromStored('2026-10-06T10:42+11:00'),'6 Oct 2026, 10:42 am AEDT');
  assert.equal(ctx.sydneyFromStored('2026-06-30 14:05'),'1 Jul 2026, 12:05 am AEST');   // winter, crosses midnight
  assert.equal(ctx.sydneyFromStored('2026-04-04 15:30'),'5 Apr 2026, 2:30 am AEDT');    // DST ends 5 Apr 3am
  assert.equal(ctx.sydneyFromStored(''),'');
  assert.equal(ctx.sydneyFromStored(undefined),'');
  assert.equal(ctx.sydneyFromStored('yesterday'),'yesterday');
  assert.equal(ctx.sydneyStamp(new Date(Date.UTC(2026,9,5,23,42))),'6 Oct 2026, 10:42 am AEDT');
  assert.match(ctx.nowStamp(),/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);   // stored stamps stay UTC
  assert.equal(ctx.nowStamp(),new Date().toISOString().slice(0,16).replace('T',' '));
});

test('Node Schedule: header Generated and Updated column in Sydney; node data untouched', () => {
  const nodes=[{id:'n1',status:'Open',updatedAt:'2026-10-05 23:42',category:'Power',lineItem:'GPO'},{id:'n2',status:'Done',updatedAt:''}];
  const before=JSON.stringify(nodes);
  const ctx=context(time+section('function renderPrintOverviewBody','function renderPrintFullBody'),{
    renderReportCover:()=>'',renderPrintPlanHero:()=>'',floorNodes:()=>nodes,PRIMARY_OWNER_EMAIL:'o@example.com',
    escapeHtml:s=>String(s??''),nodeDisplayTitle:n=>n.id,roomLabel:()=>'-'
  });
  const html=ctx.renderPrintOverviewBody({name:'Job',address:'1 St'},{id:'f',name:'Ground'});
  assert.match(html,/Generated \d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [ap]m AE[DS]T<\/p>/);
  assert.match(html,/<td>6 Oct 2026, 10:42 am AEDT<\/td><\/tr>/);
  assert.doesNotMatch(html,/2026-10-05 23:42/);
  assert.equal(JSON.stringify(nodes),before);
});
