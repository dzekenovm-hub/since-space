const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const sandbox={console,Math,Date,Promise,devicePixelRatio:1,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null}},state:{ingredients:[],labResult:null}};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../chemistry-core.js',`file://${__filename}`),'utf8'),sandbox);
  sandbox.SinceChemLab={inventory:[
    {id:'el-Na',formula:'Na',name:'Натрий'},{id:'cmp-Cl2',formula:'Cl₂',name:'Хлор'},
    {id:'el-Mg',formula:'Mg',name:'Магний'},{id:'cmp-O2',formula:'O₂',name:'Кислород'}
  ],compounds:[],canonicalId:id=>id,prepareLabItem:item=>item,itemById:new Map(),reactions:[
    {id:'salt',title:'Хлорид натрия',category:'Соединение',reactants:['el-Na','cmp-Cl2'],equation:'2Na + Cl₂ → 2NaCl',products:'NaCl',description:'Соль',condition:'',effect:'heat',color:'#fff'},
    {id:'magnesium',title:'Оксид магния',category:'Оксиды',reactants:['el-Mg','cmp-O2'],equation:'2Mg + O₂ → 2MgO',products:'MgO',description:'Оксид',condition:'Нагревание',effect:'light',color:'#fff'}
  ]};
  for(const item of sandbox.SinceChemLab.inventory)sandbox.SinceChemLab.itemById.set(item.id,item);
  vm.runInNewContext(fs.readFileSync(new URL('../chem-modes.js',`file://${__filename}`),'utf8'),sandbox);
  return sandbox;
}

test('reaction lab matches normalized formulas and computes limited yield',()=>{
  const app=setup();
  app.state.ingredients=[{id:'el-Na',formula:'Na',amount:1},{id:'cmp-Cl2',formula:'Cl₂',amount:1}];
  const salt=app.labReactionEngine();
  assert.equal(salt.title,'Хлорид натрия');
  assert.equal(salt.simulation.extent,.5);
  assert.equal(salt.simulation.productAmount,'1 моль NaCl');
  app.state.ingredients=[{id:'el-Mg',formula:'Mg',amount:2},{id:'cmp-O2',formula:'O₂',amount:1}];
  assert.equal(app.labReactionEngine().simulation.productAmount,'2 моль MgO');
});

test('user supplied equation is previewed only when selected reagent formulas match',()=>{
  const app=setup();
  app.state.customEquation={left:'H₂ + O₂',right:'H₂O',balanced:'2H₂ + O₂ → 2H₂O'};
  app.state.ingredients=[{formula:'H₂'},{formula:'O₂'}];
  assert.match(app.labReactionEngine().equation,/2H₂ \+ O₂ → 2H₂O/);
  app.state.ingredients=[{formula:'H₂'},{formula:'N₂'}];
  assert.equal(app.labReactionEngine(),null);
});
