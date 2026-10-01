import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const dom=new JSDOM(fs.readFileSync(root+'dist/index.html','utf8'),{url:'https://menu.test/'});
const w=dom.window;
for(const k of ['window','document','location','history'])globalThis[k]=w[k]??w;
let desktop=false;globalThis.matchMedia=()=>({matches:desktop});globalThis.scrollY=0;globalThis.scrollTo=w.scrollTo=()=>{};
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
const tick=()=>new Promise(r=>setTimeout(r,5));
const $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const count=()=>$$('.dish').length;
let registered;w.document.modelContext={registerTool(t){registered=t;}};
await import(root+'dist/app.js');
assert.equal(count(),32);assert.equal($$('.recommendation-badge').length,7);assert.equal($$('.recommendation-badge img').length,0);
assert.equal($$('.spice-0 svg,.spice-null svg').length,0);
assert.ok($$('.spice-1').every(e=>e.querySelectorAll('svg').length===1));
assert.ok($$('.spice-2').every(e=>e.querySelectorAll('svg').length===2));
assert.equal($$('[data-avoid]:disabled').length,11);
$('.filter-panel').open=true;await tick();
const select=async(id,value)=>{const s=$('#'+id);s.value=value;s.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.equal($('.filter-panel').open,true);};
for(const [v,n] of [['0',11],['1',4],['2',4]]){await select('spice',v);assert.equal(count(),n);assert.ok($$('.dish .spice').every(e=>e.classList.contains('spice-'+v)));assert.equal($('.filter-results').textContent,`${n} menus found`);}
await select('spice','');await select('country','JP');assert.equal(count(),3);
assert.equal($$('.category-links a').length,2);assert.ok($$('.category-links a').every(a=>$(a.getAttribute('href'))));
await select('spice','2');assert.equal(count(),0);assert.ok($('.empty'));assert.equal($$('.category-links a').length,0);
$('[data-reset]').click();await tick();assert.equal(count(),32);assert.equal($('#spice').value,'');assert.equal($('#country').value,'all');
await select('spice','1');$('[data-lang="ja"]').click();await tick();assert.equal(count(),4);assert.equal($('#spice').value,'1');assert.ok($('.filter-panel').open);assert.equal($('.filter-results').textContent,'4件のメニュー');
$('[data-lang="zh-Hans"]').click();await tick();assert.equal($('.filter-results').textContent,'找到 4 道菜品');
$('[data-avoid="pork"]').click();assert.equal(count(),4);
const result=registered.execute({avoid:[],maxSpice:1});assert.equal(result.items.length,15);assert.equal(count(),15);await tick();assert.equal($('#spice').selectedOptions[0].textContent,'最多微辣');
// Country selection and optional tool results must describe the same visible dishes.
await select('country','JP');
const intersected=registered.execute({avoid:[],maxSpice:1});
assert.deepEqual(intersected.items.map(d=>d.id),$$('.dish').map(e=>e.id.replace('dish-','')));
assert.equal(count(),3);
// Navigation stays usable on desktop; mobile category closes after selection.
$('[data-reset]').click();desktop=true;$('[data-page="menu"]').click();
assert.ok($('#category-menu').open);$('[data-category="fried"]').click();assert.ok($('#category-menu').open);
desktop=false;$('[data-page="menu"]').click();$('#category-menu').open=true;
$('[data-category="fried"]').click();assert.equal($('#category-menu').open,false);
// Dialog modes, language switching, Escape cleanup, photo and information pages.
$('[data-detail="M006"]').focus();$('[data-detail="M006"]').click();assert.ok($('#detail').open);assert.equal(new URL(w.location).searchParams.get('menu'),'M006');
$('#detail [data-lang="ja"]').click();assert.ok($('#detail-title').textContent);assert.equal(w.document.activeElement.dataset.lang,'ja');
$('#detail [data-staff]').click();assert.ok($('#detail-title').textContent.includes('떡볶이'));
$('#detail').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal($('#detail').open,false);assert.equal(new URL(w.location).searchParams.has('menu'),false);assert.equal(w.document.activeElement.dataset.detail,'M006');
$('[data-photo="M006"]').click();assert.ok($('#detail .expanded-photo'));$('#detail [data-close]').click();
for(const [page,n] of [['how',5],['visit',2]]){$('[data-page="'+page+'"]').click();assert.equal($$('.information-block').length,n);}
$('[data-home]').click();assert.equal(count(),32);
console.log('PASS DOM interactions: filters and counts, three languages, recommendations, spice icons, country/tool consistency, desktop/mobile navigation, dialogs, photo zoom, store information.');
dom.window.close();
