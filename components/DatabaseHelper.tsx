import React, { useState } from 'react';
import { ClipboardIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface DatabaseHelperProps {
  projectRef: string | null;
  errorMessage: string;
}

const CollapsibleSQLSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);

    const sqlContent = React.Children.toArray(children).join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(sqlContent);
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
                            {sqlContent}
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
    const fullSetupSql = `-- This robust script sets up your database, enables role-based access, and fixes common errors.
-- It is idempotent, meaning it is safe to run this script multiple times.

-- STEP 1: Enable required extensions
-- The pgcrypto extension provides hashing functions needed for setting customer passwords securely.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- STEP 2: Grant necessary schema permissions to Supabase's roles.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO postgres;

-- STEP 3: Create a 'profiles' table to store user roles and approval status.
-- This table links to auth users and defaults new users to 'staff' role and 'pending' status.
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- (FIX) Add status column to profiles table if it doesn't exist for backward compatibility.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));

-- STEP 4: Create a helper function to securely check the CALLING user's role.
-- This function is SECURITY DEFINER, so it bypasses RLS to read the user's role from the profiles table.
-- It is safe because it only ever checks the role of the currently authenticated user (auth.uid()).
-- This function can be safely used in RLS policies for ANY table EXCEPT the 'profiles' table itself to avoid recursion.
CREATE OR REPLACE FUNCTION check_user_role(role_to_check TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE -- Add STABLE to hint to the planner and prevent inlining.
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = role_to_check AND status = 'approved'
  );
END;
$$;
-- Grant permission for any logged-in user to call this function.
GRANT EXECUTE ON FUNCTION check_user_role(TEXT) TO authenticated;


-- STEP 5: Apply Row Level Security (RLS) to the 'profiles' table.
-- (FIX) RLS policies for 'profiles' are rewritten to be non-recursive. They DO NOT call check_user_role().
-- Admin actions on this table are handled by SECURITY DEFINER functions which bypass RLS.
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Clean slate: drop any existing policies on the profiles table to avoid conflicts.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profile Read Access" ON public.profiles;
DROP POLICY IF EXISTS "Profile Write Access" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can write to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read their own profile, and admins can read all" ON public.profiles;
-- (FIX) Drop the currently used policy names to ensure the script is re-runnable.
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

-- RLS POLICY FOR READING (SELECT):
-- Any authenticated user can read their own profile. This is safe and non-recursive.
CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
  );

-- RLS POLICY FOR WRITING (INSERT, UPDATE, DELETE):
-- For direct table access, users can only modify their own profile.
-- Admin modifications are handled by SECURITY DEFINER RPCs which bypass this policy.
CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL
  USING ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- STEP 6: Create a trigger to automatically create a profile when a new user signs up.
-- (FIX) This trigger now intelligently ignores users created for customers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Do not create a profile for users created via the customer management flow.
  -- They are identified by app_metadata. This avoids customers being treated as pending staff.
  IF new.raw_app_meta_data->>'is_customer' = 'true' THEN
    RETURN new;
  END IF;
  
  INSERT INTO public.profiles (id, role, status)
  VALUES (new.id, 'staff', 'pending');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- STEP 7: Create secure functions for admins to manage users.
-- These functions are SECURITY DEFINER, so they bypass RLS and can perform admin actions safely.
-- The check for admin privileges inside them is safe because it's not part of an RLS policy evaluation context.

-- Function to get all users, callable by admins only.
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
        RAISE EXCEPTION 'User does not have admin privileges';
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


-- Function to delete a user, callable by admins only.
DROP FUNCTION IF EXISTS public.delete_user_by_id(uuid);
CREATE OR REPLACE FUNCTION delete_user_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'User does not have admin privileges';
    END IF;
    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Admins cannot delete their own account';
    END IF;
    
    PERFORM auth.admin_delete_user(target_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION delete_user_by_id(uuid) TO authenticated;

-- Function to create a new user, callable by admins only.
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
SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
    new_user auth.users;
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'User does not have admin privileges';
    END IF;

    -- Create user in auth schema
    SELECT * INTO new_user FROM auth.users WHERE email = p_email;
    IF new_user IS NOT NULL THEN
        RAISE EXCEPTION 'User with this email already exists.';
    END IF;
    
    -- (FIX) Use the more modern, explicit signature for creating a user.
    -- This avoids ambiguity and is less likely to be removed in future Supabase versions.
    SELECT id INTO new_user_id FROM auth.admin_create_user(
        jsonb_build_object(
            'email', p_email,
            'password', p_password,
            'email_confirm', true
        )
    );

    -- The handle_new_user trigger inserts a 'pending' profile. Update it to be 'approved'.
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

-- Function for admins to approve or reject users.
CREATE OR REPLACE FUNCTION update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'User does not have admin privileges';
    END IF;

    IF auth.uid() = target_user_id THEN
        RAISE EXCEPTION 'Admins cannot change their own approval status';
    END IF;

    IF new_status NOT IN ('pending', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status value';
    END IF;
    
    UPDATE public.profiles
    SET status = new_status
    WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION update_user_status(uuid, text) TO authenticated;


-- STEP 8: Create all other application tables if they don't already exist.
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
-- Make phone numbers unique for login purposes.
-- This creates a unique index that allows multiple NULL or empty string values,
-- but ensures any actual phone number provided is unique.
DROP INDEX IF EXISTS customers_phone_unique_not_null_idx;
CREATE UNIQUE INDEX customers_phone_unique_not_null_idx
ON public.customers (phone)
WHERE phone IS NOT NULL AND phone <> '';

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "previousBalance" real NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "balanceAsOfDate" date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "userId" uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;


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


-- STEP 9: Grant table-level permissions and apply RLS policies.

-- First, grant basic postgres permissions. RLS policies will then filter the rows.
-- This is critical for access. Without this, RLS policies will not even be evaluated.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.website_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.website_content TO authenticated;

-- Customers Table Policies
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all customers" ON public.customers;
CREATE POLICY "Admins can manage all customers" ON public.customers FOR ALL
  USING ( check_user_role('admin') )
  WITH CHECK ( check_user_role('admin') );

DROP POLICY IF EXISTS "Staff can view all customers" ON public.customers;
CREATE POLICY "Staff can view all customers" ON public.customers FOR SELECT
  USING ( check_user_role('admin') OR check_user_role('staff') );
  
DROP POLICY IF EXISTS "Customers can view their own record" ON public.customers;
CREATE POLICY "Customers can view their own record" ON public.customers FOR SELECT
  USING ( auth.uid() = "userId" );
  
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Orders Table Policies
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff and Admins can manage orders" ON public.orders;
CREATE POLICY "Staff and Admins can manage orders" ON public.orders FOR ALL
  USING ( check_user_role('admin') OR check_user_role('staff') )
  WITH CHECK ( check_user_role('admin') OR check_user_role('staff') );
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Deliveries Table Policies
ALTER TABLE public.deliveries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage deliveries" ON public.deliveries;
CREATE POLICY "Admins can manage deliveries" ON public.deliveries FOR ALL
  USING ( check_user_role('admin') )
  WITH CHECK ( check_user_role('admin') );
  
DROP POLICY IF EXISTS "Authenticated users can view deliveries" ON public.deliveries;
CREATE POLICY "Authenticated users can view deliveries" ON public.deliveries FOR SELECT
  USING ( check_user_role('admin') OR check_user_role('staff') );
  
DROP POLICY IF EXISTS "Customers can view their own deliveries" ON public.deliveries;
CREATE POLICY "Customers can view their own deliveries" ON public.deliveries FOR SELECT
  USING (
    EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = "customerId" AND c."userId" = auth.uid()
    )
  );
  
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Pending Deliveries Table Policies
ALTER TABLE public.pending_deliveries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff and Admins can manage pending deliveries" ON public.pending_deliveries;
CREATE POLICY "Staff and Admins can manage pending deliveries" ON public.pending_deliveries FOR ALL
  USING ( check_user_role('admin') OR check_user_role('staff') )
  WITH CHECK ( check_user_role('admin') OR check_user_role('staff') );
ALTER TABLE public.pending_deliveries ENABLE ROW LEVEL SECURITY;

-- Payments Table Policies
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL
  USING ( check_user_role('admin') )
  WITH CHECK ( check_user_role('admin') );

DROP POLICY IF EXISTS "Staff can view payments" ON public.payments;
CREATE POLICY "Staff can view payments" ON public.payments FOR SELECT
  USING ( check_user_role('staff') );
  
DROP POLICY IF EXISTS "Customers can view their own payments" ON public.payments;
CREATE POLICY "Customers can view their own payments" ON public.payments FOR SELECT
  USING (
    EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = "customerId" AND c."userId" = auth.uid()
    )
  );

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Website Content Table Policies
ALTER TABLE public.website_content DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage website content" ON public.website_content;
CREATE POLICY "Admins can manage website content" ON public.website_content FOR ALL
  USING ( check_user_role('admin') )
  WITH CHECK ( check_user_role('admin') );

DROP POLICY IF EXISTS "Public can read website content" ON public.website_content;
CREATE POLICY "Public can read website content" ON public.website_content FOR SELECT USING (true);
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;

-- STEP 10: Create helper functions for the customer login flow.
-- These are SECURITY DEFINER to safely bypass RLS for specific, controlled actions.

-- (FIX) This function is updated to add metadata to customer auth accounts.
DROP FUNCTION IF EXISTS public.admin_set_customer_password(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_set_customer_password(
    p_customer_id uuid,
    p_password text
)
RETURNS uuid -- returns the auth user's ID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_user_id uuid;
    v_phone text;
    v_email text;
    auth_user_id_with_email uuid;
    new_auth_user_id uuid;
BEGIN
    -- 1. Ensure the caller is an admin
    IF NOT check_user_role('admin') THEN
        RAISE EXCEPTION 'User does not have admin privileges';
    END IF;

    -- 2. Get customer's phone and existing userId
    SELECT "userId", right(regexp_replace(phone, '\D', '', 'g'), 10)
    INTO v_customer_user_id, v_phone
    FROM public.customers WHERE id = p_customer_id;

    IF v_phone IS NULL OR length(v_phone) <> 10 THEN
        RAISE EXCEPTION 'Customer must have a valid 10-digit phone number to set a password.';
    END IF;

    v_email := v_phone || '@ssfarmorganic.local';

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long.';
    END IF;

    -- 3. Check for a conflicting auth user with the target email
    SELECT id INTO auth_user_id_with_email FROM auth.users WHERE email = v_email;

    -- 4. Main Logic
    IF v_customer_user_id IS NOT NULL THEN
        -- CASE A: Customer is already linked to an auth user.
        IF auth_user_id_with_email IS NOT NULL AND auth_user_id_with_email <> v_customer_user_id THEN
            -- CONFLICT: The target email is taken by ANOTHER auth user. Delete it.
            PERFORM auth.admin_delete_user(auth_user_id_with_email);
        END IF;
        
        PERFORM auth.admin_update_user_by_id(
            v_customer_user_id,
            jsonb_build_object(
                'email', v_email,
                'password', p_password,
                'email_confirm', true,
                'app_metadata', jsonb_build_object('is_customer', true)
            )
        );
        RETURN v_customer_user_id;

    ELSE
        -- CASE B: Customer is NOT linked to an auth user.
        IF auth_user_id_with_email IS NOT NULL THEN
            -- An unlinked auth user already exists. Take it over and mark as customer.
            PERFORM auth.admin_update_user_by_id(
                auth_user_id_with_email,
                jsonb_build_object(
                    'password', p_password,
                    'app_metadata', jsonb_build_object('is_customer', true)
                )
            );
            UPDATE public.customers SET "userId" = auth_user_id_with_email WHERE id = p_customer_id;
            RETURN auth_user_id_with_email;
        ELSE
            -- No auth user exists for this phone/email. Create a new one and mark as customer.
            SELECT id INTO new_auth_user_id FROM auth.admin_create_user(
                jsonb_build_object(
                    'email', v_email,
                    'password', p_password,
                    'email_confirm', true,
                    'app_metadata', jsonb_build_object('is_customer', true)
                )
            );
            UPDATE public.customers SET "userId" = new_auth_user_id WHERE id = p_customer_id;
            RETURN new_auth_user_id;
        END IF;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_password(uuid, text) TO authenticated;


-- Function to check if a customer exists by phone number.
-- This is made robust to handle different phone number formats (+91, no prefix, spaces, etc.).
-- Granting to 'anon' allows the login page to check for a number before sending an OTP.
CREATE OR REPLACE FUNCTION public.customer_exists_by_phone(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    ten_digit_input text;
BEGIN
    -- Extract the last 10 digits from the input, which is the standard mobile number in India.
    ten_digit_input := right(regexp_replace(p_phone, '\D', '', 'g'), 10);

    -- Check if a customer exists with a matching 10-digit number, ignoring formatting in the database.
    RETURN EXISTS (
      SELECT 1
      FROM public.customers
      WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = ten_digit_input
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.customer_exists_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_exists_by_phone(text) TO authenticated;

-- Function for a newly signed-in user to link their auth ID to their customer profile.
-- It's safe because it only ever uses the ID of the *currently calling user* (auth.uid()).
-- This version robustly matches phone numbers regardless of formatting.
CREATE OR REPLACE FUNCTION public.link_customer_to_auth_user(p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    ten_digit_input text;
BEGIN
    -- Extract the last 10 digits from the input to ensure a consistent format for matching.
    ten_digit_input := right(regexp_replace(p_phone, '\D', '', 'g'), 10);

    -- Find the customer with the matching 10-digit number and link their auth ID.
    UPDATE public.customers
    SET "userId" = auth.uid()
    WHERE right(regexp_replace(phone, '\D', '', 'g'), 10) = ten_digit_input;
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_customer_to_auth_user(text) TO authenticated;


-- Cleanup old function to avoid confusion
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.create_customer_login(uuid);

-- Script finished. All tables and policies are now correctly configured.
`;

    const hardResetSql = `-- DANGER: THIS SCRIPT PERMANENTLY DELETES ALL DATA.
-- There is no undo. Please be certain before running this.

DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.pending_deliveries CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.website_content CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.check_user_role(text);
DROP FUNCTION IF EXISTS public.get_all_users();
DROP FUNCTION IF EXISTS public.delete_user_by_id(uuid);
DROP FUNCTION IF EXISTS public.create_new_user(text, text, text);
DROP FUNCTION IF EXISTS public.update_user_status(uuid, text);
DROP FUNCTION IF EXISTS public.create_customer_login(uuid);
DROP FUNCTION IF EXISTS public.customer_exists_by_phone(text);
DROP FUNCTION IF EXISTS public.link_customer_to_auth_user(text);
DROP FUNCTION IF EXISTS public.admin_set_customer_password(uuid, text);


-- After running this, you MUST run the 'Full Setup Script' to recreate the tables.
`;

    return (
        <div className="bg-white border border-red-200 shadow-lg rounded-lg p-6 max-w-4xl mx-auto" role="alert">
            <h2 className="text-2xl font-bold text-red-600">Action Required: Database Fix</h2>
            <div className="mt-4 text-gray-700 space-y-4">
                 <p>It looks like your app's code and your database are out of sync. This is a common issue and is easy to fix!</p>
                 <p className="font-semibold">The script below will safely update your database schema without deleting any of your data.</p>
                {errorMessage && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="font-semibold text-red-700">Specific Error Detected:</p>
                        <p className="text-red-600 text-sm mt-1 font-mono">{errorMessage}</p>
                        <p className="text-red-800 text-sm mt-2">This error usually means a database column is missing or Supabase's internal "schema cache" is out of date. Running the setup script below is the correct solution.</p>
                    </div>
                )}
                
                <div className="mt-4 p-4 border-l-4 border-blue-400 bg-blue-50 space-y-2">
                    <h4 className="font-bold text-blue-800">Instructions</h4>
                    <p className="text-blue-700"><strong>Step 1:</strong> Click the button below to open your Supabase SQL Editor in a new tab.</p>
                    <p className="text-blue-700"><strong>Step 2:</strong> Copy the **"Full Setup &amp; Definitive Fix Script"** below and paste it into the SQL Editor. Click **"RUN"**. This script is safe to run multiple times and will ensure your database schema is correct.</p>
                     <div className="p-3 my-2 border border-blue-200 bg-blue-100 rounded-md">
                        <p className="text-blue-800 font-bold">Step 3 (CRITICAL): Set Your Role to 'admin'</p>
                        <p className="text-blue-700 mt-1">Your user account must have an associated profile with the role set to 'admin'. If you just signed up, your role was automatically set to 'staff' and needs to be updated.</p>
                        <p className="text-blue-700 mt-1"><em>Note: The application doesn't use a hardcoded admin email. Any user can be an admin as long as their role is set correctly here.</em></p>
                        <ol className="list-decimal pl-6 text-blue-700 space-y-2 mt-2">
                            <li>
                                <strong>Find Your User ID:</strong>
                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                    <li>In your Supabase project, go to the <strong>Authentication</strong> section.</li>
                                    <li>Under the <strong>Users</strong> tab, find your email address.</li>
                                    <li>Click the "Copy UID" button next to your user to copy your User ID.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Go to the `profiles` Table:</strong>
                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                    <li>In Supabase, go to the <strong>Table Editor</strong> section (it looks like a table icon).</li>
                                    <li>Click on the `profiles` table in the list on the left.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Find Your Profile and Set Role to 'admin':</strong>
                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                    <li>Look for the row where the `id` column matches the User ID you copied.</li>
                                    <li><strong>If a row for your user exists:</strong> The `role` column likely says 'staff'. Double-click this cell, change the text to <strong>admin</strong>, and click the <strong>Save</strong> button (usually at the bottom or top of the editor).</li>
                                    <li><strong>If no row for your user exists:</strong> Click the green <strong>"+ Insert row"</strong> button. Paste your User ID into the `id` field, type <strong>admin</strong> into the `role` field, and click <strong>Save</strong>.</li>
                                </ul>
                            </li>
                            <li>
                                <strong>Verify:</strong> You should now see one row for your User ID in the `profiles` table, and its `role` must be 'admin'. If so, the problem is fixed.
                            </li>
                        </ol>
                     </div>
                    <p className="text-blue-700"><strong>Step 4:</strong> Come back to this page and click the "Refresh Page" button below, or simply log out and log back in.</p>
                </div>
                
                <a href={projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-transform transform hover:scale-105">
                    Open Supabase SQL Editor
                </a>

                <div className="space-y-6 pt-4">
                    <CollapsibleSQLSection title="✅ Full Setup & Definitive Fix Script (Run This)" defaultOpen={true}>
                        {fullSetupSql}
                    </CollapsibleSQLSection>

                    <CollapsibleSQLSection title="☢️ Hard Reset Script (Optional, Deletes All Data)">
                        {hardResetSql}
                    </CollapsibleSQLSection>
                </div>

                <div className="mt-8 border-t pt-6 text-center">
                    <p className="text-gray-600 font-medium">After completing all steps, click here:</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-transform transform hover:scale-105"
                    >
                        I've updated my database, Refresh Page
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DatabaseHelper;