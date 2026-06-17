/* =========================================================================
 *  SWB Sheet Build Kit v2.0  —  paste-&-run Google Apps Script
 *  Run from INSIDE the ND_SWB_Reference spreadsheet:
 *    Extensions ▸ Apps Script ▸ paste ▸ Run buildSWBReferenceTabs()
 *
 *  Idempotent: creates the v2.0 tabs the engine reads (LoadGroups + Dev_*),
 *  writes headers + seed rows ONLY when a tab is newly created, and never
 *  touches your existing tabs (c9_table, C1_MAX, C2_MAX, C8_VOL, BreakerBrands,
 *  CableCCC, VoltageDrop, Derating).
 *
 *  ⚠ Standard figures are NOT authoritative here. Every seeded numeric param
 *  is written with verified=FALSE. A licensed electrician must confirm each
 *  against AS/NZS 3000 Appendix C (Tables C1/C2 + footnotes) and flip the flag.
 * ========================================================================= */

function buildSWBReferenceTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab_(ss, "LoadGroups", LOADGROUPS_HEADER_, LOADGROUPS_SEED_);
  DEV_TABS_.forEach(function (t) { ensureTab_(ss, t.name, DEV_HEADER_, t.seed || []); });
  SpreadsheetApp.getUi && SpreadsheetApp.getUi().alert("SWB v2.0 tabs ready. Review LoadGroups params against AS/NZS 3000 C1/C2 and flip verified=TRUE.");
}

/* Create a tab with header+seed if missing; leave it untouched if it exists. */
function ensureTab_(ss, name, header, seed) {
  var sh = ss.getSheetByName(name);
  if (sh) return; // never clobber edits
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
  if (seed && seed.length) sh.getRange(2, 1, seed.length, header.length).setValues(seed);
  sh.setFrozenRows(1);
}

/* ── LoadGroups — encodes the C1/C2 assessment rule PER GROUP (not hard-coded
 * in the app). The engine reads rule_type + params from here. Params reflect
 * the framework's reading of AS/NZS 3000 Table C1/C2; all verified=FALSE until
 * confirmed against the Standard.
 * cols: group, column, rule_type, param1, param2, threshold, footnote, standardRef, verified
 * --------------------------------------------------------------------------- */
var LOADGROUPS_HEADER_ = ["group","column","rule_type","param1","param2","threshold","footnote","standardRef","verified"];
var LOADGROUPS_SEED_ = [
  // A — Lighting: per-point allowance (A per point). CONFIRM the per-point figure.
  ["A","single-domestic","per_point",   0.5, "", "", "Lighting points/circuits", "AS/NZS 3000 Table C1 Grp A", "FALSE"],
  // B — Socket outlets (10A): largest-plus-percentage pattern. CONFIRM params.
  ["B","single-domestic","largest_plus_pct", 100, 0, "", "First circuit full + remainder per footnote", "AS/NZS 3000 Table C1 Grp B", "FALSE"],
  // C — Cooking: 50% of connected load (footnote 8).
  ["C","single-domestic","pct_connected", 50, "", "", "Footnote 8 — 50% of connected", "AS/NZS 3000 Table C1 Grp C", "FALSE"],
  // D — AC / fixed space heating: ~75% factor; AC takes larger of heat/cool.
  ["D","single-domestic","pct_connected", 75, "", "", "Larger of heating/cooling rating", "AS/NZS 3000 Table C1 Grp D", "FALSE"],
  // E — Instantaneous / quick-recovery water heaters: W/L threshold (footnote 12).
  ["E","single-domestic","wpl_threshold", 100, 33.3, 100, "Footnote 12 — W/L threshold", "AS/NZS 3000 Table C1 Grp E", "FALSE"],
  // F — Storage (controlled) water heaters: per footnote 13.
  ["F","single-domestic","pct_connected", 100, "", "", "Footnote 13 — controlled load", "AS/NZS 3000 Table C1 Grp F", "FALSE"],
  // G — Spa / pool heaters: ~75% factor.
  ["G","single-domestic","pct_connected", 75, "", "", "Spa/pool heating", "AS/NZS 3000 Table C1 Grp G", "FALSE"],
  // Motors (lift/pump/fan): largest at full + 50% of remaining motor currents.
  ["motor","single-domestic","largest_plus_pct", 100, 50, "", "Largest motor full + 50% of remainder", "AS/NZS 3000 Table C1 Motors", "FALSE"]
];

/* ── Device library tabs — one per category, shared v2.0 column schema
 * (framework §1.1). Seeded from the UEEEL0018 worksheet examples (framework §10);
 * EXTEND freely — the app reads every Dev_* tab on each sync and auto-extends.
 * cols: id,name,category,loadGroup,defaultValue,unit,min,max,step,voltage,phase,
 *       powerFactor,litres,elementW,heatingW,coolingW,flcOverride,dedicated,
 *       defaultBreakerA,rcdRequired,standardRef,notes,active
 * --------------------------------------------------------------------------- */
var DEV_HEADER_ = ["id","name","category","loadGroup","defaultValue","unit","min","max","step","voltage","phase","powerFactor","litres","elementW","heatingW","coolingW","flcOverride","dedicated","defaultBreakerA","rcdRequired","standardRef","notes","active"];

function dev_(id,name,cat,grp,val,unit,min,max,step,extra){
  extra = extra || {};
  return [id,name,cat,grp,val,unit,min,max,step,
    extra.voltage||230, extra.phase||1, extra.pf||1.0,
    extra.litres||"", extra.elementW||"", extra.heatingW||"", extra.coolingW||"",
    extra.flc||"", extra.ded?"TRUE":"FALSE", extra.breaker||"", extra.rcd?"TRUE":"FALSE",
    extra.ref||"AS/NZS 3000:2018", extra.notes||"", "TRUE"];
}

var DEV_TABS_ = [
  { name:"Dev_Lighting", seed:[
    dev_("lt_led10","LED downlight 10W","Lighting","A",10,"W",5,20,1),
    dev_("lt_fl28","Fluoro 28W","Lighting","A",28,"W",10,40,1),
    dev_("lt_fl36","Twin fluoro 36W","Lighting","A",36,"W",18,72,1),
    dev_("lt_ef50","Exhaust fan 50W","Lighting","A",50,"W",20,100,5),
    dev_("lt_hb_mv","High-bay MV","Lighting","A",1.7,"A",1,3,0.1)
  ]},
  { name:"Dev_Power", seed:[
    dev_("po_g1_10","Single GPO 10A","Power","B",1.0,"A",0.5,2,0.1,{breaker:20}),
    dev_("po_g2_10","Double GPO 10A","Power","B",1.0,"A",0.5,2,0.1,{breaker:20}),
    dev_("po_g1_15","Single GPO 15A","Power","B",1.5,"A",1,2,0.1,{breaker:16}),
    dev_("po_g2_15","Double GPO 15A","Power","B",1.5,"A",1,2,0.1,{breaker:16}),
    dev_("po_g1_20","Single GPO 20A","Power","B",2.0,"A",1.5,2.5,0.1,{breaker:20}),
    dev_("po_g2_20","Double GPO 20A","Power","B",2.0,"A",1.5,2.5,0.1,{breaker:20})
  ]},
  { name:"Dev_Cooking", seed:[
    dev_("ck_640","Cooktop 6.4kW","Cooking","C",6400,"W",3000,9000,100,{ded:true,breaker:32}),
    dev_("ck_ov35","Wall oven 3.5kW","Cooking","C",3500,"W",2000,6000,100,{ded:true,breaker:20}),
    dev_("ck_ov48","Wall oven 4.8kW","Cooking","C",4800,"W",2000,6000,100,{ded:true,breaker:25}),
    dev_("ck_rg69","Range 6.9kW","Cooking","C",6900,"W",4000,10000,100,{ded:true,breaker:32})
  ]},
  { name:"Dev_HVAC", seed:[
    dev_("ac_rc245","Reverse-cycle ducted","HVAC","D",24.5,"A",10,40,0.5,{ded:true,breaker:32,heatingW:6900,coolingW:9200}),
    dev_("ac_sp92","Split 9.2kW cool","HVAC","D",11.4,"A",5,20,0.1,{ded:true,breaker:16,coolingW:9200,heatingW:6900}),
    dev_("ac_sh52","Space heater 5.2kW","HVAC","D",5200,"W",2000,6000,100,{ded:true,breaker:25})
  ]},
  { name:"Dev_WaterHeating", seed:[
    dev_("wh_st250","Storage 3.6kW/250L","Water heating","F",3600,"W",2000,5000,100,{ded:true,breaker:20,litres:250,elementW:3600}),
    dev_("wh_st46","Storage 4.6kW","Water heating","F",4600,"W",2000,6000,100,{ded:true,breaker:25,litres:315,elementW:4600}),
    dev_("wh_in69","Instantaneous 50L 6.9kW","Water heating","E",6900,"W",3000,10000,100,{ded:true,breaker:40,litres:50,elementW:6900}),
    dev_("wh_qr24","Quick-recovery 20L 2.4kW","Water heating","E",2400,"W",1500,4000,100,{ded:true,breaker:16,litres:20,elementW:2400})
  ]},
  { name:"Dev_Motors", seed:[
    dev_("mo_lift30","Lift 30A (1ph)","Motors","motor",30,"A",10,40,1,{ded:true,breaker:40,flc:30,notes:"125% largest motor"}),
    dev_("mo_pump15","Water-pressure pump 15A","Motors","motor",15,"A",5,20,1,{ded:true,breaker:16,flc:15}),
    dev_("mo_fan20","Ventilation fan 20A","Motors","motor",20,"A",5,25,1,{ded:true,breaker:20,flc:20})
  ]},
  { name:"Dev_ThreePhase", seed:[
    dev_("tp_4kw","4kW 400V motor","Motors","motor",4000,"W",2000,8000,100,{voltage:400,phase:3,pf:0.80,ded:true,breaker:16}),
    dev_("tp_62kw","6.2kW 400V motor","Motors","motor",6200,"W",3000,10000,100,{voltage:400,phase:3,pf:0.82,ded:true,breaker:20}),
    dev_("tp_socket32","3-phase 32A socket","Power","B",32,"A",16,32,1,{voltage:400,phase:3,breaker:32})
  ]},
  { name:"Dev_EVSolar", seed:[
    dev_("ev_32","EV charger 32A","EV / Solar","B",32,"A",10,32,1,{ded:true,breaker:32,rcd:true}),
    dev_("sol_inv","Solar inverter","EV / Solar","B",0,"A",0,40,1,{ded:true})
  ]},
  { name:"Dev_Custom", seed:[] }
];
