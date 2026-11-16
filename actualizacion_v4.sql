-- Ejecutar después de database.sql y catalogo_barbacoa_cafe.sql.
-- Las opciones y recetas son ejemplos ajustables; no agrega existencias.
alter table public.products add column if not exists is_combo boolean not null default false;
alter table public.sale_items add column if not exists modifier_names text[] not null default '{}';
create table if not exists public.modifiers(id uuid primary key default gen_random_uuid(),group_name text not null,name text not null,price_delta numeric(12,2) not null default 0,ingredient_id uuid references public.ingredients(id),ingredient_quantity numeric(14,3) not null default 0 check(ingredient_quantity>=0),active boolean not null default true,unique(group_name,name));
create table if not exists public.combo_parts(combo_id uuid references public.products(id) on delete cascade,product_id uuid references public.products(id),quantity integer not null check(quantity>0),primary key(combo_id,product_id),check(combo_id<>product_id));
alter table public.modifiers enable row level security;
alter table public.combo_parts enable row level security;
create policy "read modifiers" on public.modifiers for select to authenticated using(true);
create policy "admin modifiers" on public.modifiers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read combo parts" on public.combo_parts for select to authenticated using(true);
create policy "admin combo parts" on public.combo_parts for all to authenticated using(public.is_admin()) with check(public.is_admin());
insert into public.modifiers(group_name,name,price_delta) values
('Tamaño','12 oz',0),('Tamaño','16 oz',10),('Temperatura','Caliente',0),('Temperatura','Frío',0),('Leche','Entera',0),('Leche','Deslactosada',8),('Leche','Vegetal',12),('Sabor','Vainilla',8),('Sabor','Caramelo',8),('Sabor','Moka',10),('Azúcar','Sin azúcar',0),('Azúcar','Normal',0),('Topping','Crema batida',10),('Topping','Canela',0)
on conflict(group_name,name) do nothing;
-- Función transaccional: precio del servidor, componentes de combos y descuentos de insumos.
create or replace function public.create_sale_v4(p_items jsonb,p_payment text,p_received numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sale uuid;v_total numeric(12,2):=0;v_item jsonb;v_id uuid;v_qty integer;v_price numeric(12,2);v_ing record;v_user uuid:=(select auth.uid());v_mod uuid;v_names text[];v_mods jsonb;v_count integer;v_product record;
begin
 if v_user is null then raise exception 'Inicia sesión';end if;
 if p_payment not in ('efectivo','transferencia','tarjeta') then raise exception 'Pago inválido';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Carrito inválido';end if;
 create temporary table if not exists pg_temp.pos_consumption(ingredient_id uuid,amount numeric) on commit drop;
 truncate pg_temp.pos_consumption;
 create temporary table if not exists pg_temp.pos_lines(product_id uuid,qty integer,price numeric,names text[]) on commit drop;
 truncate pg_temp.pos_lines;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_id:=(v_item->>'product_id')::uuid;v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty not between 1 and 10000 then raise exception 'Cantidad inválida';end if;
  select * into v_product from public.products where id=v_id and active=true;
  if not found then raise exception 'Producto no disponible';end if;
  v_price:=v_product.price;v_names:='{}'::text[];v_mods:=coalesce(v_item->'modifiers','[]'::jsonb);
  if jsonb_typeof(v_mods)<>'array' or jsonb_array_length(v_mods)>15 then raise exception 'Opciones inválidas';end if;
  if v_product.category<>'cafe' and jsonb_array_length(v_mods)>0 then raise exception 'Opciones solo para cafetería';end if;
  if v_product.is_combo and jsonb_array_length(v_mods)>0 then raise exception 'Combo no admite modificadores';end if;
  if (select count(*) from (select distinct value from jsonb_array_elements_text(v_mods)) a)<>jsonb_array_length(v_mods) then raise exception 'Opción duplicada';end if;
  if (select count(*) from public.modifiers m where m.id in(select value::uuid from jsonb_array_elements_text(v_mods)) and m.active)<>jsonb_array_length(v_mods) then raise exception 'Opción desconocida';end if;
  if exists(select 1 from public.modifiers m where m.id in(select value::uuid from jsonb_array_elements_text(v_mods)) group by m.group_name having count(*)>1) then raise exception 'Selecciona una opción por grupo';end if;
  for v_ing in select * from public.modifiers where id in(select value::uuid from jsonb_array_elements_text(v_mods)) loop
    v_price:=v_price+v_ing.price_delta;v_names:=array_append(v_names,v_ing.name);
    if v_ing.ingredient_id is not null and v_ing.ingredient_quantity>0 then insert into pg_temp.pos_consumption values(v_ing.ingredient_id,v_ing.ingredient_quantity*v_qty);end if;
  end loop;
  if v_price<0 then raise exception 'Precio inválido';end if;
  if v_product.is_combo then
    select count(*) into v_count from public.combo_parts where combo_id=v_id;
    if v_count<1 then raise exception 'Combo sin componentes';end if;
    if exists(select 1 from public.combo_parts c join public.products p on p.id=c.product_id where c.combo_id=v_id and (not p.active or p.is_combo)) then raise exception 'Combo con componente inválido';end if;
    insert into pg_temp.pos_consumption select r.ingredient_id,r.quantity*c.quantity*v_qty from public.combo_parts c join public.recipes r on r.product_id=c.product_id where c.combo_id=v_id;
  else
    insert into pg_temp.pos_consumption select r.ingredient_id,r.quantity*v_qty from public.recipes r where r.product_id=v_id;
  end if;
  insert into pg_temp.pos_lines values(v_id,v_qty,v_price,v_names);
  v_total:=v_total+v_price*v_qty;
 end loop;
 if p_received is null or p_received<v_total then raise exception 'Pago insuficiente';end if;
 perform 1 from public.ingredients where id in(select ingredient_id from pg_temp.pos_consumption) order by id for update;
 for v_ing in select ingredient_id,sum(amount) as amount from pg_temp.pos_consumption group by ingredient_id loop
  if (select stock from public.ingredients where id=v_ing.ingredient_id)<v_ing.amount then raise exception 'Inventario insuficiente para insumo %',v_ing.ingredient_id;end if;
 end loop;
 insert into public.sales(seller_id,total,payment_method,received) values(v_user,v_total,p_payment,p_received) returning id into v_sale;
 insert into public.sale_items(sale_id,product_id,quantity,unit_price,modifier_names) select v_sale,product_id,qty,price,names from pg_temp.pos_lines;
 for v_ing in select ingredient_id,sum(amount) as amount from pg_temp.pos_consumption group by ingredient_id loop
  update public.ingredients set stock=stock-v_ing.amount where id=v_ing.ingredient_id;
  insert into public.stock_movements(ingredient_id,quantity,reason,actor_id,sale_id) values(v_ing.ingredient_id,-v_ing.amount,'Consumo por venta',v_user,v_sale);
 end loop;
 return v_sale;
end$$;
revoke all on function public.create_sale_v4(jsonb,text,numeric) from public,anon;
grant execute on function public.create_sale_v4(jsonb,text,numeric) to authenticated;
-- Combo de ejemplo: una orden de cuatro tacos + americano 12 oz por $120.
insert into public.products(name,category,emoji,price,production_target,is_combo) values('Combo 4 tacos + americano 12 oz','combos','🎁',120,20,true) on conflict do nothing;
update public.products set is_combo=true where name='Combo 4 tacos + americano 12 oz';
insert into public.combo_parts(combo_id,product_id,quantity)
select c.id,p.id,1 from public.products c join public.products p on p.name in ('Orden 4 tacos de barbacoa','Americano 12 oz') where c.name='Combo 4 tacos + americano 12 oz' on conflict do nothing;
