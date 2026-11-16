const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadCuratedLibrary(){
  const source=fs.readFileSync(new URL('../lab-enhancements.js',`file://${__filename}`),'utf8');
  const start=source.indexOf('const reactions = [')+'const reactions = '.length;
  const end=source.indexOf('  ];',start)+3;
  const original=Function(`return (${source.slice(start,end)})`)();
  const sandbox={console,Math,Date,Promise,performance:{now:()=>0},devicePixelRatio:1,requestAnimationFrame:()=>1,cancelAnimationFrame(){},window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null}},state:{ingredients:[],labResult:null}};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../chemistry-core.js',`file://${__filename}`),'utf8'),sandbox);
  sandbox.SinceChemLab={inventory:[],compounds:[],reactions:original,itemById:new Map(),canonicalId:id=>id};
  vm.runInNewContext(fs.readFileSync(new URL('../reaction-library.js',`file://${__filename}`),'utf8'),sandbox);
  return sandbox;
}

test('library contains 50 formula-checked reactions with distinct visual profiles and source notes',()=>{
  const app=loadCuratedLibrary(),list=app.SinceChemLibrary.reactions;
  assert.equal(list.length,50);
  assert.equal(new Set(list.map(r=>r.visual.profile)).size,50);
  for(const reaction of list){
    const [left,right]=reaction.equation.split(/[→⇌]/);
    const balanced=app.SinceChem.balanceEquation(left.replace(/[↑↓]/g,''),right.replace(/[↑↓]/g,''));
    assert.ok(balanced.countsAfter.every(row=>row.balanced),reaction.id);
    assert.ok(reaction.visual.steps.length>=3,reaction.id);
    assert.ok(reaction.science.micro&&reaction.science.observation&&reaction.science.phases&&reaction.science.fact,reaction.id);
    assert.match(reaction.science.source,/^https:\/\//,reaction.id);
  }
  for(const category of ['COMBUSTION','FOAM & GAS','COLOR CHANGE','PRECIPITATION','CHEMILUMINESCENCE','RAPID REACTIONS','CRYSTALLIZATION','OXIDATION','DECOMPOSITION','ACID-BASE REACTIONS','EXOTHERMIC & ENDOTHERMIC'])assert.ok(list.some(r=>r.category===category),category);
});

test('corrects sodium oxidation product, non-chemical crystallization, and neutralization appearance',()=>{
  const app=loadCuratedLibrary(),byId=new Map(app.SinceChemLibrary.reactions.map(r=>[r.id,r]));
  assert.equal(byId.get('sodium-oxide').equation,'2Na + O₂ → Na₂O₂');
  assert.equal(byId.get('sodium-acetate-crystallization').science.nonChemical,true);
  assert.equal(byId.get('neutralization-hcl').effect,'heat');
  assert.doesNotMatch(byId.get('neutralization-hcl').science.observation,/меняет цвет/i);
});
