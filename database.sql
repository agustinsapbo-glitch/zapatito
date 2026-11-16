-- Ejecutar en Supabase SQL Editor. Crea el primer administrador manualmente:
-- UPDATE public.profiles SET role='admin' WHERE id=(SELECT id FROM auth.users WHERE email='TU_CORREO');
create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,role text not null default 'seller' check(role in ('admin','seller')),created_at timestamptz default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),emoji text default '🍽️',category text not null default 'otros',price numeric(12,2) not null check(price>=0),production_target numeric(12,3) not null default 0 check(production_target>=0),active boolean not null default true);
create table if not exists public.ingredients(id uuid primary key default gen_random_uuid(),name text not null unique,unit text not null,stock numeric(14,3) not null default 0 check(stock>=0),min_stock numeric(14,3) not null default 0 check(min_stock>=0),target_stock numeric(14,3) not null default 0 check(target_stock>=0));
create table if not exists public.recipes(product_id uuid not null references public.products(id) on delete cascade,ingredient_id uuid not null references public.ingredients(id) on delete cascade,quantity numeric(14,3) not null check(quantity>0),primary key(product_id,ingredient_id));
create table if not exists public.sales(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),seller_id uuid not null references auth.users(id),total numeric(12,2) not null check(total>=0),payment_method text not null check(payment_method in ('efectivo','transferencia','tarjeta')),received numeric(12,2) not null);
create table if not exists public.sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid not null references public.sales(id) on delete cascade,product_id uuid not null references public.products(id),quantity integer not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0));
create table if not exists public.stock_movements(id uuid primary key default gen_random_uuid(),ingredient_id uuid not null references public.ingredients(id),quantity numeric(14,3) not null,reason text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),sale_id uuid references public.sales(id));
create or replace function public.new_profile() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id) values(new.id);return new;end$$;
drop trigger if exists auth_profile on auth.users;
create trigger auth_profile after insert on auth.users for each row execute function public.new_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')$$;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
create policy "own profile" on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_admin());
create policy "read products" on public.products for select to authenticated using(true);
create policy "admin products" on public.products for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read ingredients" on public.ingredients for select to authenticated using(true);
create policy "admin ingredients" on public.ingredients for insert to authenticated with check(public.is_admin());
create policy "admin ingredient metadata" on public.ingredients for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read recipes" on public.recipes for select to authenticated using(true);
create policy "admin recipes" on public.recipes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read sales" on public.sales for select to authenticated using(public.is_admin() or seller_id=(select auth.uid()));
create policy "read sale items" on public.sale_items for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id and (public.is_admin() or s.seller_id=(select auth.uid()))));
create policy "read movements" on public.stock_movements for select to authenticated using(public.is_admin());
-- Evita acceso directo a las tablas de ventas, movimientos y al stock desde el cliente.
create or replace function public.adjust_stock(p_ingredient uuid,p_quantity numeric,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not public.is_admin() then raise exception 'Solo administradores'; end if;
 if p_quantity is null or p_quantity=0 or length(trim(coalesce(p_reason,'')))=0 then raise exception 'Movimiento inválido'; end if;
 update public.ingredients set stock=stock+p_quantity where id=p_ingredient and stock+p_quantity>=0;
 if not found then raise exception 'Insumo inexistente o existencias insuficientes';end if;
 insert into public.stock_movements(ingredient_id,quantity,reason,actor_id) values(p_ingredient,p_quantity,p_reason,(select auth.uid()));
end$$;
create or replace function public.create_sale(p_items jsonb,p_payment text,p_received numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale uuid;v_total numeric(12,2):=0;v_item jsonb;v_id uuid;v_qty integer;v_price numeric(12,2);v_ing record;v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Inicia sesión';end if;
 if p_payment not in ('efectivo','transferencia','tarjeta') then raise exception 'Pago inválido';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Carrito inválido';end if;
 -- Bloqueo de inventario en orden fijo para evitar carreras y bloqueos mutuos.
 perform 1 from public.ingredients where id in (select distinct r.ingredient_id from public.recipes r join public.products p on p.id=r.product_id where p.id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_items) x)) order by id for update;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_id:=(v_item->>'product_id')::uuid;v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty<=0 or v_qty>10000 then raise exception 'Cantidad inválida';end if;
  select price into v_price from public.products where id=v_id and active=true;
  if not found then raise exception 'Producto no disponible';end if;
  v_total:=v_total+v_price*v_qty;
 end loop;
 if p_received is null or p_received<v_total then raise exception 'Pago insuficiente';end if;
 -- Verificar todo el consumo agregado antes de modificar existencias.
 for v_ing in select r.ingredient_id,sum(r.quantity*(x.value->>'quantity')::integer) as needed from jsonb_array_elements(p_items) x join public.recipes r on r.product_id=(x.value->>'product_id')::uuid group by r.ingredient_id loop
  if (select stock from public.ingredients where id=v_ing.ingredient_id)<v_ing.needed then raise exception 'Inventario insuficiente para insumo %',v_ing.ingredient_id;end if;
 end loop;
 insert into public.sales(seller_id,total,payment_method,received) values(v_user,v_total,p_payment,p_received) returning id into v_sale;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_id:=(v_item->>'product_id')::uuid;v_qty:=(v_item->>'quantity')::integer;
  select price into v_price from public.products where id=v_id;
  insert into public.sale_items(sale_id,product_id,quantity,unit_price) values(v_sale,v_id,v_qty,v_price);
 end loop;
 for v_ing in select r.ingredient_id,sum(r.quantity*(x.value->>'quantity')::integer) as needed from jsonb_array_elements(p_items) x join public.recipes r on r.product_id=(x.value->>'product_id')::uuid group by r.ingredient_id loop
  update public.ingredients set stock=stock-v_ing.needed where id=v_ing.ingredient_id;
  insert into public.stock_movements(ingredient_id,quantity,reason,actor_id,sale_id) values(v_ing.ingredient_id,-v_ing.needed,'Consumo por venta',v_user,v_sale);
 end loop;
 return v_sale;
end$$;
revoke all on function public.create_sale(jsonb,text,numeric) from public,anon;
revoke all on function public.adjust_stock(uuid,numeric,text) from public,anon;
grant execute on function public.create_sale(jsonb,text,numeric) to authenticated;
grant execute on function public.adjust_stock(uuid,numeric,text) to authenticated;
