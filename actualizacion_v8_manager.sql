-- V8: ejecutar en SQL Editor de Supabase con cuenta propietaria del proyecto.
-- No se crea una contraseña fija ni un usuario de Authentication desde SQL.
-- Primero crea/invita el correo del gerente en Authentication > Users.
-- Después cambia 'GERENTE@EJEMPLO.COM' por su correo real y ejecuta el bloque de asignación al final.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('seller','admin','manager'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.is_manager() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='manager' AND enabled=true) $$;
CREATE TABLE IF NOT EXISTS public.app_settings (key text PRIMARY KEY,value text NOT NULL DEFAULT '');
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings read" ON public.app_settings;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings manager write" ON public.app_settings;
CREATE POLICY "settings manager write" ON public.app_settings FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role IN ('admin','manager') AND enabled=true) $$;
-- Gerente puede modificar roles de otros usuarios; nunca su propio rol ni deshabilitarse.
CREATE OR REPLACE FUNCTION public.manager_update_profile(p_user uuid,p_role text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_manager() THEN RAISE EXCEPTION 'Solo gerente general'; END IF;
 IF p_user=(SELECT auth.uid()) THEN RAISE EXCEPTION 'No puedes modificar tu propia cuenta'; END IF;
 IF p_role NOT IN ('seller','admin','manager') OR p_enabled IS NULL THEN RAISE EXCEPTION 'Parámetros inválidos'; END IF;
 UPDATE public.profiles SET role=p_role,enabled=p_enabled WHERE id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.manager_update_profile(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manager_update_profile(uuid,text,boolean) TO authenticated;
-- Las políticas existentes de escritura a catálogo usan is_admin() y ahora incluyen manager.
-- Proteger cuentas deshabilitadas en funciones de ventas, caja y stock: revocar acceso
-- o agregar comprobaciones enabled=true en cada RPC antes de producción.
-- Ejecutar por separado después de crear el usuario en Authentication:
-- UPDATE public.profiles SET role='manager',enabled=true
-- WHERE id=(SELECT id FROM auth.users WHERE lower(email)=lower('GERENTE@EJEMPLO.COM'));
