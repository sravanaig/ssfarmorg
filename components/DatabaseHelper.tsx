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
    const fullSetupSql = `-- This script sets up your database for multi-user support and the CMS.
-- It's safe to run multiple times. It creates tables if they don't exist and applies security policies.

-- STEP 1: Create all required tables if they don't already exist.
-- This version uses UUID for customer IDs to match Supabase standards and prevent type errors.

-- Creates the 'customers' table.
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL,
    phone text NOT NULL,
    "milkPrice" real NOT NULL,
    "defaultQuantity" real NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'active',
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);

-- Creates the 'deliveries' table.
CREATE TABLE IF NOT EXISTS public.deliveries (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    quantity real NOT NULL,
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    CONSTRAINT deliveries_customer_id_date_key UNIQUE ("customerId", date)
);

-- Creates the 'payments' table.
CREATE TABLE IF NOT EXISTS public.payments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    amount real NOT NULL,
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);

-- Creates the 'website_content' table.
CREATE TABLE IF NOT EXISTS public.website_content (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    content jsonb NOT NULL,
    "userId" uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);


-- STEP 2: Enable Row Level Security (RLS) on all tables.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;

-- STEP 3: Create policies for users to manage their OWN data.
DROP POLICY IF EXISTS "Users can manage their own customers" ON public.customers;
CREATE POLICY "Users can manage their own customers" ON public.customers FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "Users can manage their own deliveries" ON public.deliveries;
CREATE POLICY "Users can manage their own deliveries" ON public.deliveries FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "Users can manage their own payments" ON public.payments;
CREATE POLICY "Users can manage their own payments" ON public.payments FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

DROP POLICY IF EXISTS "Users can manage their own website content" ON public.website_content;
CREATE POLICY "Users can manage their own website content" ON public.website_content FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

-- STEP 4: Create policy to allow PUBLIC read access to website content.
DROP POLICY IF EXISTS "Public can read website content" ON public.website_content;
CREATE POLICY "Public can read website content" ON public.website_content FOR SELECT USING (true);

-- STEP 5 (Optional): Assign existing data to your user (if you had data before user accounts).
UPDATE public.customers SET "userId" = auth.uid() WHERE "userId" IS NULL;
UPDATE public.deliveries SET "userId" = auth.uid() WHERE "userId" IS NULL;
UPDATE public.payments SET "userId" = auth.uid() WHERE "userId" IS NULL;
`;

    const hardResetSql = `-- DANGER: THIS SCRIPT PERMANENTLY DELETES ALL CUSTOMER AND DELIVERY DATA.
-- This is intended to fix major schema errors.
-- There is no undo. Please be certain before running this.

DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.website_content CASCADE;

-- After running this, you MUST run the 'Full Setup Script' below to recreate the tables.
`;

    const customersSql = `-- Creates the 'customers' table using UUID for the primary key.
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL,
    phone text NOT NULL,
    "milkPrice" real NOT NULL,
    "defaultQuantity" real NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'active',
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);`;
    
    const deliveriesSql = `-- Creates the 'deliveries' table, referencing the customer's UUID.
CREATE TABLE IF NOT EXISTS public.deliveries (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    quantity real NOT NULL,
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    CONSTRAINT deliveries_customer_id_date_key UNIQUE ("customerId", date)
);`;

    const paymentsSql = `-- Creates the 'payments' table, referencing the customer's UUID.
CREATE TABLE IF NOT EXISTS public.payments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "customerId" uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date date NOT NULL,
    amount real NOT NULL,
    "userId" uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);`;

    const contentSql = `-- Creates the 'website_content' table for the CMS.
CREATE TABLE IF NOT EXISTS public.website_content (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    content jsonb NOT NULL,
    "userId" uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);`;

    const policiesSql = `-- These policies enable Row Level Security (RLS) to protect your data.
-- RLS ensures that each user can only see and manage their own information.
-- It's a critical security feature for multi-user applications.

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to manage their own customers.
DROP POLICY IF EXISTS "Users can manage their own customers" ON public.customers;
CREATE POLICY "Users can manage their own customers" ON public.customers FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

-- Policy: Allow users to manage their own deliveries.
DROP POLICY IF EXISTS "Users can manage their own deliveries" ON public.deliveries;
CREATE POLICY "Users can manage their own deliveries" ON public.deliveries FOR ALL USING (auth.uid() = "userId") WITH CHECK (auth.uid() = "userId");

-- Policy: Allow website visitors (public) to read website content.
DROP POLICY IF EXISTS "Public can read website content" ON public.website_content;
CREATE POLICY "Public can read website content" ON public.website_content FOR SELECT USING (true);
`;

    return (
        <div className="bg-white border border-red-200 shadow-lg rounded-lg p-6 max-w-4xl mx-auto" role="alert">
            <h2 className="text-2xl font-bold text-red-600">Action Required: Database Setup & Repair</h2>
            <div className="mt-4 text-gray-700 space-y-4">
                <p>To secure your data, enable all features, and ensure your website is public, your database schema needs to be up-to-date. This tool helps you fix common database problems.</p>
                {errorMessage && <p className="font-semibold text-red-500">{errorMessage}</p>}
                
                <div className="mt-4 p-4 border-l-4 border-blue-400 bg-blue-50">
                    <h4 className="font-bold text-blue-800">Instructions</h4>
                    <p className="text-blue-700 mt-1">
                        Run the **"Full Setup Script"** in your Supabase SQL Editor. This single script will create all necessary tables with the correct structure and apply security rules. It is safe to run multiple times.
                    </p>
                    <p className="text-blue-700 mt-2">
                        If you have critical errors and want to start fresh, you can run the **"Hard Reset Script"** first to delete all existing data, and then run the Full Setup Script.
                    </p>
                </div>
                
                <a href={projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-transform transform hover:scale-105">
                    Open Supabase SQL Editor
                </a>

                <div className="space-y-6 pt-4">
                     <CollapsibleSQLSection title="☢️ Step 1: Hard Reset Script (Deletes Data)">
                        {hardResetSql}
                    </CollapsibleSQLSection>

                    <CollapsibleSQLSection title="✅ Step 2: Full Setup Script" defaultOpen={true}>
                        {fullSetupSql}
                    </CollapsibleSQLSection>

                    <h3 className="text-xl font-bold text-gray-800 pt-4 border-t">Detailed Breakdown</h3>
                    <p className="text-sm text-gray-600 -mt-4">For your reference, here is the specific SQL for each part of the database. The two-step process above is the recommended way to fix errors.</p>
                    
                    <CollapsibleSQLSection title="Customers Table SQL">
                        {customersSql}
                    </CollapsibleSQLSection>

                    <CollapsibleSQLSection title="Deliveries Table SQL">
                        {deliveriesSql}
                    </CollapsibleSQLSection>

                    <CollapsibleSQLSection title="Payments Table SQL">
                        {paymentsSql}
                    </CollapsibleSQLSection>
                    
                    <CollapsibleSQLSection title="Website Content Table SQL">
                        {contentSql}
                    </CollapsibleSQLSection>

                    <CollapsibleSQLSection title="Security Policies Explained">
                        {policiesSql}
                    </CollapsibleSQLSection>
                </div>

                <div className="mt-8 border-t pt-6 text-center">
                    <p className="text-gray-600 font-medium">After running the SQL scripts, come back and click here:</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-transform transform hover:scale-105"
                    >
                        I've updated my database, Refresh Page
                    </button>
                </div>
                 <div className="mt-6 text-xs text-gray-500 text-center">
                    <p><strong>Troubleshooting:</strong> The scripts are safe to run multiple times. If you see notices like "column already exists" or "policy does not exist", that's perfectly normal.</p>
                </div>
            </div>
        </div>
    );
};

export default DatabaseHelper;