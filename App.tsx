
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Customer, Delivery, Payment } from './types';
import SideNav from './components/SideNav';
import CustomerManager from './components/CustomerManager';
import DeliveryManager from './components/DeliveryManager';
import BillManager from './components/BillManager';
import PaymentManager from './components/PaymentManager';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import { MilkIcon, MenuIcon, LogoutIcon } from './components/Icons';

type View = 'customers' | 'deliveries' | 'bills' | 'payments';
type Page = 'home' | 'login';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  
  const [view, setView] = useState<View>('deliveries');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
        const [
            { data: customersData, error: customersError },
            { data: deliveriesData, error: deliveriesError },
            { data: paymentsData, error: paymentsError }
        ] = await Promise.all([
            supabase.from('customers').select('*').order('name'),
            supabase.from('deliveries').select('*'),
            supabase.from('payments').select('*')
        ]);

        if (customersError) throw customersError;
        if (deliveriesError) throw deliveriesError;
        if (paymentsError) throw paymentsError;

        setCustomers((customersData as Customer[]) || []);
        setDeliveries((deliveriesData as Delivery[]) || []);
        setPayments((paymentsData as Payment[]) || []);

    } catch (error: any) {
         console.error('Error fetching data:', error.message);
         setFetchError(`Error loading data. This might be due to Row Level Security (RLS) policies on your Supabase tables. Please ensure policies are in place to allow authenticated users to read data. Details: ${error.message}`);
    }
  }, []);


  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        await fetchData();
      }
      setIsLoading(false);
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setIsAuthenticated(true);
        if(event === 'SIGNED_IN') {
           fetchData();
        }
      } else {
        setIsAuthenticated(false);
        setCustomers([]);
        setDeliveries([]);
        setPayments([]);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchData]);

  const handleSignUp = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signUp({
        email: email,
        password: pass,
    });
    if (error) {
        console.error('Sign up error:', error.message);
        return { success: false, error: error.message };
    }
    // Supabase sends a confirmation email by default.
    // The user will need to confirm before they can log in.
    return { success: true };
  };

  const handleLogin = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: pass,
    });
    if (error) {
        console.error('Login error:', error.message);
        return { success: false, error: error.message };
    }
    setView('deliveries'); // Reset to default view on login
    return { success: true };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentPage('home'); // Go back to home page on logout
  };

  const renderDashboard = () => {
    const renderView = () => {
        switch (view) {
          case 'customers':
            return <CustomerManager customers={customers} setCustomers={setCustomers} />;
          case 'deliveries':
            return <DeliveryManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} />;
          case 'bills':
            return <BillManager customers={customers} deliveries={deliveries} payments={payments} />;
          case 'payments':
            return <PaymentManager customers={customers} payments={payments} setPayments={setPayments} deliveries={deliveries} />;
          default:
            return <DeliveryManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} />;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <div className={`fixed inset-0 z-20 bg-black bg-opacity-50 transition-opacity lg:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)}></div>
            <SideNav activeView={view} setView={setView} isOpen={isSidebarOpen} setOpen={setSidebarOpen} />
    
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200 lg:justify-end lg:space-x-4">
                  <button onClick={() => setSidebarOpen(true)} className="text-gray-500 focus:outline-none lg:hidden">
                    <MenuIcon className="h-6 w-6" />
                  </button>
                  <div className="flex items-center space-x-2">
                    <MilkIcon className="h-8 w-8 text-blue-600"/>
                    <h1 className="text-2xl font-bold text-gray-800">ssfatmorganic</h1>
                  </div>
                  <button onClick={handleLogout} className="flex items-center px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                      <LogoutIcon className="h-5 w-5 md:mr-2" />
                      <span className="hidden md:block">Logout</span>
                  </button>
                </header>
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 md:p-6 lg:p-8">
                    {fetchError && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
                            <p className="font-bold">Data Fetching Error</p>
                            <p>{fetchError}</p>
                        </div>
                    )}
                    {renderView()}
                </main>
            </div>
        </div>
    );
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
      if (currentPage === 'login') {
          return <LoginPage onLogin={handleLogin} onSignUp={handleSignUp} onBackToHome={() => setCurrentPage('home')} />;
      }
      return <HomePage onLoginClick={() => setCurrentPage('login')} />;
  }

  return renderDashboard();
};

export default App;
