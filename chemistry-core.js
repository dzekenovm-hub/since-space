(() => {
  const symbols = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
  const subscriptDigits = '₀₁₂₃₄₅₆₇₈₉';
  const toAscii = value => String(value).replace(/[₀-₉]/g, digit => String(subscriptDigits.indexOf(digit))).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, digit => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(digit)));
  const toSubscript = value => String(value).replace(/[0-9]/g, digit => subscriptDigits[Number(digit)]);
  const gcd = (a,b) => b ? gcd(b,a%b) : Math.abs(a);
  const lcm = (a,b) => a && b ? Math.abs(a*b)/gcd(a,b) : 0;
  const formulaKey = formula => toAscii(formula).replace(/[\s.·]/g,'').replace(/\^(\d+)?[+-]$/,'').replace(/[+-]\d*$/,'');

  function parseFormula(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Введи химическую формулу.');
    let text = toAscii(source).replace(/\s/g,'');
    let charge = 0;
    const caretCharge = text.match(/\^(\d+)?([+-])$/);
    const trailingCharge = caretCharge ? null : text.match(/([+-])(\d*)$/);
    if (caretCharge) {
      charge = Number(caretCharge[1] || 1) * (caretCharge[2] === '+' ? 1 : -1);
      text = text.slice(0,caretCharge.index);
    } else if (trailingCharge) {
      charge = Number(trailingCharge[2] || 1) * (trailingCharge[1] === '+' ? 1 : -1);
      text = text.slice(0,trailingCharge.index);
    }
    if (!text) throw new Error('В формуле нет атомов.');
    const atoms = {};
    const add = (target, sourceAtoms, multiplier=1) => { for (const [symbol,count] of Object.entries(sourceAtoms)) target[symbol]=(target[symbol]||0)+count*multiplier; };
    const parseSegment = (segment) => {
      let i=0;
      const parseGroup = closing => {
        const result={}; let found=false;
        while(i<segment.length){
          const ch=segment[i];
          if(ch===')'||ch===']') { if(ch!==closing) throw new Error('Проверь скобки в формуле.'); i++; return result; }
          if(ch==='('||ch==='['){found=true;i++;const inner=parseGroup(ch==='('?')':']');if(!Object.keys(inner).length)throw new Error('Пустая группа в скобках.');const multiplier=readMultiplier();add(result,inner,multiplier);continue;}
          const match=segment.slice(i).match(/^([A-Z][a-z]?)/);
          if(!match) throw new Error(`Не понимаю часть формулы рядом с «${segment.slice(i)}».`);
          const symbol=match[1];if(!symbols.has(symbol))throw new Error(`Неизвестный химический символ: ${symbol}.`);
          i+=symbol.length;const count=readMultiplier();result[symbol]=(result[symbol]||0)+count;found=true;
        }
        if(closing)throw new Error('Не закрыта скобка в формуле.');
        if(!found)throw new Error('Формула не содержит элементов.');
        return result;
      };
      const readMultiplier=()=>{const match=segment.slice(i).match(/^\d+/);if(!match)return 1;const value=Number(match[0]);if(value<1||value>999)throw new Error('Индекс должен быть от 1 до 999.');i+=match[0].length;return value;};
      const leading=segment.match(/^(\d+)(?=[A-Z([{])/);let multiplier=1;if(leading){multiplier=Number(leading[1]);i=leading[1].length;}
      const composition=parseGroup(null);const scaled={};add(scaled,composition,multiplier);return scaled;
    };
    const segments=text.split(/[·.]/);if(segments.some(part=>!part))throw new Error('Проверь точку-разделитель в формуле.');
    for(const segment of segments)add(atoms,parseSegment(segment));
    return {formula:source.trim(),atoms,charge};
  }

  function parseSide(source) {
    if(typeof source!=='string'||!source.trim())throw new Error('Заполни обе стороны уравнения.');
    return source.split(/\s+\+\s+/).map(raw=>{
      const term=raw.trim();const match=term.match(/^(\d+)\s*(.+)$/);const coefficient=match?Number(match[1]):1;const formula=(match?match[2]:term).trim();
      if(coefficient<1||coefficient>999)throw new Error('Коэффициент должен быть от 1 до 999.');
      return{coefficient,formula,composition:parseFormula(formula)};
    });
  }
  function sumSide(terms) {
    const atoms={},charge=terms.reduce((sum,term)=>sum+term.coefficient*term.composition.charge,0);
    for(const term of terms)for(const [symbol,count] of Object.entries(term.composition.atoms))atoms[symbol]=(atoms[symbol]||0)+term.coefficient*count;
    return{atoms,charge};
  }
  function atomTable(left,right) {
    const a=sumSide(left),b=sumSide(right);const elements=[...new Set([...Object.keys(a.atoms),...Object.keys(b.atoms)])].sort((x,y)=>symbolsOrder(x)-symbolsOrder(y));
    return elements.map(symbol=>({symbol,left:a.atoms[symbol]||0,right:b.atoms[symbol]||0,balanced:(a.atoms[symbol]||0)===(b.atoms[symbol]||0)})).concat(a.charge||b.charge?[{symbol:'заряд',left:a.charge,right:b.charge,balanced:a.charge===b.charge}]:[]);
  }
  function symbolsOrder(symbol){return [...symbols].indexOf(symbol)}
  function sameCounts(left,right){return atomTable(left,right).every(row=>row.balanced)}
  function matrixFor(left,right) {
    const all=[...left,...right],elements=[...new Set(all.flatMap(term=>Object.keys(term.composition.atoms)))].sort((a,b)=>symbolsOrder(a)-symbolsOrder(b));
    if(all.some(term=>term.composition.charge))elements.push('charge');
    return elements.map(element=>all.map((term,index)=>{const value=element==='charge'?term.composition.charge:term.composition.atoms[element]||0;return index<left.length?value:-value;}));
  }
  function rref(matrix) {
    const a=matrix.map(row=>row.slice()),rows=a.length,cols=a[0]?.length||0,pivots=[];let r=0;
    for(let c=0;c<cols&&r<rows;c++){
      let pivot=r;for(let n=r+1;n<rows;n++)if(Math.abs(a[n][c])>Math.abs(a[pivot][c]))pivot=n;
      if(Math.abs(a[pivot][c])<1e-10)continue;
      [a[r],a[pivot]]=[a[pivot],a[r]];const div=a[r][c];for(let k=c;k<cols;k++)a[r][k]/=div;
      for(let n=0;n<rows;n++)if(n!==r){const factor=a[n][c];if(Math.abs(factor)>1e-10)for(let k=c;k<cols;k++)a[n][k]-=factor*a[r][k];}
      pivots.push(c);r++;
    }
    return{matrix:a,pivots,free:Array.from({length:cols},(_,i)=>i).filter(i=>!pivots.includes(i))};
  }
  function integerVector(values) {
    if(values.some(n=>!Number.isFinite(n)||Math.abs(n)<1e-9))return null;
    if(values.every(n=>n<0))values=values.map(n=>-n);if(values.some(n=>n<=0))return null;
    const fractions=values.map(value=>{let best=[Math.round(value),1],error=Math.abs(value-best[0]);for(let d=1;d<=500;d++){const n=Math.round(value*d),e=Math.abs(value-n/d);if(e<error){best=[n,d];error=e;}if(error<1e-9)break;}return best;});
    if(fractions.some(([n,d],i)=>Math.abs(values[i]-n/d)>1e-6))return null;
    const multiplier=fractions.reduce((acc,[,den])=>lcm(acc,den),1);let nums=fractions.map(([num,den])=>num*(multiplier/den));const divisor=nums.reduce((acc,n)=>gcd(acc,n),0);nums=nums.map(n=>n/divisor);return nums.every(n=>n<=999)?nums:null;
  }
  function balanceVector(matrix) {
    const {matrix:rrefMatrix,pivots,free}=rref(matrix);if(!free.length)throw new Error('Для этих веществ не найдено ненулевое решение.');
    const makeVector=values=>{const vector=Array(matrix[0].length).fill(0);free.forEach((col,i)=>vector[col]=values[i]);pivots.forEach((col,row)=>{vector[col]=-free.reduce((sum,freeCol,i)=>sum+rrefMatrix[row][freeCol]*values[i],0);});return vector;};
    let candidates=[];const search=(index,values)=>{if(index===free.length){const result=integerVector(makeVector(values));if(result)candidates.push(result);return;}for(let n=1;n<=12;n++){values[index]=n;search(index+1,values);}};
    if(free.length>4)throw new Error('Уравнение неоднозначно. Упрости список веществ и попробуй ещё раз.');search(0,[]);
    if(!candidates.length)throw new Error('Не удалось найти положительные коэффициенты для этих продуктов. Проверь формулы и состав реакции.');
    candidates.sort((a,b)=>a.reduce((x,y)=>x+y,0)-b.reduce((x,y)=>x+y,0));return candidates[0];
  }
  function formatTerms(terms,coefficients) { return terms.map((term,index)=>`${coefficients[index]===1?'':coefficients[index]}${term.formula}`).join(' + '); }
  function explainBalance(left,right,coefficients) {
    const all=[...left,...right],steps=[];coefficients.forEach((value,index)=>{if(value>1)steps.push(`Поставь коэффициент ${value} перед ${all[index].formula}; индекс в формуле остаётся прежним.`);});
    const balancedLeft=left.map((term,i)=>({...term,coefficient:coefficients[i]})),balancedRight=right.map((term,i)=>({...term,coefficient:coefficients[left.length+i]}));
    const atomCounts=atomTable(balancedLeft,balancedRight);
    if(!steps.length)steps.push('Число атомов каждого элемента слева и справа уже одинаковое.');
    steps.push(...atomCounts.filter(row=>row.symbol!=='заряд').map(row=>`${row.symbol}: ${row.left} слева и ${row.right} справа.`));
    return steps;
  }
  function balanceEquation(leftSource,rightSource) {
    const left=parseSide(leftSource),right=parseSide(rightSource);let coefficients;
    if(sameCounts(left,right)){coefficients=[...left.map(term=>term.coefficient),...right.map(term=>term.coefficient)];const divisor=coefficients.reduce((value,n)=>gcd(value,n),0)||1;coefficients=coefficients.map(n=>n/divisor)}
    else coefficients=balanceVector(matrixFor(left,right));
    const balancedLeft=left.map((term,i)=>({...term,coefficient:coefficients[i]})),balancedRight=right.map((term,i)=>({...term,coefficient:coefficients[left.length+i]}));
    return{left:balancedLeft,right:balancedRight,equation:`${formatTerms(left,coefficients.slice(0,left.length))} → ${formatTerms(right,coefficients.slice(left.length))}`,countsBefore:atomTable(left,right),countsAfter:atomTable(balancedLeft,balancedRight),steps:explainBalance(left,right,coefficients),coefficients};
  }
  function renderFormula(formula) { const normalized=String(formula).replace(/[₀-₉]/g,digit=>String(subscriptDigits.indexOf(digit))).replace(/(?<=[A-Za-z)\]])1(?!\d)/g,'');return normalized.replace(/[0-9]+/g,match=>toSubscript(match)); }

  const databaseName='since-space-chemistry';let databasePromise;
  function openDatabase(){if(databasePromise)return databasePromise;databasePromise=new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(new Error('IndexedDB недоступна в этом браузере.'));return;}const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>{const db=request.result;for(const store of ['inventory','equations','experiments'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Не удалось открыть базу CHEM LAB.'));}).catch(error=>{databasePromise=null;throw error;});return databasePromise;}
  async function storeAction(store,mode,action){const db=await openDatabase();return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode),objectStore=transaction.objectStore(store);let result;try{result=action(objectStore);}catch(error){reject(error);return;}transaction.oncomplete=()=>resolve(result?.result);transaction.onerror=()=>reject(transaction.error);});}
  const chemistryDB={
    async getAll(store='inventory'){const db=await openDatabase();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});},
    async get(store,id){const db=await openDatabase();return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});},
    async put(store,value){return storeAction(store,'readwrite',objectStore=>objectStore.put(value));},
    async delete(store,id){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});},
    async addInventory(item){const key=formulaKey(item.formula),existing=await this.get('inventory',key);const value={id:key,formula:item.formula.trim(),name:item.name||item.formula,amount:Number(item.amount||1)+(existing?.amount||0),updatedAt:Date.now(),source:item.source||'builder'};await this.put('inventory',value);return value;},
    async removeInventory(id){return this.delete('inventory',id);},
    async saveEquation(value){const entry={...value,id:value.id||`eq-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,createdAt:Date.now()};await this.put('equations',entry);return entry;},
    async recordExperiment(value){const entry={...value,id:`run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,createdAt:Date.now()};await this.put('experiments',entry);return entry;}
  };
  globalThis.SinceChem={parseFormula,parseSide,atomTable,balanceEquation,formulaKey,renderFormula,chemistryDB,elementSymbols:[...symbols]};
})();
