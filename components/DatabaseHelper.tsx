
import React, { useState } from 'react';
import { ClipboardIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, DownloadIcon, SpinnerIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

interface DatabaseHelperProps {
  projectRef: string | null;
  errorMessage: string;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        let textToCopy = '';
        if (typeof children === 'string') {
            textToCopy = children;
        } else if (Array.isArray(children)) {
             textToCopy = children.join('');
        } else {
             textToCopy = String(children);
        }
        
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="border border-gray-200 rounded-lg mb-4">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                <h3 className="text-lg font-semibold text-gray-800 text-left">{title}</h3>
                {isOpen ? <ChevronUpIcon className="h-5 w-5 text-gray-600" /> : <ChevronDownIcon className="h-5 w-5 text-gray-600" />}
            </button>
            {isOpen && (
                <div className="p-4 border-t">
                    <div className="relative">
                        <pre className="bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                            {children}
                        </pre>
                        <button onClick={handleCopy} className="absolute top-2 right-2 flex items-center px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500">
                            {copied ? <CheckIcon className="h-4 w-4 mr-1 text-green-400" /> : <ClipboardIcon className="h-4 w-4 mr-1" />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const DatabaseHelper: React.FC<DatabaseHelperProps> = ({ projectRef, errorMessage }) => {
    const [isBackingUp, setIsBackingUp] = useState(false);

    const handleBackup = async () => {
        setIsBackingUp(true);
        try {
            const backupData: any = {
                timestamp: new Date().toISOString(),
                tables: {}
            };

            const tables = ['customers', 'deliveries', 'orders', 'payments', 'pending_deliveries', 'website_content', 'website_stats'];
            
            for (const table of tables) {
                const { data, error } = await supabase.from(table).select('*');
                if (error) {
                    console.error(`Error backing up table ${table}:`, error);
                    backupData.tables[table] = { error: error.message };
                } else {
                    backupData.tables[table] = data;
                }
            }

            const { data: users, error: usersError } = await supabase.rpc('get_all_users');
            if (usersError) {
                 console.warn("Could not backup users list via RPC", usersError);
            } else {
                backupData.tables['users_and_profiles'] = users;
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ssfarmorganic_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            alert('Backup downloaded successfully! Please store this file securely.');

        } catch (error: any) {
            alert('Backup failed: ' + getFriendlyErrorMessage(error));
        } finally {
            setIsBackingUp(false);
        }
    };

    const fullSetupSql = `-- 4-TIER ROLE SETUP SCRIPT (Super Admin, Admin, Staff, Customer)
-- This script updates the schema to support hierarchy and specific permissions.

-- STEP 1: Enable Pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- STEP 2: Grant Permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO postgres;

-- STEP 3: Profiles Table Update
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'staff',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN 
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check; 
    END IF; 
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('super_admin', 'admin', 'staff'));

-- STEP 4: Hierarchical Role Checking Function
DROP FUNCTION IF EXISTS check_user_role(text) CASCADE;

CREATE OR REPLACE FUNCTION check_user_role(required_role TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  user_role text;
  user_status text;
BEGIN
  SELECT role, status INTO user_role, user_status
  FROM public.profiles
  WHERE id = auth.uid();

  IF user_status <> 'approved' THEN
    RETURN FALSE;
  END IF;

  IF required_role = 'staff' THEN
    RETURN user_role IN ('staff', 'admin', 'super_admin');
  ELSIF required_role = 'admin' THEN
    RETURN user_role IN ('admin', 'super_admin');
  ELSIF required_role = 'super_admin' THEN
    RETURN user_role = 'super_admin';
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION check_user_role(TEXT) TO authenticated;


-- STEP 5: RLS Policies
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT
  USING ( auth.uid() = id );

CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL
  USING ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- STEP 6: Auto-create Profile Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status)
  VALUES (new.id, 'staff', 'pending');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- STEP 7: Admin Management Functions
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
    id uuid,
    email text,
    role text,
    status text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::text,
        COALESCE(p.role, 'staff'),
        COALESCE(p.status, 'pending'),
        u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id;
END;
$$;
GRANT EXECUTE ON FUNCTION get_all_users() TO authenticated;

DROP FUNCTION IF EXISTS public.delete_user_by_id(uuid);
CREATE OR REPLACE FUNCTION delete_user_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_role text;
    my_role text;
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;
    SELECT role INTO my_role FROM public.profiles WHERE id = auth.uid();

    IF target_role = 'admin' AND my_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can delete Administrators.';
    END IF;

    IF target_role = 'super_admin' THEN
        RAISE EXCEPTION 'Super Admins cannot be deleted.';
    END IF;

    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;
    
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_user_by_id(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.create_new_user(text, text, text);
CREATE OR REPLACE FUNCTION create_new_user(
    p_email text,
    p_password text,
    p_role text
)
RETURNS TABLE (
    id uuid,
    email text,
    role text,
    status text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_user_id uuid;
    v_encrypted_pw text;
    my_role text;
BEGIN
    IF NOT public.check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT role INTO my_role FROM public.profiles WHERE id = auth.uid();

    IF p_role = 'admin' AND my_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can create Administrator accounts.';
    END IF;
    
    IF p_role = 'super_admin' THEN
         RAISE EXCEPTION 'Cannot create Super Admin accounts via this interface.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'User with this email already exists.';
    END IF;
    
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));
    
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
        email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        p_email, v_encrypted_pw, now(),
        '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
    ) RETURNING auth.users.id INTO new_user_id;

    UPDATE public.profiles
    SET role = p_role,
        status = 'approved'
    WHERE id = new_user_id;

    RETURN QUERY
    SELECT u.id, u.email::text, p.role, p.status, u.created_at
    FROM auth.users u
    JOIN public.profiles p ON u.id = p.id
    WHERE u.id = new_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_new_user(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    UPDATE public.profiles SET status = new_status WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION update_user_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    my_role text;
    target_current_role text;
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT role INTO my_role FROM public.profiles WHERE id = auth.uid();
    SELECT role INTO target_current_role FROM public.profiles WHERE id = target_user_id;

    IF (new_role = 'admin' OR target_current_role = 'admin') AND my_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can manage Admin roles.';
    END IF;

    IF target_current_role = 'super_admin' OR new_role = 'super_admin' THEN
         RAISE EXCEPTION 'Super Admin roles cannot be modified via this interface.';
    END IF;

    IF new_role NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'Invalid role.';
    END IF;

    UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_update_user_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_reset_user_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    my_role text;
    target_role text;
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT role INTO my_role FROM public.profiles WHERE id = auth.uid();
    SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;

    IF my_role = 'super_admin' THEN
        NULL;
    ELSIF my_role = 'admin' THEN
        IF target_role <> 'staff' THEN
            RAISE EXCEPTION 'Admins can only reset passwords for Staff members.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access denied.';
    END IF;

    UPDATE auth.users 
    SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_reset_user_password(uuid, text) TO authenticated;


-- STEP 8: Application Tables
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL,
    phone text,
    email text,
    "userId" uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    "milkPrice" real NOT NULL,
    "defaultQuantity" real NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    "previousBalance" real NOT NULL DEFAULT 0,
    "balanceAsOfDate" date
);
DROP INDEX IF EXISTS customers_phone_unique_not_null_idx;
CREATE UNIQUE INDEX customers_phone_unique_not_null_idx ON public.customers (phone) WHERE phone IS NOT NULL AND phone <> '';

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "locationLat" double precision;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "locationLng" double precision;

CREATE TABLE IF NOT EXISTS public.orders (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    quantity real NOT NULL,
    CONSTRAINT orders_customer_id_date_key UNIQUE ("customerId", date)
);
CREATE TABLE IF NOT EXISTS public.deliveries (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    quantity real NOT NULL,
    CONSTRAINT deliveries_customer_id_date_key UNIQUE ("customerId", date)
);
CREATE TABLE IF NOT EXISTS public.pending_deliveries (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    quantity real NOT NULL,
    "userId" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    CONSTRAINT pending_deliveries_customer_id_date_key UNIQUE ("customerId", date)
);
CREATE TABLE IF NOT EXISTS public.payments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    amount real NOT NULL
);
CREATE TABLE IF NOT EXISTS public.website_content (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    content jsonb NOT NULL,
    "userId" uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);


-- STEP 9: Table Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view/add customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can update customers" ON public.customers;
DROP POLICY IF EXISTS "Customers can view their own record" ON public.customers;

CREATE POLICY "Admins can manage all customers" ON public.customers FOR ALL
  USING ( check_user_role('admin') ) WITH CHECK ( check_user_role('admin') );
CREATE POLICY "Staff can view/add customers" ON public.customers FOR SELECT
  USING ( check_user_role('staff') );
CREATE POLICY "Staff can insert customers" ON public.customers FOR INSERT
  WITH CHECK ( check_user_role('staff') );
CREATE POLICY "Staff can update customers" ON public.customers FOR UPDATE
  USING ( check_user_role('staff') )
  WITH CHECK ( check_user_role('staff') );
CREATE POLICY "Customers can view their own record" ON public.customers FOR SELECT
  USING ( "userId" = auth.uid() );
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deliveries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Staff view deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Customers view own deliveries" ON public.deliveries;
CREATE POLICY "Admins manage deliveries" ON public.deliveries FOR ALL
  USING ( check_user_role('admin') );
CREATE POLICY "Staff view deliveries" ON public.deliveries FOR SELECT
  USING ( check_user_role('staff') );
CREATE POLICY "Customers view own deliveries" ON public.deliveries FOR SELECT
  USING ( "customerId" IN (SELECT id FROM public.customers WHERE "userId" = auth.uid()) );
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pending_deliveries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage pending" ON public.pending_deliveries;
DROP POLICY IF EXISTS "Staff manage pending" ON public.pending_deliveries;
CREATE POLICY "Admins manage pending" ON public.pending_deliveries FOR ALL
  USING ( check_user_role('admin') );
CREATE POLICY "Staff manage pending" ON public.pending_deliveries FOR ALL
  USING ( check_user_role('staff') );
ALTER TABLE public.pending_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
DROP POLICY IF EXISTS "Staff view payments" ON public.payments;
DROP POLICY IF EXISTS "Customers view own payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL
  USING ( check_user_role('admin') );
CREATE POLICY "Staff view payments" ON public.payments FOR SELECT
  USING ( check_user_role('staff') );
CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT
  USING ( "customerId" IN (SELECT id FROM public.customers WHERE "userId" = auth.uid()) );
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Admins manage orders" ON public.orders FOR ALL
  USING ( check_user_role('admin') );
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL
  USING ( check_user_role('staff') );
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.website_content DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage content" ON public.website_content;
DROP POLICY IF EXISTS "Public view content" ON public.website_content;
CREATE POLICY "Admins manage content" ON public.website_content FOR ALL
  USING ( check_user_role('admin') );
CREATE POLICY "Public view content" ON public.website_content FOR SELECT
  USING ( true );
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;


-- STEP 10: Helper Functions
CREATE OR REPLACE FUNCTION admin_set_customer_password(p_customer_id uuid, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_customer_phone text;
  v_user_id uuid;
  v_email text;
  v_rows_updated int;
BEGIN
  IF NOT check_user_role('admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT phone, "userId" INTO v_customer_phone, v_user_id FROM public.customers WHERE id = p_customer_id;
  IF v_customer_phone IS NULL OR LENGTH(v_customer_phone) < 10 THEN
     RAISE EXCEPTION 'Invalid customer phone number';
  END IF;
  v_customer_phone := REGEXP_REPLACE(v_customer_phone, '[^0-9]', '', 'g');
  v_customer_phone := RIGHT(v_customer_phone, 10);
  v_email := v_customer_phone || '@ssfarmorganic.local';
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users 
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now(),
        raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider": "email", "providers": ["email"]}'::jsonb),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
    WHERE id = v_user_id;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN v_user_id := NULL; END IF;
  END IF;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    IF v_user_id IS NOT NULL THEN
       UPDATE auth.users 
       SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now(),
           raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider": "email", "providers": ["email"]}'::jsonb),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
       WHERE id = v_user_id;
    ELSE
       v_user_id := gen_random_uuid();
       INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now());
    END IF;
    UPDATE public.customers SET "userId" = v_user_id WHERE id = p_customer_id;
  END IF;
  RETURN v_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_set_customer_password(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_delete_customer_login(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    SELECT "userId" INTO v_user_id FROM public.customers WHERE id = p_customer_id;
    IF v_user_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_user_id;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_delete_customer_login(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION link_customer_to_auth_user(p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_phone || '@ssfarmorganic.local';
  IF v_user_id IS NOT NULL THEN
    UPDATE public.customers SET "userId" = v_user_id WHERE phone = '+91' || p_phone OR phone = p_phone OR phone LIKE '%' || p_phone;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION link_customer_to_auth_user(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.website_stats (
    name text PRIMARY KEY,
    value bigint DEFAULT 0
);
INSERT INTO public.website_stats (name, value) VALUES ('total_visits', 0) ON CONFLICT (name) DO NOTHING;
ALTER TABLE public.website_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public view stats" ON public.website_stats;
CREATE POLICY "Public view stats" ON public.website_stats FOR SELECT USING (true);
CREATE OR REPLACE FUNCTION increment_visitor_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_val bigint;
BEGIN
  INSERT INTO public.website_stats (name, value) VALUES ('total_visits', 1)
  ON CONFLICT (name) DO UPDATE SET value = website_stats.value + 1
  RETURNING value INTO new_val;
  RETURN new_val;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_visitor_count() TO anon, authenticated, service_role;

-- BOOTSTRAP SUPER ADMINS WITH CORRECT PASSWORDS
DO $$
DECLARE
  v_emails text[] := ARRAY['sravanaig@gmail.com', 'sravandbe@gmail.com'];
  v_email text;
  v_password text;
  v_admin_id uuid;
BEGIN
  FOREACH v_email IN ARRAY v_emails
  LOOP
    -- Set password based on email
    IF v_email = 'sravandbe@gmail.com' THEN
        v_password := '@bhi#ari2106';
    ELSE
        v_password := 'Gsravan@14';
    END IF;

    SELECT id INTO v_admin_id FROM auth.users WHERE email = v_email;

    IF v_admin_id IS NULL THEN
      v_admin_id := gen_random_uuid();
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now());
    ELSE
      UPDATE auth.users 
      SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
          email_confirmed_at = now(), updated_at = now()
      WHERE id = v_admin_id;
    END IF;

    INSERT INTO public.profiles (id, role, status)
    VALUES (v_admin_id, 'super_admin', 'approved')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', status = 'approved';
  END LOOP;
END $$;`;

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Database Troubleshooting & Setup</h3>
                {errorMessage && (
                    <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                        <p className="font-bold">Detected Error:</p>
                        <p className="font-mono text-sm mt-1">{errorMessage}</p>
                    </div>
                )}
                <div className="mb-6">
                    <h4 className="font-semibold text-gray-700 mb-2">1. Backup Data</h4>
                    <button onClick={handleBackup} disabled={isBackingUp} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {isBackingUp ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : <DownloadIcon className="h-5 w-5 mr-2" />}
                        {isBackingUp ? 'Creating Backup...' : 'Download Full Backup'}
                    </button>
                </div>
                <div className="mb-6">
                    <h4 className="font-semibold text-gray-700 mb-2">2. Database Setup Script</h4>
                    <CollapsibleSection title="View Full Setup SQL" defaultOpen={true}>
                        {fullSetupSql}
                    </CollapsibleSection>
                </div>
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                    <p className="font-semibold">Instructions:</p>
                    <ol className="list-decimal ml-5 mt-1 space-y-1">
                        <li>Go to your <a href={`https://supabase.com/dashboard/project/${projectRef}/sql`} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">Supabase SQL Editor</a>.</li>
                        <li>Copy the SQL script above.</li>
                        <li>Paste and click "Run".</li>
                        <li>Refresh this page.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default DatabaseHelper;
