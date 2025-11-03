

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, projectRef } from './lib/supabaseClient';
import type { Customer, Delivery, Payment, WebsiteContent, Order, Profile, PendingDelivery, ManagedUser } from './types';
import SideNav from './components/SideNav';
import CustomerManager from './components/CustomerManager';
import DeliveryManager from './components/DeliveryManager';
import BillManager from './components/BillManager';
import PaymentManager from './components/PaymentManager';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { MilkIcon, MenuIcon, LogoutIcon } from './components/Icons';
import ProductsPage from './components/ProductsPage';
import SharedLayout from './components/SharedLayout';
import CmsManager from './components/CmsManager';
import DatabaseHelper from './components/DatabaseHelper';
import OrderManager from './components/OrderManager';
import StaffDeliveryManager from './components/StaffDeliveryManager';
import DeliveryApprovalManager from './components/DeliveryApprovalManager';
import UserManager from './components/UserManager';
import { getFriendlyErrorMessage } from './lib/errorHandler';
import CalendarView from './components/CalendarView';
import CustomerDashboard from './components/CustomerDashboard';

type View = 'dashboard' | 'customers' | 'orders' | 'deliveries' | 'bills' | 'payments' | 'cms' | 'database' | 'delivery_approvals' | 'logins' | 'calendar';
export type Page = 'home' | 'login' | 'products';

const defaultContent: WebsiteContent = {
  heroSlides: [
    { title: "Pure & Fresh Milk, Every Morning", subtitle: "Straight from our farm to your doorstep, ensuring the highest quality and freshness.", image: "https://images.unsplash.com/photo-1620189507195-68309c04c4d5?q=80&w=2070&auto=format&fit=crop" },
    { title: "100% Organic Goodness", subtitle: "Our milk comes from healthy, grass-fed cows, free from hormones and antibiotics.", image: "https://images.unsplash.com/photo-1495107333503-a287c29515a3?q=80&w=2070&auto=format&fit=crop" },
    { title: "More Than Just Milk", subtitle: "Discover our range of fresh dairy products, including homemade paneer and delicious ghee.", image: "https://images.unsplash.com/photo-1628268812585-1122394c6538?q=80&w=1974&auto=format&fit=crop" },
    { title: "Easy & Reliable Deliveries", subtitle: "Manage your subscriptions and track your deliveries with our simple online dashboard.", image: "https://images.unsplash.com/photo-1550985223-e2b865a7a9df?q=80&w=2070&auto=format&fit=crop" },
    { title: "Join The Freshness Movement", subtitle: "Experience the difference of fresh, organic milk delivered daily.", image: "https://images.unsplash.com/photo-1567523913054-486018a1a312?q=80&w=2070&auto=format&fit=crop" }
  ],
  ourStory: {
    title: "Our Journey to Pure Milk",
    steps: [
      { title: "A Parent's Concern", text: "Our story started with a simple need: pure, chemical-free milk for our own children." },
      { title: "From Tech to Farm", text: "Two IT professionals decided to trade keyboards for pastures to make this dream a reality." },
      { title: "Building the Dream", text: "We established our own organic farm, focusing on happy animals and natural processes." },
      { title: "A Promise Delivered", text: "Today, we deliver that same promise of purity from our family to yours, every single day." }
    ]
  },
  dairyFarm: {
    title: "Straight From Our Dairy Farm",
    text: "Our dairy farm is a sanctuary for our healthy buffaloes. We believe happy, well-cared-for animals produce the best milk, which is why we never use hormones or antibiotics. Our commitment to sustainable farming and animal welfare means every bottle of milk is as pure and natural as it gets."
  },
  whyChooseUs: {
    title: "Why Our Community Chooses Us",
    subtitle: "A promise of quality, transparency, and care in every drop.",
    features: [
      { title: "Uncompromised Purity", text: "100% organic milk from grass-fed cows, free from any additives." },
      { title: "Farm-to-Doorstep Freshness", text: "Wake up to fresh milk every morning with our reliable daily delivery." },
      { title: "Effortless Management", text: "Easily manage deliveries and bills through your dedicated dashboard." },
      { title: "Founded by Parents", text: "A mission you can trust, born from a desire for safe, healthy products." }
    ]
  },
  productsSection: {
    title: "Our Fresh Products",
    subtitle: "Farm-fresh goodness in every drop."
  },
  testimonials: {
    title: "What Our Customers Say",
    subtitle: "We are proud to serve our community with the freshest milk.",
    list: [
      { quote: "The quality of the milk is simply outstanding. You can taste the freshness in every sip. My kids love it, and I trust its purity. The daily delivery is always on time!", name: "Priya S.", role: "Happy Parent" },
      { quote: "I've been a customer for over a year, and ssfarmorganic has never disappointed. The paneer is the best I've ever had - so soft and fresh. The dashboard makes managing my account so easy.", name: "Amit R.", role: "Loyal Customer" },
      { quote: "As someone who is very conscious about health, I am so glad I found this service. Knowing the milk is organic and comes from well-cared-for animals gives me peace of mind.", name: "Sunita K.", role: "Health Enthusiast" }
    ]
  },
  founders: {
    title: "Meet Our Founders",
    subtitle: "The minds and hearts behind your daily freshness.",
    list: [
      { name: "Gillella Sravan Reddy", title: "Co-Founder", bio: "An IT professional turned dairy enthusiast, Sravan is passionate about bringing transparency and quality to your family's table." },
      { name: "Ambala Sudhakar", title: "Co-Founder", bio: "A tech expert with a love for organic living, Sudhakar ensures that every drop of milk is as pure and wholesome as nature intended." }
    ]
  },
  productsPage: {
    title: "Our Farm-Fresh Products",
    subtitle: "Pure, organic, and crafted with care. Discover the taste of nature.",
    products: [
      {
        name: "Buffalo Milk (Organic)",
        description: "Experience the rich, creamy texture and superior taste of our 100% organic buffalo milk. Sourced from grass-fed buffaloes raised in a stress-free environment, our milk is packed with essential nutrients like calcium, protein, and healthy fats. It's perfect for making thick yogurt, delicious sweets, or enjoying on its own.",
        benefits: ["Higher fat content for richer taste", "Excellent source of protein and calcium", "Promotes strong bones and teeth", "Free from hormones and antibiotics"],
        image: "https://images.unsplash.com/photo-1628051233038-02195f4c4b57?q=80&w=1974&auto=format&fit=crop",
        feed: "Our buffaloes graze freely on lush, organic pastures. Their diet consists of homegrown, pesticide-free fodder and natural supplements, ensuring the milk is wholesome and pure.",
        extraction: "We use a gentle, automated milking process in a hygienic, stress-free environment. The milk is untouched by human hands, immediately chilled, and packed to lock in freshness."
      },
      {
        name: "Cow Milk (Organic)",
        description: "Our organic cow milk is the perfect choice for daily nutrition. It's light, fresh, and naturally sweet. Produced by free-range cows that graze on organic pastures, this milk is wholesome and free from any artificial additives. It's an ideal choice for children and adults alike, providing a balanced dose of vitamins and minerals.",
        benefits: ["Easily digestible A2 protein", "Rich in Vitamin D and B12", "Boosts immunity and metabolism", "Certified organic and pure"],
        image: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?q=80&w=1974&auto=format&fit=crop",
        feed: "Our free-range cows enjoy a diverse diet of organic grasses. This natural grazing enhances the nutritional profile of the milk, making it rich in A2 protein and essential vitamins.",
        extraction: "Milking is conducted with modern, clean technology that prioritizes the comfort of our cows. This gentle process guarantees the highest quality milk, chilled right away to preserve its farm-fresh taste."
      },
      {
        name: "Paneer (Organic, Wood-Fired)",
        description: "Discover the authentic flavor of our artisanal paneer, crafted using traditional methods. Made from our fresh organic milk, the paneer is prepared over a wood fire, which imparts a unique, subtle smoky flavor and a wonderfully soft, crumbly texture. It's a culinary delight that elevates any dish.",
        benefits: ["Unique smoky flavor from wood-fire preparation", "Excellent source of protein for vegetarians", "Soft, melt-in-your-mouth texture", "Made fresh with no preservatives"],
        image: "https://images.unsplash.com/photo-1626501131102-34a1b02643a6?q=80&w=1974&auto=format&fit=crop",
        process: "Our paneer is crafted from a single source—our own organic milk. Using traditional wood-fired methods, we create a paneer that is incredibly soft with a subtle smoky flavor. It's made fresh daily without any preservatives or artificial additives."
      }
    ]
  }
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [userRole, setUserRole] = useState<Profile['role'] | 'customer' | null>(null);
  
  const [view, setView] = useState<View>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isLegacyCustomerSchema, setIsLegacyCustomerSchema] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [websiteContent, setWebsiteContent] = useState<WebsiteContent | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [customerProfile, setCustomerProfile] = useState<Customer | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchPublicContent = async () => {
    try {
        const { data: contentRows, error: contentError } = await supabase
            .from('website_content')
            .select('content')
            .limit(1);

        if (contentError) throw contentError;

        const contentData = contentRows?.[0];

        if (contentData && contentData.content && Array.isArray((contentData.content as any).heroSlides)) {
            setWebsiteContent(contentData.content as WebsiteContent);
            if (fetchError?.startsWith('SCHEMA_MISMATCH:')) setFetchError(null);
        } else {
             if (contentData) {
                console.error("Fetched website content is malformed. Falling back to default.", contentData.content);
             }
            setFetchError('SCHEMA_MISMATCH: Your website content is not visible to the public. Please log in to create it, or run the updated database setup script to fix visibility.');
            setWebsiteContent(defaultContent);
        }
    } catch (error: any) {
        console.error('Error fetching public website content:', error.message || error);
        setWebsiteContent(defaultContent);
    }
  };

  const fetchData = useCallback(async () => {
    setFetchError(null);

    const fetchAll = async <T extends { [key: string]: any }>(table: string, orderColumn: keyof T = 'id' as keyof T) => {
        const CHUNK_SIZE = 1000;
        let allData: T[] = [];
        let from = 0;
        
        while (true) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .order(orderColumn as string, { ascending: true })
                .range(from, from + CHUNK_SIZE - 1);

            if (error) throw error;
            if (data) allData.push(...(data as T[]));
            if (!data || data.length < CHUNK_SIZE) break;
            
            from += CHUNK_SIZE;
        }
        return allData;
    };

    const fetchCustomersWithLegacyFallback = async (): Promise<Customer[]> => {
      try {
        const customers = await fetchAll<Customer>('customers', 'name');
        setIsLegacyCustomerSchema(false);
        return customers;
      } catch (error: any) {
        const msg = (error.message || '').toLowerCase();
        const isBalanceColumnError = msg.includes('balanceasofdate') || msg.includes('previousbalance');
        // Catches both "column ... does not exist" and "could not find ... in the schema cache"
        const isColumnMissingError = msg.includes('column') && (msg.includes('does not exist') || msg.includes('could not find'));

        if (isBalanceColumnError && isColumnMissingError) {
          console.warn("Legacy schema detected. Fetching customers without balance columns.");
          setIsLegacyCustomerSchema(true);
          
          const fetchLegacy = async () => {
            const CHUNK_SIZE = 1000;
            let allLegacyData: Omit<Customer, 'previousBalance' | 'balanceAsOfDate'>[] = [];
            let from = 0;
            
            while (true) {
                const { data, error: fallbackError } = await supabase
                    .from('customers')
                    .select('id, name, address, phone, "milkPrice", "defaultQuantity", status, userId, email')
                    .order('name', { ascending: true })
                    .range(from, from + CHUNK_SIZE - 1);

                if (fallbackError) throw fallbackError;
                if (data) allLegacyData.push(...data);
                if (!data || data.length < CHUNK_SIZE) break;
                
                from += CHUNK_SIZE;
            }
            return allLegacyData;
          };

          const legacyCustomers = await fetchLegacy();
          return legacyCustomers.map(c => ({
              ...c,
              previousBalance: 0,
              balanceAsOfDate: null
          }));
        } else {
          throw error;
        }
      }
    };

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setUserRole(null);
            setCustomers([]);
            setDeliveries([]);
            setOrders([]);
            setPayments([]);
            setPendingDeliveries([]);
            setManagedUsers([]);
            setCustomerProfile(null);
            await fetchPublicContent();
            return;
        }

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role, status')
            .eq('id', user.id)
            .single();
        
        if (profileError && profileError.code !== 'PGRST116') { // PGRST116: no rows found
            throw profileError;
        }

        if (profileData) { // User is admin or staff
            const role = profileData.role as Profile['role'];
            setUserRole(role);
    
            if (role === 'staff') {
                const [
                    customersData,
                    deliveriesData,
                    ordersData,
                    paymentsData,
                    pendingDeliveriesData
                ] = await Promise.all([
                    fetchCustomersWithLegacyFallback(),
                    fetchAll<Delivery>('deliveries'),
                    fetchAll<Order>('orders'),
                    fetchAll<Payment>('payments'),
                    fetchAll<PendingDelivery>('pending_deliveries')
                ]);
                
                setCustomers(customersData || []);
                setDeliveries(deliveriesData || []);
                setOrders(ordersData || []);
                setPayments(paymentsData || []);
                setPendingDeliveries(pendingDeliveriesData || []);
                await fetchPublicContent();
                return;
            }
            
            // Admin data fetch continues here...
            const { data: usersData, error: usersError } = await supabase.rpc('get_all_users');
            if (usersError) throw usersError;
            setManagedUsers((usersData as ManagedUser[]) || []);
    
            const [
                customersData,
                deliveriesData,
                ordersData,
                paymentsData,
                pendingDeliveriesData,
            ] = await Promise.all([
                fetchCustomersWithLegacyFallback(),
                fetchAll<Delivery>('deliveries'),
                fetchAll<Order>('orders'),
                fetchAll<Payment>('payments'),
                fetchAll<PendingDelivery>('pending_deliveries')
            ]);
            
            const { data: contentData, error: contentError } = await supabase.from('website_content').select('content').single();
    
            setCustomers(customersData || []);
            setDeliveries(deliveriesData || []);
            setOrders(ordersData || []);
            setPayments(paymentsData || []);
            setPendingDeliveries(pendingDeliveriesData || []);
    
            if (contentError && contentError.code !== 'PGRST116') {
                 throw contentError;
            }
    
            if (contentData) {
                setWebsiteContent(contentData.content as WebsiteContent);
            } else {
                const { data: seededContent, error: seedError } = await supabase
                  .from('website_content')
                  .upsert({ userId: user.id, content: defaultContent }, { onConflict: 'userId' })
                  .select('content')
                  .single();
                
                if (seedError) throw seedError;
                if (seededContent) {
                    setWebsiteContent(seededContent.content as WebsiteContent);
                }
            }
        } else { // User might be a customer
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .select('*')
                .eq('userId', user.id)
                .single();

            if (customerError && customerError.code !== 'PGRST116') {
                throw customerError;
            }

            if(customerData) {
                setUserRole('customer');
                setCustomerProfile(customerData as Customer);
                // RLS will ensure only their data is fetched
                const [deliveriesData, paymentsData] = await Promise.all([
                    fetchAll<Delivery>('deliveries'),
                    fetchAll<Payment>('payments')
                ]);
                setDeliveries(deliveriesData || []);
                setPayments(paymentsData || []);
                await fetchPublicContent();
            } else {
                // Not an admin, staff, or linked customer. Log them out.
                 await supabase.auth.signOut();
                 setFetchError("Your user account is not associated with an admin, staff, or customer profile. Please contact support.");
            }
        }
    } catch (error: any) {
        console.error('Error fetching data:', error);
        const friendlyMessage = getFriendlyErrorMessage(error);
        const msg = (error.message || '').toLowerCase();
        if (
            msg.includes('relation "public.profiles" does not exist') ||
            (msg.includes('column') && msg.includes('does not exist')) ||
            (msg.includes('relation') && msg.includes('does not exist')) ||
            msg.includes('could not find the table') ||
            msg.includes('in the schema cache') ||
            msg.includes('privileges') ||
            msg.includes('infinite recursion detected') ||
            msg.includes('structure of query does not match')
        ) {
             setFetchError(`SCHEMA_MISMATCH: ${error.message}`);
        } else {
            setFetchError(`Error loading data. ${friendlyMessage}`);
        }
    }
  }, []);

  useEffect(() => {
    if (userRole === 'staff' && view === 'dashboard') {
        setView('orders');
    } else if (userRole === 'admin' && (view !== 'dashboard' && view !== 'customers' && view !== 'logins' && view !== 'orders' && view !== 'delivery_approvals' && view !== 'deliveries' && view !== 'calendar' && view !== 'bills' && view !== 'payments' && view !== 'cms' && view !== 'database')) {
        setView('dashboard');
    }
  }, [userRole, view]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        await fetchData();
      } else {
        await fetchPublicContent();
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
        setUserRole(null);
        setCustomers([]);
        setDeliveries([]);
        setOrders([]);
        setPayments([]);
        setPendingDeliveries([]);
        setManagedUsers([]);
        setCustomerProfile(null);
        fetchPublicContent();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchData]);

  const handleAdminLogin = async (email: string, pass:string): Promise<{ success: boolean; error?: string }> => {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: pass,
    });

    if (signInError) {
        return { success: false, error: getFriendlyErrorMessage(signInError) };
    }

    if (signInData.user) {
        // After successful authentication, check if user is admin/staff and approved
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', signInData.user.id)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
             await supabase.auth.signOut();
             return { success: false, error: "Could not retrieve your user profile. Please contact an administrator." };
        }
        
        if (profile) { // This is an admin/staff user
            if (profile.status === 'pending') {
                await supabase.auth.signOut();
                return { success: false, error: "Your account is pending approval from an administrator." };
            }

            if (profile.status === 'rejected') {
                await supabase.auth.signOut();
                return { success: false, error: "Your account has been rejected. Please contact an administrator for assistance." };
            }
        } else {
             await supabase.auth.signOut();
             return { success: false, error: "This is not a valid admin or staff account." };
        }
        
        return { success: true };
    }

    return { success: false, error: 'An unexpected error occurred during login.' };
  };
  
  const handleCustomerLogin = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pass,
    });

    if (error) {
      return { success: false, error: getFriendlyErrorMessage(error) };
    }
    // onAuthStateChange will handle fetching data and setting the session
    return { success: true };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentPage('home');
    setUserRole(null);
  };

  const handleSetView = (newView: View) => {
    setView(newView);
    setSidebarOpen(false);
  };
  
  const renderDashboard = () => {
    if (userRole === 'customer' && customerProfile) {
        return <CustomerDashboard customer={customerProfile} deliveries={deliveries} payments={payments} onLogout={handleLogout} />;
    }
    
    // Admin or Staff view
    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <SideNav activeView={view} setView={handleSetView} isOpen={isSidebarOpen} setOpen={setSidebarOpen} userRole={userRole}/>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
                    <button onClick={() => setSidebarOpen(true)} className="text-gray-500 lg:hidden">
                        <MenuIcon className="h-6 w-6"/>
                    </button>
                    <h1 className="text-2xl font-bold text-gray-800 capitalize hidden md:block">{view.replace(/_/g, ' ')}</h1>
                     <div className="flex items-center">
                        {fetchError?.startsWith('SCHEMA_MISMATCH:') && userRole === 'admin' && (
                            <button onClick={() => setView('database')} className="mr-4 px-3 py-1.5 text-xs bg-red-100 text-red-700 border border-red-200 rounded-md hover:bg-red-200 font-semibold">
                                DB Error! Fix Now
                            </button>
                        )}
                        <button onClick={handleLogout} className="flex items-center px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                            <LogoutIcon className="h-5 w-5 md:mr-2" />
                            <span className="hidden md:block">Logout</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 md:p-6 lg:p-8">
                   {fetchError?.startsWith('SCHEMA_MISMATCH:') && projectRef && view === 'database' && userRole === 'admin' ? (
                      <DatabaseHelper projectRef={projectRef} errorMessage={fetchError.replace('SCHEMA_MISMATCH: ', '')} />
                    ) : fetchError ? (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{fetchError}</p>
                      </div>
                    ) : (
                        <>
                            {/* Admin-only views */}
                            {userRole === 'admin' && (
                                <>
                                    {view === 'dashboard' && <Dashboard customers={customers} deliveries={deliveries} payments={payments} orders={orders} pendingDeliveries={pendingDeliveries} />}
                                    {view === 'logins' && <UserManager users={managedUsers} setUsers={setManagedUsers} />}
                                    {view === 'delivery_approvals' && <DeliveryApprovalManager customers={customers} pendingDeliveries={pendingDeliveries} setPendingDeliveries={setPendingDeliveries} deliveries={deliveries} setDeliveries={setDeliveries} />}
                                    {view === 'calendar' && <CalendarView customers={customers} deliveries={deliveries} />}
                                    {view === 'payments' && <PaymentManager customers={customers} payments={payments} setPayments={setPayments} deliveries={deliveries} />}
                                    {view === 'cms' && websiteContent && <CmsManager content={websiteContent} setContent={setWebsiteContent} />}
                                    {view === 'database' && projectRef && <DatabaseHelper projectRef={projectRef} errorMessage={fetchError || ''} />}
                                </>
                            )}
                            
                            {/* Shared views */}
                            {view === 'customers' && <CustomerManager customers={customers} setCustomers={setCustomers} projectRef={projectRef} isLegacySchema={isLegacyCustomerSchema} isReadOnly={userRole === 'staff'} />}
                            {view === 'orders' && <OrderManager customers={customers} orders={orders} setOrders={setOrders} deliveries={deliveries} setDeliveries={setDeliveries} />}
                            {view === 'bills' && <BillManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} payments={payments} isReadOnly={userRole === 'staff'} />}

                            {/* Role-specific delivery view */}
                            {view === 'deliveries' && userRole === 'admin' && <DeliveryManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} />}
                            {view === 'deliveries' && userRole === 'staff' && <StaffDeliveryManager customers={customers} orders={orders} pendingDeliveries={pendingDeliveries} setPendingDeliveries={setPendingDeliveries} />}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
  };

  return (
    <>
        {isLoading ? (
            <div className="flex items-center justify-center min-h-screen">
                <MilkIcon className="h-12 w-12 text-blue-600 animate-pulse" />
            </div>
        ) : isAuthenticated ? (
            renderDashboard()
        ) : (
            <SharedLayout onLoginClick={() => setCurrentPage('login')} onNavigate={setCurrentPage}>
                {currentPage === 'home' && websiteContent ? (
                    <HomePage content={websiteContent} />
                ) : currentPage === 'products' && websiteContent ? (
                    <ProductsPage content={websiteContent.productsPage} />
                ) : currentPage === 'login' ? (
                    <LoginPage onAdminLogin={handleAdminLogin} onCustomerLogin={handleCustomerLogin} onBackToHome={() => setCurrentPage('home')} />
                ) : (
                    // Fallback for when content is still loading
                     <div className="flex items-center justify-center min-h-screen">
                        <MilkIcon className="h-12 w-12 text-blue-600 animate-pulse" />
                    </div>
                )}
            </SharedLayout>
        )}
    </>
  );
};

export default App;