/* Cliente sin secretos: autorización y descuentos de inventario se ejecutan en PostgreSQL. */
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let businessSettings={name:'Mi Puesto • Barbacoa y Café',ticket_message:'¡Gracias por su compra!'};let activeCategory='todos';const categoryLabels={todos:'🍽️ Todos',barbacoa:'🌮 Barbacoa',lonches:'🥖 Lonches',vapor:'🫔 Al vapor',cafe:'☕ Café',combos:'🎁 Combos',otros:'🍴 Otros'};let db,user,role='seller',products=[],ingredients=[],recipes=[],cart={},modifiers=[],comboParts=[],sales=[],reorderRows=[],lastTicket=null;
function toast(msg){$('notice').textContent=msg;$('notice').classList.add('show');setTimeout(()=>$('notice').classList.remove('show'),4500)}
function fail(e){toast('Error: '+(e?.message||e))}function check(r){if(r.error)throw r.error;return r.data}
// Configuración permanente: primero archivo de despliegue, después almacenamiento local.
// No almacenar contraseñas ni claves secretas; solo URL y clave pública de Supabase.
const CONFIG_STORAGE_KEY='pos-config';
function validConfig(c){return !!(c && typeof c.url==='string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url.trim()) && typeof c.key==='string' && c.key.trim())}
function savedConfig(){try{const raw=localStorage.getItem(CONFIG_STORAGE_KEY);return raw?JSON.parse(raw):null}catch(e){return null}}
function config(){const fixed=window.POS_PUBLIC_CONFIG;if(validConfig(fixed))return {url:fixed.url.trim().replace(/\/$/,''),key:fixed.key.trim()};const local=savedConfig();return validConfig(local)?{url:local.url.trim().replace(/\/$/,''),key:local.key.trim()}:null}
function showSetup(message){$('setup').hidden=false;$('auth').hidden=true;$('app').hidden=true;$('logout').hidden=true;if(message)$('status').textContent=message;const c=savedConfig();if(c){$('url').value=c.url||'';$('key').value=c.key||''}}
async function init(){
 const c=config();if(!c){showSetup('Configuración inicial pendiente');return}
 $('setup').hidden=true;$('status').textContent='Conectando a la base de datos…';
 try{
  if(!window.supabase?.createClient)throw new Error('No se pudo cargar la biblioteca Supabase. Verifica tu conexión a internet.');
  db=supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await db.auth.getSession();if(error)throw error;
  await sessionChanged(data?.session||null);
  db.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>sessionChanged(s).catch(fail),0)});
 }catch(e){
  // Un fallo de red o de autenticación NO elimina ni solicita nuevamente la configuración.
  fail(e);$('status').textContent='No se pudo conectar. Revisa internet y recarga.';
  $('auth').hidden=false;
 }
}
async function sessionChanged(session){
 user=session?.user||null;
 $('auth').hidden=!!user;$('app').hidden=!user;$('logout').hidden=!user;$('setup').hidden=true;
 if(!user){role='seller';$('status').textContent='Inicia sesión';return}
 const profile=check(await db.from('profiles').select('role,enabled').eq('id',user.id).single());
 if(profile.enabled===false){await db.auth.signOut();throw new Error('Cuenta deshabilitada. Contacta a gerencia.')}
 role=profile.role||'seller';
 $('status').textContent=(role==='manager'?'Gerente general':role==='admin'?'Administrador':'Vendedor')+' · '+user.email;
 document.querySelector('[data-tab="admin"]').hidden=!['admin','manager'].includes(role);
 document.querySelector('[data-tab="supervision"]').hidden=!['admin','manager'].includes(role);
 document.querySelector('[data-tab="manager"]').hidden=role!=='manager';
 await load();if(role==='manager')await loadManager();
}
$('saveConfig').onclick=()=>{
 const url=$('url').value.trim().replace(/\/$/,''),key=$('key').value.trim();
 if(!validConfig({url,key}))return toast('Verifica URL y clave pública de Supabase');
 try{
  localStorage.setItem(CONFIG_STORAGE_KEY,JSON.stringify({url,key}));
  if(!validConfig(savedConfig()))throw new Error('No se pudo verificar el almacenamiento');
  location.reload();
 }catch(e){toast('El navegador impide guardar datos. Configura config.js en el servidor para una conexión permanente.');}
};
$('login').onclick=async()=>{try{if(!db)throw new Error('Sin conexión a Supabase. Revisa internet y recarga.');check(await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}));}catch(e){fail(e)}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{if(b.hidden)return;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==b.dataset.tab)});
async function load(){try{[products,ingredients,recipes,modifiers,comboParts]=await Promise.all([db.from('products').select('*').eq('active',true).order('name').then(check),db.from('ingredients').select('*').order('name').then(check),db.from('recipes').select('*').then(check),db.from('modifiers').select('*').eq('active',true).then(check),db.from('combo_parts').select('*').then(check)]);render()}catch(e){fail(e)}}
function options(items){return items.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}
function render(){ const cats=['todos',...new Set(products.map(p=>p.category||'otros'))];$('categories').innerHTML=cats.map(c=>`<button class="category ${c===activeCategory?'selected':''}" data-cat="${escapeHtml(c)}">${escapeHtml(categoryLabels[c]||c)}</button>`).join('');document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;render()});$('products').innerHTML=products.filter(p=>activeCategory==='todos'||(p.category||'otros')===activeCategory).map(p=>`<button class="tile" data-id="${p.id}"><span class="emoji">${escapeHtml(p.emoji||'🍽️')}</span><strong>${escapeHtml(p.name)}</strong><small>${money(p.price)}</small></button>`).join('');document.querySelectorAll('.tile').forEach(b=>b.onclick=()=>chooseProduct(b.dataset.id));renderCart();$('ingredients').innerHTML=table(['Insumo','Existencia','Mínimo'],ingredients.map(i=>[i.name,`${i.stock} ${i.unit}`,`${i.min_stock} ${i.unit}`]));reorderRows=ingredients.filter(i=>Number(i.stock)<=Number(i.min_stock)).map(i=>({name:i.name,unit:i.unit,stock:i.stock,min:i.min_stock,order:Math.max(0,Number(i.target_stock)-Number(i.stock))}));$('reorder').innerHTML=reorderRows.length?table(['Insumo','Existencia','Comprar'],reorderRows.map(i=>[i.name,`${i.stock} ${i.unit}`,`${i.order.toFixed(3)} ${i.unit}`])):'Sin insumos por reordenar';$('ingredientSelect').innerHTML=options(ingredients);$('recipeIngredient').innerHTML=options(ingredients);$('recipeProduct').innerHTML=options(products);$('comboPart1').innerHTML=options(products.filter(p=>!p.is_combo));$('comboPart2').innerHTML=options(products.filter(p=>!p.is_combo));$('modIngredient').innerHTML='<option value="">Sin consumo adicional</option>'+options(ingredients);$('modifiersTable').innerHTML=table(['Grupo','Opción','Cargo'],modifiers.map(m=>[m.group_name,m.name,money(m.price_delta)]));$('comboTable').innerHTML=table(['Combo','Componente','Cantidad'],comboParts.map(c=>[products.find(p=>p.id===c.combo_id)?.name||'—',products.find(p=>p.id===c.product_id)?.name||'—',c.quantity]));$('recipes').innerHTML=table(['Producto','Insumo','Por unidad'],recipes.map(r=>[products.find(p=>p.id===r.product_id)?.name||'—',ingredients.find(i=>i.id===r.ingredient_id)?.name||'—',r.quantity]));renderProduction()}
function table(headers,rows){return `<div style="overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
// Cada línea representa una configuración específica (producto, tamaño, leche y extras).
function chooseProduct(id){const p=products.find(x=>x.id===id);if(!p)return;if(p.category==='cafe' && !p.is_combo){$('customProduct').textContent=p.name;$('customOptions').innerHTML='';const groups=[...new Set(modifiers.map(m=>m.group_name))];for(const group of groups){const label=document.createElement('label');label.textContent=group;const select=document.createElement('select');select.dataset.group=group;select.innerHTML='<option value="">Sin cambio</option>'+modifiers.filter(m=>m.group_name===group).map(m=>`<option value="${m.id}">${escapeHtml(m.name)} (${m.price_delta>=0?'+':''}${money(m.price_delta)})</option>`).join('');label.appendChild(select);$('customOptions').appendChild(label)}$('customDialog').hidden=false;$('customDialog').dataset.product=id;return}addCart(id,[])}
function addCart(id,mods){const p=products.find(x=>x.id===id);if(!p)return;const key=id+'|'+mods.slice().sort().join(',');if(!cart[key])cart[key]={product_id:id,modifiers:mods.slice(),quantity:0};cart[key].quantity++;renderCart()}
$('customAdd').onclick=()=>{const mods=[...$('customOptions').querySelectorAll('select')].map(x=>x.value).filter(Boolean);addCart($('customDialog').dataset.product,mods);$('customDialog').hidden=true};
$('customCancel').onclick=()=>{$('customDialog').hidden=true};
function linePrice(item){const p=products.find(x=>x.id===item.product_id);return Number(p?.price||0)+item.modifiers.reduce((sum,id)=>sum+Number(modifiers.find(m=>m.id===id)?.price_delta||0),0)}
function total(){return Object.values(cart).reduce((a,i)=>a+linePrice(i)*i.quantity,0)}
function renderCart(){$('cart').innerHTML=Object.entries(cart).map(([key,i])=>{const p=products.find(x=>x.id===i.product_id);if(!p)return '';const extras=i.modifiers.map(id=>modifiers.find(m=>m.id===id)?.name).filter(Boolean).join(', ');return `<div class="line"><span class="grow">${escapeHtml(p.name)} × ${i.quantity}${extras?`<br><small>${escapeHtml(extras)}</small>`:''}<br><small>${money(linePrice(i)*i.quantity)}</small></span><button data-minus="${escapeHtml(key)}">−</button><button data-plus="${escapeHtml(key)}">+</button></div>`}).join('')||'<p class="muted">Selecciona un producto para empezar.</p>';document.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{const k=b.dataset.minus;cart[k].quantity--;if(cart[k].quantity<=0)delete cart[k];renderCart()});document.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{cart[b.dataset.plus].quantity++;renderCart()});$('total').textContent=money(total());renderChange()}
function renderChange(){let cash=$('payment').value==='efectivo';$('cashLabel').hidden=!cash;$('change').textContent=cash?'Cambio: '+money(Math.max(0,Number($('received').value)-total())):''}
$('payment').onchange=renderChange;$('received').oninput=renderChange;
// Impresión mediante el sistema operativo: compatible con impresoras USB/Bluetooth
// instaladas y disponibles en el diálogo de impresión del navegador.
function ticketMarkup(t){
 const date=new Date(t.created_at).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});
 const rows=t.items.map(i=>`<tr><td>${escapeHtml(i.name)}${i.modifier_names?.length?'<br><small>'+escapeHtml(i.modifier_names.join(', '))+'</small>':''}<br><small>${i.quantity} × ${money(i.unit_price)}</small></td><td style="text-align:right">${money(i.quantity*i.unit_price)}</td></tr>`).join('');
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket ${escapeHtml(t.id.slice(0,8))}</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font:12px monospace;color:#000;width:72mm;max-width:100%;margin:0 auto;padding:4mm 1mm}h2,p{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px dashed #aaa;vertical-align:top}.right{text-align:right}.total{font-size:17px;font-weight:bold}.sep{border-top:1px dashed #000;margin:8px 0}@media screen{body{padding:16px;box-shadow:0 0 8px #ddd;margin:20px auto}}@media print{button{display:none!important}}</style></head><body><h2>MI PUESTO POS</h2><p>COMPROBANTE DE VENTA</p><p>${escapeHtml(date)}</p><p>Folio: ${escapeHtml(t.id.slice(0,8).toUpperCase())}</p><div class="sep"></div><table>${rows}</table><p class="right total">TOTAL: ${money(t.total)}</p><p class="right">Pago: ${escapeHtml(t.payment_method)}</p><p class="right">Recibido: ${money(t.received)}</p><p class="right">Cambio: ${money(Math.max(0,t.received-t.total))}</p><div class="sep"></div><p>¡Gracias por su compra!</p><button onclick="window.print()">Imprimir ticket</button><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`;
}
function printTicket(t,windowRef){
 const w=windowRef&&!windowRef.closed?windowRef:window.open('','_blank');
 if(!w){toast('Permite ventanas emergentes y usa Reimprimir último ticket');return}
 w.document.open();w.document.write(ticketMarkup(t));w.document.close();
}
$('printLast').onclick=()=>{if(lastTicket)printTicket(lastTicket)};
async function fetchTicket(id){
 const sale=check(await db.from('sales').select('id,created_at,total,payment_method,received').eq('id',id).single());
 const items=check(await db.from('sale_items').select('product_id,quantity,unit_price,modifier_names').eq('sale_id',id));
 return {...sale,items:items.map(i=>({...i,name:products.find(p=>p.id===i.product_id)?.name||'Producto'}))};
}
$('checkout').onclick=async()=>{let items=Object.values(cart).filter(i=>i.quantity>0).map(i=>({product_id:i.product_id,quantity:i.quantity,modifiers:i.modifiers}));if(!items.length)return toast('Carrito vacío');let amount=total(),cash=$('payment').value==='efectivo'?Number($('received').value):amount;if(cash<amount)return toast('Efectivo insuficiente');const b=$('checkout');b.disabled=true;const wantPrint=$('autoPrint').checked;const printWindow=wantPrint?window.open('','_blank'):null;try{const id=check(await db.rpc('create_sale_v4',{p_items:items,p_payment:$('payment').value,p_received:cash}));lastTicket=await fetchTicket(id).catch(()=>({id,created_at:new Date().toISOString(),total:amount,received:cash,payment_method:$('payment').value,items:items.map(i=>({quantity:i.quantity,name:products.find(p=>p.id===i.product_id)?.name||'Producto',unit_price:Number(products.find(p=>p.id===i.product_id)?.price||0)+i.modifiers.reduce((a,id)=>a+Number(modifiers.find(m=>m.id===id)?.price_delta||0),0),modifier_names:i.modifiers.map(id=>modifiers.find(m=>m.id===id)?.name).filter(Boolean)}))}));$('printLast').disabled=false;cart={};$('received').value='';toast('Venta registrada: '+String(id).slice(0,8));if(wantPrint)printTicket(lastTicket,printWindow);await load()}catch(e){if(printWindow&&!printWindow.closed)printWindow.close();fail(e)}finally{b.disabled=false}};
$('move').onclick=async()=>{const qty=Number($('qty').value);if(!Number.isFinite(qty)||qty===0)return toast('Ingresa una cantidad válida');try{check(await db.rpc('adjust_stock',{p_ingredient:$('ingredientSelect').value,p_quantity:qty,p_reason:$('reason').value||'Ajuste'}));$('qty').value='';await load();toast('Movimiento registrado')}catch(e){fail(e)}};
$('addProduct').onclick=async()=>{try{check(await db.from('products').insert({name:$('pname').value.trim(),category:$('pcategory').value,emoji:$('pemoji').value.trim()||'🍽️',price:Number($('pprice').value),production_target:Number($('ptarget').value)||0}));await load();toast('Producto creado')}catch(e){fail(e)}};
$('addIngredient').onclick=async()=>{try{check(await db.from('ingredients').insert({name:$('iname').value.trim(),unit:$('iunit').value.trim(),min_stock:Number($('imin').value)||0,target_stock:Number($('itarget').value)||0}));await load();toast('Insumo creado')}catch(e){fail(e)}};
$('addModifier').onclick=async()=>{try{check(await db.from('modifiers').insert({group_name:$('modGroup').value,name:$('modName').value.trim(),price_delta:Number($('modPrice').value)||0,ingredient_id:$('modIngredient').value||null,ingredient_quantity:Number($('modQty').value)||0}));await load();toast('Opción guardada')}catch(e){fail(e)}};
$('addCombo').onclick=async()=>{try{const combo=check(await db.from('products').insert({name:$('comboName').value.trim(),category:'combos',emoji:'🎁',price:Number($('comboPrice').value),is_combo:true}).select('id').single());await db.from('combo_parts').insert([{combo_id:combo.id,product_id:$('comboPart1').value,quantity:Number($('comboQty1').value)||1},{combo_id:combo.id,product_id:$('comboPart2').value,quantity:Number($('comboQty2').value)||1}]).then(check);await load();toast('Combo creado')}catch(e){fail(e)}};
$('saveRecipe').onclick=async()=>{try{check(await db.from('recipes').upsert({product_id:$('recipeProduct').value,ingredient_id:$('recipeIngredient').value,quantity:Number($('recipeQty').value)},{onConflict:'product_id,ingredient_id'}));await load();toast('Receta guardada')}catch(e){fail(e)}};
function renderProduction(){let rows=[];for(const i of ingredients){let needed=recipes.reduce((sum,r)=>{let p=products.find(p=>p.id===r.product_id);let direct=Number(p?.production_target||0);let bundled=comboParts.filter(c=>c.product_id===r.product_id).reduce((a,c)=>a+Number(products.find(x=>x.id===c.combo_id)?.production_target||0)*Number(c.quantity),0);return sum+(r.ingredient_id===i.id?Number(r.quantity)*(direct+bundled):0)},0);if(needed>0)rows.push([i.name,`${needed.toFixed(3)} ${i.unit}`,`${Math.max(0,needed-Number(i.stock)).toFixed(3)} ${i.unit}`])}$('production').innerHTML=rows.length?table(['Insumo','Necesario','Faltante'],rows):'Define metas y recetas para calcular la producción.'}
$('reportDate').value=new Date().toLocaleDateString('en-CA');
async function reports(){try{const date=$('reportDate').value;if(!date)return;const start=date+'T00:00:00',end=new Date(new Date(start).getTime()+86400000).toISOString();sales=check(await db.from('sales').select('id,created_at,total,payment_method,seller_id').gte('created_at',new Date(start).toISOString()).lt('created_at',end).order('created_at',{ascending:false}).limit(1000));let sum=sales.reduce((a,s)=>a+Number(s.total),0);$('summary').innerHTML=`<span class="stat">Ventas: <b>${sales.length}</b></span><span class="stat">Importe: <b>${money(sum)}</b></span>`;$('sales').innerHTML=table(['Hora','Forma de pago','Importe'],sales.map(s=>[new Date(s.created_at).toLocaleTimeString('es-MX'),s.payment_method,money(s.total)]));if(sales.length===1000)toast('Límite de 1000 ventas: exporta por periodos más cortos')}catch(e){fail(e)}}
$('refreshReports').onclick=reports;
function csv(name,rows){const content='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('exportSales').onclick=()=>csv('ventas.csv',[['ID','Fecha','Vendedor ID','Pago','Total'],...sales.map(s=>[s.id,s.created_at,s.seller_id,s.payment_method,s.total])]);
$('exportReorder').onclick=()=>csv('reorden.csv',[['Insumo','Unidad','Existencia','Mínimo','Comprar'],...reorderRows.map(i=>[i.name,i.unit,i.stock,i.min,i.order])]);
init();

// V5: control de turnos y cortes. Los importes oficiales se calculan en PostgreSQL.
let currentShift=null,shiftHistory=[];
const shiftMoney=v=>money(Number(v||0));
async function refreshShifts(){
 if(!user)return;
 try{
  shiftHistory=check(await db.from('cash_shifts').select('*').order('opened_at',{ascending:false}).limit(500));
  currentShift=shiftHistory.find(s=>s.seller_id===user.id&&!s.closed_at)||null;
  $('shiftOpen').hidden=!!currentShift;
  $('shiftActive').hidden=!currentShift;
  $('checkout').disabled=!currentShift;
  $('shiftStatus').textContent=currentShift?`Turno abierto: ${currentShift.shift_name} · ${new Date(currentShift.opened_at).toLocaleString('es-MX')} · Fondo ${shiftMoney(currentShift.opening_cash)}`:'No tienes turno abierto. Abre uno para registrar ventas.';
  $('shiftHistory').innerHTML=table(['Empleado (ID)','Turno','Apertura','Cierre','Fondo','Efectivo vendido','Transferencias','Tarjetas','Movimientos','Esperado','Contado','Diferencia'],shiftHistory.map(s=>[s.seller_id===user.id?'Yo':s.seller_id.slice(0,8),s.shift_name,new Date(s.opened_at).toLocaleString('es-MX'),s.closed_at?new Date(s.closed_at).toLocaleString('es-MX'):'ABIERTO',shiftMoney(s.opening_cash),s.closed_at?shiftMoney(s.cash_sales):'—',s.closed_at?shiftMoney(s.transfer_sales):'—',s.closed_at?shiftMoney(s.card_sales):'—',s.closed_at?shiftMoney(s.cash_movements_total):'—',s.closed_at?shiftMoney(s.expected_cash):'—',s.closed_at?shiftMoney(s.counted_cash):'—',s.closed_at?shiftMoney(s.variance):'—']));
  const movements=currentShift?check(await db.from('cash_movements').select('created_at,amount,reason').eq('shift_id',currentShift.id).order('created_at',{ascending:false})):[];
  $('shiftMovements').innerHTML=movements.length?table(['Fecha','Importe','Motivo'],movements.map(m=>[new Date(m.created_at).toLocaleString('es-MX'),shiftMoney(m.amount),m.reason])):'Sin movimientos';
 }catch(e){fail(e)}
}
$('openShift').onclick=async()=>{const name=$('shiftName').value.trim(),amount=Number($('openingCash').value);if(!name||!Number.isFinite(amount)||amount<0)return toast('Revisa nombre y fondo inicial');try{check(await db.rpc('open_cash_shift',{p_name:name,p_opening:amount}));await refreshShifts();toast('Turno abierto')}catch(e){fail(e)}};
$('saveMovement').onclick=async()=>{const amount=Number($('movementAmount').value),reason=$('movementReason').value.trim();if(!Number.isFinite(amount)||amount===0||reason.length<3)return toast('Ingresa importe y motivo (mínimo 3 caracteres)');try{check(await db.rpc('record_cash_movement',{p_amount:amount,p_reason:reason}));$('movementAmount').value='';$('movementReason').value='';await refreshShifts();toast('Movimiento registrado')}catch(e){fail(e)}};
$('closeShift').onclick=async()=>{const raw=$('countedCash').value,amount=Number(raw);if(raw.trim()===''||!Number.isFinite(amount)||amount<0)return toast('Captura el efectivo contado');if(!confirm('¿Confirmas el cierre? Ya no podrás agregar ventas a este turno.'))return;try{check(await db.rpc('close_cash_shift',{p_counted:amount,p_notes:$('closeNotes').value}));$('countedCash').value='';$('closeNotes').value='';await refreshShifts();toast('Corte cerrado. Revisa la diferencia en el historial.')}catch(e){fail(e)}};
$('refreshShifts').onclick=refreshShifts;
$('exportShifts').onclick=()=>csv('cortes_de_caja.csv',[['Turno ID','Empleado ID','Nombre turno','Apertura','Cierre','Fondo inicial','Ventas efectivo','Transferencias','Tarjeta','Movimientos','Efectivo esperado','Efectivo contado','Diferencia','Notas'],...shiftHistory.map(s=>[s.id,s.seller_id,s.shift_name,s.opened_at,s.closed_at,s.opening_cash,s.cash_sales,s.transfer_sales,s.card_sales,s.cash_movements_total,s.expected_cash,s.counted_cash,s.variance,s.close_notes])]);
// Al entrar, al cambiar de pestaña y después de cada venta, refrescar el estado de caja.
const originalLoad=load;
load=async function(){await originalLoad();if(user)await refreshShifts()};
document.querySelector('[data-tab="caja"]').addEventListener('click',()=>refreshShifts());

// V6: tablero de propietario. Los filtros por fecha se calculan en zona local del dispositivo.
let dashboardExport=[];
const dashNum=n=>Number(n||0);
const dashDateRange=date=>{const [y,m,d]=date.split('-').map(Number);const start=new Date(y,m-1,d),end=new Date(y,m-1,d+1);return [start.toISOString(),end.toISOString()]};
async function fetchAllDashboard(tableName,fields,filter,limit=10000){
 let rows=[];for(let from=0;from<limit;from+=500){let query=db.from(tableName).select(fields).range(from,from+499);query=filter(query);const batch=check(await query);rows.push(...batch);if(batch.length<500)return {rows,truncated:false}}return {rows,truncated:true};
}
function dashTable(headers,rows){return rows.length?table(headers,rows):'<p class="muted">Sin datos para la fecha seleccionada.</p>'}
function dashBar(label,value,max){const pct=max>0?Math.max(0,Math.min(100,value/max*100)):0;return `<div class="dash-bar"><span>${escapeHtml(label)}</span><div class="dash-track"><div style="width:${pct.toFixed(2)}%"></div></div><strong>${money(value)}</strong></div>`}
async function refreshDashboard(){
 if(!['admin','manager'].includes(role)||!user)return;
 const date=$('dashDate').value;if(!date)return toast('Selecciona una fecha');const button=$('dashRefresh');button.disabled=true;
 try{
  const [start,end]=dashDateRange(date);
  const [saleResult,shiftResult]=await Promise.all([
   fetchAllDashboard('sales','id,created_at,seller_id,shift_id,total,payment_method',q=>q.gte('created_at',start).lt('created_at',end).order('created_at',{ascending:true})),
   fetchAllDashboard('cash_shifts','id,seller_id,shift_name,opened_at,closed_at,opening_cash,cash_sales,transfer_sales,card_sales,expected_cash,counted_cash,variance',q=>q.gte('opened_at',start).lt('opened_at',end).order('opened_at',{ascending:true}))
  ]);
  const daySales=saleResult.rows,dayShifts=shiftResult.rows;
  const ids=daySales.map(x=>x.id);let items=[],itemTruncated=false;
  for(let k=0;k<ids.length;k+=100){const chunk=ids.slice(k,k+100);const r=await fetchAllDashboard('sale_items','sale_id,product_id,quantity,unit_price',q=>q.in('sale_id',chunk),10000);items.push(...r.rows);itemTruncated ||=r.truncated}
  const total=daySales.reduce((v,s)=>v+dashNum(s.total),0),cash=daySales.filter(s=>s.payment_method==='efectivo').reduce((v,s)=>v+dashNum(s.total),0),transfer=daySales.filter(s=>s.payment_method==='transferencia').reduce((v,s)=>v+dashNum(s.total),0),card=daySales.filter(s=>s.payment_method==='tarjeta').reduce((v,s)=>v+dashNum(s.total),0);
  const closed=dayShifts.filter(s=>s.closed_at),missing=closed.filter(s=>Math.abs(dashNum(s.variance))>=0.01);
  $('dashKpis').innerHTML=[['Venta total',money(total)],['Operaciones',daySales.length],['Ticket promedio',money(daySales.length?total/daySales.length:0)],['Efectivo',money(cash)],['Transferencias',money(transfer)],['Tarjeta',money(card)],['Turnos abiertos',dayShifts.length-closed.length],['Cortes con diferencia',missing.length]].map(([label,value])=>`<div class="dash-kpi"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  const hours=new Map();for(const s of daySales){const hour=new Date(s.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',hour12:false});hours.set(hour,(hours.get(hour)||0)+dashNum(s.total))}const sortedHours=[...hours].sort((a,b)=>a[0].localeCompare(b[0]));$('dashHours').innerHTML=sortedHours.length?sortedHours.map(([h,v])=>dashBar(h,v,Math.max(...hours.values()))).join(''):'<p class="muted">Sin ventas.</p>';
  const bySeller=new Map();for(const s of daySales){const r=bySeller.get(s.seller_id)||{count:0,total:0};r.count++;r.total+=dashNum(s.total);bySeller.set(s.seller_id,r)}
  $('dashEmployees').innerHTML=dashTable(['Empleado ID','Operaciones','Total','Promedio'],[...bySeller].sort((a,b)=>b[1].total-a[1].total).map(([id,r])=>[id.slice(0,8),r.count,money(r.total),money(r.total/r.count)]));
  const byShift=new Map();for(const s of daySales){if(!s.shift_id)continue;const r=byShift.get(s.shift_id)||{count:0,total:0};r.count++;r.total+=dashNum(s.total);byShift.set(s.shift_id,r)}
  $('dashShifts').innerHTML=dashTable(['Turno','Empleado ID','Estado','Operaciones','Ventas'],dayShifts.map(s=>[s.shift_name,s.seller_id.slice(0,8),s.closed_at?'Cerrado':'Abierto',byShift.get(s.id)?.count||0,money(byShift.get(s.id)?.total||0)]));
  const byProduct=new Map();for(const i of items){const r=byProduct.get(i.product_id)||{qty:0,total:0};r.qty+=dashNum(i.quantity);r.total+=dashNum(i.quantity)*dashNum(i.unit_price);byProduct.set(i.product_id,r)}
  $('dashProducts').innerHTML=dashTable(['Producto','Unidades','Venta bruta por líneas'],[...byProduct].sort((a,b)=>b[1].qty-a[1].qty).slice(0,20).map(([id,r])=>[products.find(p=>p.id===id)?.name||id.slice(0,8),r.qty,money(r.total)]));
  $('dashDifferences').innerHTML=dashTable(['Turno','Empleado ID','Esperado','Contado','Diferencia'],missing.map(s=>[s.shift_name,s.seller_id.slice(0,8),money(s.expected_cash),money(s.counted_cash),money(s.variance)]));
  $('dashWarning').textContent=(saleResult.truncated||shiftResult.truncated||itemTruncated?'Aviso: se alcanzó el límite de consulta; los totales podrían estar incompletos. ':'')+'Turnos agrupados por fecha de apertura; cortes posteriores aparecerán en el mismo turno. Los empleados se identifican por los primeros 8 caracteres de su ID.';
  dashboardExport=[['Tipo','Detalle','Cantidad','Importe'],['Resumen','Ventas',daySales.length,total],['Resumen','Efectivo','',cash],['Resumen','Transferencias','',transfer],['Resumen','Tarjeta','',card],...([...bySeller].map(([id,r])=>['Empleado',id,r.count,r.total])),...([...byProduct].map(([id,r])=>['Producto',products.find(p=>p.id===id)?.name||id,r.qty,r.total])),...missing.map(s=>['Diferencia',s.shift_name+' / '+s.seller_id,'',s.variance])];
 }catch(e){fail(e);$('dashWarning').textContent='No se pudo cargar el tablero: '+(e.message||e)}finally{button.disabled=false}
}
$('dashDate').value=new Date().toLocaleDateString('en-CA');
$('dashRefresh').onclick=refreshDashboard;
$('dashExport').onclick=()=>dashboardExport.length?csv('tablero_propietario_'+$('dashDate').value+'.csv',dashboardExport):toast('Actualiza el tablero antes de exportar');
document.querySelector('[data-tab="supervision"]').addEventListener('click',refreshDashboard);


// V8 Gerencia general: controles de edición restringidos también por RLS/RPC en PostgreSQL.
let mgrProducts=[],mgrIngredients=[],mgrModifiers=[],mgrRecipes=[],mgrCombos=[],mgrUsers=[];
const mEl=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=String(txt);return e};
function mButton(label,fn,css=''){const b=mEl('button',label);if(css)b.className=css;b.onclick=fn;return b}
function mField(label,value,type='text'){const w=mEl('label',label),i=document.createElement('input');i.type=type;i.value=value??'';if(type==='number')i.step='0.001';w.append(i);return [w,i]}
function mSelect(label,values,selected){const w=mEl('label',label),s=document.createElement('select');for(const [val,txt] of values){const o=mEl('option',txt);o.value=val;s.append(o)}s.value=selected??'';w.append(s);return [w,s]}
function mRow(container,title,fields,onSave,onToggle,toggleText){const card=mEl('div');card.className='manager-card';card.append(mEl('h4',title));const values={};for(const [key,label,value,type,options] of fields){const [wrapper,input]=options?mSelect(label,options,value):mField(label,value,type);card.append(wrapper);values[key]=input}card.append(mButton('Guardar cambios',async()=>{try{await onSave(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.value])));await load();await loadManager();toast('Cambios guardados')}catch(e){fail(e)}}));if(onToggle)card.append(mButton(toggleText,async()=>{if(!confirm('¿Confirmas esta operación?'))return;try{await onToggle();await load();await loadManager();toast('Estado actualizado')}catch(e){fail(e)}},'secondary'));container.append(card)}
async function mUpdate(table,id,values){check(await db.from(table).update(values).eq('id',id))}
async function loadManager(){if(role!=='manager')return;try{
 [mgrProducts,mgrIngredients,mgrModifiers,mgrRecipes,mgrCombos,mgrUsers]=await Promise.all([
 db.from('products').select('*').order('name').then(check),db.from('ingredients').select('*').order('name').then(check),db.from('modifiers').select('*').order('group_name').then(check),db.from('recipes').select('*').then(check),db.from('combo_parts').select('*').then(check),db.from('profiles').select('id,role,enabled').order('created_at').then(check)]);
 renderManager();const settings=check(await db.from('app_settings').select('key,value').in('key',['business_name','ticket_message']));businessSettings.name=settings.find(x=>x.key==='business_name')?.value||businessSettings.name;businessSettings.ticket_message=settings.find(x=>x.key==='ticket_message')?.value||businessSettings.ticket_message;$('businessName').value=businessSettings.name;$('ticketMessage').value=businessSettings.ticket_message;
 }catch(e){fail(e)}}
function renderManager(){
 const productBox=$('managerProducts');productBox.replaceChildren();productBox.append(mButton('➕ Crear nuevo artículo',()=>switchTab('admin')));
 for(const p of mgrProducts)mRow(productBox,p.name,[['name','Nombre',p.name],['category','Categoría',p.category],['emoji','Icono',p.emoji],['price','Precio',p.price,'number'],['production_target','Meta producción',p.production_target,'number']],v=>mUpdate('products',p.id,{...v,price:Number(v.price),production_target:Number(v.production_target)}),()=>mUpdate('products',p.id,{active:!p.active}),p.active?'Dar de baja':'Reactivar');
 const ib=$('managerIngredients');ib.replaceChildren();ib.append(mButton('➕ Crear insumo',()=>switchTab('admin')));
 for(const i of mgrIngredients)mRow(ib,i.name,[['name','Nombre',i.name],['unit','Unidad',i.unit],['min_stock','Mínimo',i.min_stock,'number'],['target_stock','Objetivo',i.target_stock,'number']],v=>mUpdate('ingredients',i.id,{...v,min_stock:Number(v.min_stock),target_stock:Number(v.target_stock)}),null);
 const mb=$('managerModifiers');mb.replaceChildren();mb.append(mButton('➕ Nueva opción',()=>switchTab('admin')));
 for(const m of mgrModifiers)mRow(mb,m.group_name+' · '+m.name,[['group_name','Grupo',m.group_name],['name','Opción',m.name],['price_delta','Cargo',m.price_delta,'number'],['ingredient_quantity','Consumo adicional',m.ingredient_quantity,'number']],v=>mUpdate('modifiers',m.id,{...v,price_delta:Number(v.price_delta),ingredient_quantity:Number(v.ingredient_quantity)}),()=>mUpdate('modifiers',m.id,{active:!m.active}),m.active?'Desactivar':'Reactivar');
 const rb=$('managerRecipes');rb.replaceChildren();rb.append(mButton('➕ Nueva receta',()=>switchTab('admin')));
 for(const r of mgrRecipes){const name=(mgrProducts.find(p=>p.id===r.product_id)?.name||'Artículo')+' / '+(mgrIngredients.find(i=>i.id===r.ingredient_id)?.name||'Insumo');mRow(rb,name,[['quantity','Cantidad por venta',r.quantity,'number']],v=>check(db.from('recipes').update({quantity:Number(v.quantity)}).eq('product_id',r.product_id).eq('ingredient_id',r.ingredient_id)),async()=>check(await db.from('recipes').delete().eq('product_id',r.product_id).eq('ingredient_id',r.ingredient_id)),'Quitar de receta')}
 const cb=$('managerCombos');cb.replaceChildren();cb.append(mButton('➕ Crear combo',()=>switchTab('admin')));
 for(const c of mgrCombos){const name=(mgrProducts.find(p=>p.id===c.combo_id)?.name||'Combo')+' / '+(mgrProducts.find(p=>p.id===c.product_id)?.name||'Artículo');mRow(cb,name,[['quantity','Unidades',c.quantity,'number']],v=>check(db.from('combo_parts').update({quantity:Number(v.quantity)}).eq('combo_id',c.combo_id).eq('product_id',c.product_id)),async()=>check(await db.from('combo_parts').delete().eq('combo_id',c.combo_id).eq('product_id',c.product_id)),'Quitar componente')}
 const ub=$('managerUsers');ub.replaceChildren();const roles=[['seller','Vendedor'],['admin','Administrador'],['manager','Gerente general']];
 for(const u of mgrUsers)mRow(ub,u.id===user.id?'Mi cuenta · '+u.id:u.id,[['role','Perfil',u.role,'text',roles]],async v=>{check(await db.rpc('manager_update_profile',{p_user:u.id,p_role:v.role,p_enabled:u.enabled}))},async()=>{check(await db.rpc('manager_update_profile',{p_user:u.id,p_role:u.role,p_enabled:!u.enabled}))},u.enabled?'Deshabilitar acceso':'Habilitar acceso');
}
function switchTab(name){const b=document.querySelector('nav [data-tab="'+name+'"]');if(b&&!b.hidden)b.click()}
document.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.manager-page').forEach(p=>p.hidden=p.id!==b.dataset.manager);document.querySelectorAll('[data-manager]').forEach(x=>x.classList.toggle('active',x===b))});
document.querySelector('[data-tab="manager"]').addEventListener('click',loadManager);
$('saveBusiness').onclick=async()=>{if(role!=='manager')return;try{for(const [key,value] of [['business_name',$('businessName').value.trim()],['ticket_message',$('ticketMessage').value.trim()]])check(await db.from('app_settings').upsert({key,value},{onConflict:'key'}));toast('Configuración guardada');await loadManager()}catch(e){fail(e)}};
$('managerGoCatalog').onclick=()=>switchTab('admin');$('managerGoDashboard').onclick=()=>switchTab('supervision');
