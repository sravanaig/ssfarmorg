
import React, { useState } from 'react';
import { ClipboardIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface DatabaseHelperProps {
  projectRef: string | null;
  errorMessage: string;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);

    const contentString = React.Children.toArray(children).join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(contentString);
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
                        <pre className="bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto">
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

-- UPDATE ROLE CONSTRAINT to include 'super_admin'
-- We drop the old constraint if it exists to allow the new role.
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN 
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check; 
    END IF; 
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('super_admin', 'admin', 'staff'));

-- STEP 4: Hierarchical Role Checking Function
-- This is critical. It allows 'admin' to do everything 'staff' can, and 'super_admin' to do everything 'admin' can.
-- Drop first to avoid parameter name conflicts if signature changes. 
-- CASCADE is required because RLS policies depend on this function.
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

  -- Hierarchy Logic
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


-- STEP 5: RLS Policies (Updated to use hierarchical check_user_role)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Clean old policies
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

-- Profiles Policies
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
  -- Default role is staff, default status is pending.
  -- Super admin is set manually via migration script below.
  INSERT INTO public.profiles (id, role, status)
  VALUES (new.id, 'staff', 'pending');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- STEP 7: Admin Management Functions (Updated for Hierarchy)

-- Get Users (Admins and Super Admins can view)
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
    -- Check for admin privileges (includes super_admin)
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

-- Delete User (Admins and Super Admins)
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

    -- Protection: Only Super Admin can delete Admins.
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

-- Create User
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

    -- Hierarchy Check: Only Super Admin can create Admins
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

-- Update User Status
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

-- Update User Role
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

    -- Rule: Regular Admins cannot make anyone an Admin or demote an Admin
    IF (new_role = 'admin' OR target_current_role = 'admin') AND my_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Admins can manage Admin roles.';
    END IF;

    -- Rule: Nobody can change Super Admin role via this function
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

-- Other tables (Orders, Deliveries, etc.)
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


-- STEP 9: Table Permissions (Using Hierarchy)

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Customers
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view/add customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can update customers" ON public.customers;
DROP POLICY IF EXISTS "Customers can view their own record" ON public.customers;

-- Admin check includes super_admin
CREATE POLICY "Admins can manage all customers" ON public.customers FOR ALL
  USING ( check_user_role('admin') ) WITH CHECK ( check_user_role('admin') );
  
-- Staff check includes admin and super_admin
CREATE POLICY "Staff can view/add customers" ON public.customers FOR SELECT
  USING ( check_user_role('staff') );
  
CREATE POLICY "Staff can insert customers" ON public.customers FOR INSERT
  WITH CHECK ( check_user_role('staff') );

CREATE POLICY "Staff can update customers" ON public.customers FOR UPDATE
  USING ( check_user_role('staff') ) WITH CHECK ( check_user_role('staff') );

CREATE POLICY "Customers can view their own record" ON public.customers FOR SELECT
  USING ( auth.uid() = "userId" );
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff+ manage orders" ON public.orders;
CREATE POLICY "Staff+ manage orders" ON public.orders FOR ALL USING (check_user_role('staff')) WITH CHECK (check_user_role('staff'));

-- Deliveries
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
-- Explicitly drop delivery policies to prevent conflicts
DROP POLICY IF EXISTS "Admins manage deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Staff view deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Customers view own deliveries" ON public.deliveries;

-- Only Admins can manage final deliveries table directly (Staff use pending)
CREATE POLICY "Admins manage deliveries" ON public.deliveries FOR ALL USING (check_user_role('admin')) WITH CHECK (check_user_role('admin'));
CREATE POLICY "Staff view deliveries" ON public.deliveries FOR SELECT USING (check_user_role('staff'));
CREATE POLICY "Customers view own deliveries" ON public.deliveries FOR SELECT USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = "customerId" AND c."userId" = auth.uid()));

-- Pending Deliveries
ALTER TABLE public.pending_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff+ manage pending" ON public.pending_deliveries;
CREATE POLICY "Staff+ manage pending" ON public.pending_deliveries FOR ALL USING (check_user_role('staff')) WITH CHECK (check_user_role('staff'));

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
DROP POLICY IF EXISTS "Staff view payments" ON public.payments;
DROP POLICY IF EXISTS "Customers view own payments" ON public.payments;

CREATE POLICY "Admins manage payments" ON public.payments FOR ALL USING (check_user_role('admin')) WITH CHECK (check_user_role('admin'));
CREATE POLICY "Staff view payments" ON public.payments FOR SELECT USING (check_user_role('staff'));
CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = "customerId" AND c."userId" = auth.uid()));

-- Website Content
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin manage content" ON public.website_content;
DROP POLICY IF EXISTS "Public read content" ON public.website_content;

CREATE POLICY "Super Admin manage content" ON public.website_content FOR ALL USING (check_user_role('super_admin')) WITH CHECK (check_user_role('super_admin'));
CREATE POLICY "Public read content" ON public.website_content FOR SELECT USING (true);


-- STEP 10: BOOTSTRAP SUPER ADMIN
-- This block promotes sravanaig@gmail.com to super_admin automatically.
DO $$
DECLARE
    target_email text := 'sravanaig@gmail.com';
    target_uid uuid;
BEGIN
    SELECT id INTO target_uid FROM auth.users WHERE email = target_email;
    
    IF target_uid IS NOT NULL THEN
        -- Ensure profile exists
        INSERT INTO public.profiles (id, role, status)
        VALUES (target_uid, 'super_admin', 'approved')
        ON CONFLICT (id) DO UPDATE
        SET role = 'super_admin', status = 'approved';
    END IF;
END $$;


-- Helper Functions (Password Setting, etc.) - kept same but updated permissions where needed
-- (Omitting full re-declaration for brevity as logic is handled by check_user_role hierarchy)

CREATE OR REPLACE FUNCTION public.customer_exists_by_phone(p_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.customers WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10));
END;
$$;
GRANT EXECUTE ON FUNCTION public.customer_exists_by_phone(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_customer_to_auth_user(p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.customers SET "userId" = auth.uid() WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
    DELETE FROM public.profiles WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_customer_to_auth_user(text) TO authenticated;
`;

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white shadow-lg rounded-lg mt-10">
            <div className="flex items-center space-x-3 mb-6">
                <div className="bg-red-100 p-2 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-800">Database Setup Required</h1>
            </div>
            
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                <p className="font-bold text-red-700">Error Detected:</p>
                <p className="text-red-600">{errorMessage}</p>
            </div>

            <p className="text-gray-600 mb-6">
                To fix this, you need to run the following SQL script in your Supabase SQL Editor. This script will update your database schema to support the latest features, including the multi-tier role system (Super Admin, Admin, Staff, Customer).
            </p>

            <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h3 className="font-semibold text-blue-800 mb-2">Instructions:</h3>
                    <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
                        <li>Copy the SQL script below.</li>
                        <li>Go to your <a href={`https://supabase.com/dashboard/project/${projectRef}/sql`} target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-900">Supabase SQL Editor</a>.</li>
                        <li>Paste the script into the editor.</li>
                        <li>Click <strong>Run</strong>.</li>
                        <li>Once successful, refresh this page.</li>
                    </ol>
                </div>

                <CollapsibleSection title="View Full SQL Script" defaultOpen={true}>
                    {fullSetupSql}
                </CollapsibleSection>
            </div>
        </div>
    );
};

export default DatabaseHelper;
