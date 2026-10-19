const fs=require('node:fs'),path=require('node:path');
const parser=require(path.resolve('node_modules/.pnpm/@babel+parser@7.29.9/node_modules/@babel/parser'));
const root='packages/office/src/editors',base='.trellis/tasks/10-20-interaction-pptx/research';
const files=fs.readdirSync(root).filter(x=>/^Pptx.*\.tsx$/.test(x)&&!x.includes('.test.'));
const output={date:'2026-10-20',method:'Babel TSX AST. Source-only records; no record implies GUI validation. Components may contain dormant branches; dynamic maps are families, never expanded into tested interactions.',sourceFiles:[],tabs:[],groups:[],surfaces:[],staticControls:[],dynamicLabels:[],dynamicFamilies:[],selectAudit:[]};
function walk(n,fn,anc=[]){if(!n||typeof n!=='object')return;if(n.type)fn(n,anc);for(const[k,v]of Object.entries(n)){if(['loc','start','end','extra','tokens','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(x=>walk(x,fn,[...anc,n]));else if(v&&typeof v==='object')walk(v,fn,[...anc,n]);}}
for(const file of files){const f=`${root}/${file}`,src=fs.readFileSync(f,'utf8'),ast=parser.parse(src,{sourceType:'module',plugins:['typescript','jsx']});output.sourceFiles.push({path:f,lines:src.split('\n').length});const text=n=>n?src.slice(n.start,n.end):'';const rec=(n,more)=>({file:f,line:n.loc.start.line,...more});
walk(ast,(n,anc)=>{if(n.type==='JSXOpeningElement'){
 const tag=text(n.name),attrs=Object.fromEntries(n.attributes.filter(a=>a.type==='JSXAttribute').map(a=>[text(a.name),a.value]));const lab=attrs.label||attrs['aria-label'];
 if(lab&&/^(Toolbar|Button|Input|Select|Pptx|[a-z])/.test(tag)&&!['ToolbarMenuFields','ToolbarMenuNote','ToolbarPropertyForm'].includes(tag)){
  const v=lab.type==='StringLiteral'?lab.value:lab.type==='JSXExpressionContainer'&&lab.expression.type==='StringLiteral'?lab.expression.value:null;
  (v===null?output.dynamicLabels:output.staticControls).push(rec(n,{component:tag,label:v??text(lab),disabled:text(attrs.disabled)||null}));
 }
 if(tag==='ToolbarSelect'){
  const fn=anc.slice().reverse().find(a=>['FunctionDeclaration','ArrowFunctionExpression','FunctionExpression'].includes(a.type));
  output.selectAudit.push(rec(n,{owner:fn?.id?.name??'(nested callback)',label:lab?.value??text(lab),disabled:text(attrs.disabled)||null}));
 }
 if(tag==='CompactToolbar')for(const kind of ['tabs','sections']){
  const a=attrs[kind];if(a?.type==='JSXExpressionContainer')walk(a.expression,(x)=>{if(x.type!=='ObjectExpression')return;const p=Object.fromEntries(x.properties.filter(z=>z.type==='ObjectProperty').map(z=>[z.key.name||z.key.value,z.value]));if(p.key?.type==='StringLiteral'&&p.label?.type==='StringLiteral'&&(kind==='tabs'||p.tab?.type==='StringLiteral'))output[kind==='tabs'?'tabs':'groups'].push(rec(x,{key:p.key.value,label:p.label.value,...(p.tab?{tab:p.tab.value}:{})}));});
 }
 }
 if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='advancedMenu'&&n.arguments[0]?.type==='StringLiteral')output.surfaces.push(rec(n,{type:'advancedMenu',label:n.arguments[0].value}));
 if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='inspectorPanels'&&n.left.property.type==='StringLiteral')output.surfaces.push(rec(n,{type:'inspector',label:n.left.property.value}));
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='map'){
  let hasUi=false;walk(n.arguments[0],x=>{if(x.type==='JSXElement')hasUi=true});if(hasUi)output.dynamicFamilies.push(rec(n,{expression:text(n.callee.object).slice(0,350),description:'One source map family; cardinality/input/native document dependent, not GUI verified.'}));
 }
});}
output.counts=Object.fromEntries(['sourceFiles','tabs','groups','surfaces','staticControls','dynamicLabels','dynamicFamilies','selectAudit'].map(k=>[k,output[k].length]));
fs.writeFileSync(`${base}/source-inventory.json`,JSON.stringify(output,null,2)+'\n');
console.log(output.counts);
console.log(JSON.stringify(output.selectAudit.filter(x=>!x.disabled),null,2));
