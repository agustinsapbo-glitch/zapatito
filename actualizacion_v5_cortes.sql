-- Ejecutar DESPUÉS de database.sql, catalogo_barbacoa_cafe.sql y actualizacion_v4.sql.
-- Horarios se almacenan en timestamptz; la interfaz muestra zona local del dispositivo.
create table if not exists public.cash_shifts (
 id uuid primary key default gen_random_uuid(),
 seller_id uuid not null references auth.users(id),
 shift_name text not null check(length(trim(shift_name)) between 1 and 60),
 opened_at timestamptz not null default now(),
 opening_cash numeric(12,2) not null check(opening_cash>=0),
 closed_at timestamptz,
 counted_cash numeric(12,2) check(counted_cash>=0),
 expected_cash numeric(12,2),
 cash_sales numeric(12,2),
 transfer_sales numeric(12,2),
 card_sales numeric(12,2),
 cash_movements_total numeric(12,2),
 variance numeric(12,2),
 close_notes text,
 constraint valid_close check((closed_at is null and counted_cash is null) or (closed_at is not null and counted_cash is not null))
);
create unique index if not exists one_open_shift_per_seller on public.cash_shifts(seller_id) where closed_at is null;
create table if not exists public.cash_movements (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null references public.cash_shifts(id),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 amount numeric(12,2) not null check(amount<>0),
 reason text not null check(length(trim(reason)) between 3 and 250)
);
alter table public.sales add column if not exists shift_id uuid references public.cash_shifts(id);
create index if not exists sales_shift_idx on public.sales(shift_id);
create index if not exists cash_movements_shift_idx on public.cash_movements(shift_id);
alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;
create policy "shift read own or admin" on public.cash_shifts for select to authenticated using(seller_id=(select auth.uid()) or public.is_admin());
create policy "movement read own or admin" on public.cash_movements for select to authenticated using(exists(select 1 from public.cash_shifts s where s.id=shift_id and (s.seller_id=(select auth.uid()) or public.is_admin())));
-- Ningún cliente tiene permisos INSERT/UPDATE/DELETE directos sobre cortes ni movimientos.
create or replace function public.open_cash_shift(p_name text,p_opening numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Inicia sesión'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 60 or p_opening is null or p_opening<0 then raise exception 'Datos de apertura inválidos';end if;
 insert into public.cash_shifts(seller_id,shift_name,opening_cash) values(v_user,trim(p_name),p_opening) returning id into v_id;
 return v_id;
exception when unique_violation then raise exception 'Ya tienes un turno abierto';
end$$;
-- Se aplica también a las ventas realizadas por RPC v4, sin confiar en un ID enviado por el navegador.
create or replace function public.assign_sale_shift() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_shift uuid;
begin
 if new.seller_id is distinct from (select auth.uid()) then raise exception 'Vendedor inválido';end if;
 select id into v_shift from public.cash_shifts where seller_id=new.seller_id and closed_at is null for update;
 if v_shift is null then raise exception 'Abre tu turno de caja antes de cobrar';end if;
 new.shift_id:=v_shift;
 return new;
end$$;
drop trigger if exists sale_shift_assignment on public.sales;
create trigger sale_shift_assignment before insert on public.sales for each row execute function public.assign_sale_shift();
create or replace function public.record_cash_movement(p_amount numeric,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_shift uuid;v_id uuid;v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Inicia sesión';end if;
 if p_amount is null or p_amount=0 or length(trim(coalesce(p_reason,''))) not between 3 and 250 then raise exception 'Movimiento inválido';end if;
 select id into v_shift from public.cash_shifts where seller_id=v_user and closed_at is null for update;
 if v_shift is null then raise exception 'No tienes turno abierto';end if;
 insert into public.cash_movements(shift_id,actor_id,amount,reason) values(v_shift,v_user,p_amount,trim(p_reason)) returning id into v_id;
 return v_id;
end$$;
create or replace function public.close_cash_shift(p_counted numeric,p_notes text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_shift public.cash_shifts%rowtype;v_cash numeric;v_transfer numeric;v_card numeric;v_mov numeric;v_expected numeric;v_user uuid:=(select auth.uid());
begin
 if v_user is null then raise exception 'Inicia sesión';end if;
 if p_counted is null or p_counted<0 then raise exception 'Efectivo contado inválido';end if;
 select * into v_shift from public.cash_shifts where seller_id=v_user and closed_at is null for update;
 if not found then raise exception 'No tienes turno abierto';end if;
 select coalesce(sum(total) filter(where payment_method='efectivo'),0),coalesce(sum(total) filter(where payment_method='transferencia'),0),coalesce(sum(total) filter(where payment_method='tarjeta'),0)
 into v_cash,v_transfer,v_card from public.sales where shift_id=v_shift.id;
 select coalesce(sum(amount),0) into v_mov from public.cash_movements where shift_id=v_shift.id;
 v_expected:=v_shift.opening_cash+v_cash+v_mov;
 update public.cash_shifts set closed_at=now(),counted_cash=p_counted,expected_cash=v_expected,cash_sales=v_cash,transfer_sales=v_transfer,card_sales=v_card,cash_movements_total=v_mov,variance=p_counted-v_expected,close_notes=left(coalesce(p_notes,''),1000) where id=v_shift.id;
 return v_shift.id;
end$$;
revoke all on function public.open_cash_shift(text,numeric) from public,anon;
revoke all on function public.record_cash_movement(numeric,text) from public,anon;
revoke all on function public.close_cash_shift(numeric,text) from public,anon;
grant execute on function public.open_cash_shift(text,numeric) to authenticated;
grant execute on function public.record_cash_movement(numeric,text) to authenticated;
grant execute on function public.close_cash_shift(numeric,text) to authenticated;
