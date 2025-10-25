



import React, { useState, useEffect, useCallback } from 'react';
import { supabase, projectRef } from './lib/supabaseClient';
import type { Customer, Delivery, Payment, WebsiteContent } from './types';
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

type View = 'dashboard' | 'customers' | 'deliveries' | 'bills' | 'payments' | 'cms' | 'database';
export type Page = 'home' | 'login' | 'products';

const defaultContent: WebsiteContent = {
  heroSlides: [
    { title: "Pure & Fresh Milk, Every Morning", subtitle: "Straight from our farm to your doorstep, ensuring the highest quality and freshness.", image: "https://images.unsplash.com/photo-1563609329766-50c12e849a60?q=80&w=2070&auto=format&fit=crop" },
    { title: "100% Organic Goodness", subtitle: "Our milk comes from healthy, grass-fed cows, free from hormones and antibiotics.", image: "https://images.unsplash.com/photo-1620451121653-f7553f2c733f?q=80&w=2070&auto=format&fit=crop" },
    { title: "More Than Just Milk", subtitle: "Discover our range of fresh dairy products, including homemade paneer and delicious ghee.", image: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?q=80&w=1974&auto=format&fit=crop" },
    { title: "Easy & Reliable Deliveries", subtitle: "Manage your subscriptions and track your deliveries with our simple online dashboard.", image: "https://images.unsplash.com/photo-1600891964923-e9c5222e4343?q=80&w=2070&auto=format&fit=crop" },
    { title: "Join The Freshness Movement", subtitle: "Experience the difference of fresh, organic milk delivered daily.", image: "https://images.unsplash.com/photo-1550985223-e2b865a7a9df?q=80&w=2070&auto=format&fit=crop" }
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
      { quote: "I've been a customer for over a year, and ssfatmorganic has never disappointed. The paneer is the best I've ever had - so soft and fresh. The dashboard makes managing my account so easy.", name: "Amit R.", role: "Loyal Customer" },
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
      { name: "Buffalo Milk (Organic)", description: "Experience the rich, creamy texture and superior taste of our 100% organic buffalo milk. Sourced from grass-fed buffaloes raised in a stress-free environment, our milk is packed with essential nutrients like calcium, protein, and healthy fats. It's perfect for making thick yogurt, delicious sweets, or enjoying on its own.", benefits: ["Higher fat content for richer taste", "Excellent source of protein and calcium", "Promotes strong bones and teeth", "Free from hormones and antibiotics"], image: "https://images.unsplash.com/photo-1628051233038-02195f4c4b57?q=80&w=1974&auto=format&fit=crop" },
      { name: "Cow Milk (Organic)", description: "Our organic cow milk is the perfect choice for daily nutrition. It's light, fresh, and naturally sweet. Produced by free-range cows that graze on organic pastures, this milk is wholesome and free from any artificial additives. It's an ideal choice for children and adults alike, providing a balanced dose of vitamins and minerals.", benefits: ["Easily digestible A2 protein", "Rich in Vitamin D and B12", "Boosts immunity and metabolism", "Certified organic and pure"], image: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?q=80&w=1974&auto=format&fit=crop" },
      { name: "Paneer (Organic, Wood-Fired)", description: "Discover the authentic flavor of our artisanal paneer, crafted using traditional methods. Made from our fresh organic milk, the paneer is prepared over a wood fire, which imparts a unique, subtle smoky flavor and a wonderfully soft, crumbly texture. It's a culinary delight that elevates any dish.", benefits: ["Unique smoky flavor from wood-fire preparation", "Excellent source of protein for vegetarians", "Soft, melt-in-your-mouth texture", "Made fresh with no preservatives"], image: "https://images.unsplash.com/photo-1626501131102-34a1b02643a6?q=80&w=1974&auto=format&fit=crop" }
    ]
  }
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  
  const [view, setView] = useState<View>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [websiteContent, setWebsiteContent] = useState<WebsiteContent | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchPublicContent = async () => {
    try {
        // Use limit(1) instead of single() to prevent errors if multiple users have content
        // and public RLS policy is active. This just grabs the first one.
        const { data: contentRows, error: contentError } = await supabase
            .from('website_content')
            .select('content')
            .limit(1);

        if (contentError) {
            throw contentError;
        }

        const contentData = contentRows?.[0];

        // Basic validation: check if the core structure we need for the homepage exists.
        if (contentData && contentData.content && Array.isArray((contentData.content as any).heroSlides)) {
            setWebsiteContent(contentData.content as WebsiteContent);
            if (fetchError?.startsWith('SCHEMA_MISMATCH:')) setFetchError(null); // Clear schema error if public fetch succeeds
        } else {
             if (contentData) {
                // This means content was fetched but it's not valid.
                console.error("Fetched website content is malformed. Falling back to default.", contentData.content);
             }
            // If query returns 0 rows, content might not be seeded or RLS is blocking.
            // Trigger the schema error check for the user.
            setFetchError('SCHEMA_MISMATCH: Your website content is not visible to the public. Please log in to create it, or run the updated database setup script to fix visibility.');
            setWebsiteContent(defaultContent); // Fallback to display something
        }
    } catch (error: any) {
        console.error('Error fetching public website content:', error);
        setWebsiteContent(defaultContent); // Fallback on any unexpected error
    }
  };

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setCustomers([]);
            setDeliveries([]);
            setPayments([]);
            await fetchPublicContent();
            return;
        }

        const [
            { data: customersData, error: customersError },
            { data: deliveriesData, error: deliveriesError },
            { data: paymentsData, error: paymentsError },
            { data: contentData, error: contentError }
        ] = await Promise.all([
            supabase.from('customers').select('*').eq('userId', user.id).order('name'),
            supabase.from('deliveries').select('*').eq('userId', user.id),
            supabase.from('payments').select('*').eq('userId', user.id),
            supabase.from('website_content').select('content').eq('userId', user.id).single()
        ]);

        if (customersError) throw customersError;
        if (deliveriesError) throw deliveriesError;
        if (paymentsError) throw paymentsError;
        
        // Set primary data state first to ensure it loads even if content seeding fails.
        setCustomers((customersData as Customer[]) || []);
        setDeliveries((deliveriesData as Delivery[]) || []);
        setPayments((paymentsData as Payment[]) || []);

        // Now handle website content, which has more complex logic (like seeding)
        if (contentError && contentError.code !== 'PGRST116') { // Ignore 'exact one row' error if table is empty
             throw contentError;
        }

        if (contentData) {
            setWebsiteContent(contentData.content as WebsiteContent);
        } else {
            // If no content, seed it for the user
            const { data: seededContent, error: seedError } = await supabase
              .from('website_content')
              .insert({ content: defaultContent, userId: user.id })
              .select('content')
              .single();
            
            if (seedError) throw seedError;
            setWebsiteContent(seededContent.content as WebsiteContent);
        }

    } catch (error: any) {
        console.error('Error fetching data:', error.message);
        const msg = (error.message || '').toLowerCase();
        if (
            (msg.includes('column') && msg.includes('does not exist')) ||
            (msg.includes('relation') && msg.includes('does not exist')) ||
            msg.includes('could not find the table') ||
            msg.includes('in the schema cache')
        ) {
            setFetchError(`SCHEMA_MISMATCH: Your database schema is out of date. A required table or column is missing.`);
        } else {
            setFetchError(`Error loading data. This might be due to Row Level Security (RLS) policies on your Supabase tables. Please ensure policies are in place to allow authenticated users to read data. Details: ${error.message}`);
        }
    }
  }, []);


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
        setCustomers([]);
        setDeliveries([]);
        setPayments([]);
        fetchPublicContent();
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
    return { success: true };
  };

  const handleLogin = async (email: string, pass:string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: pass,
    });
    if (error) {
        console.error('Login error:', error.message);
        let errorMessage = error.message;
        if (errorMessage.toLowerCase().includes('invalid login credentials')) {
            errorMessage = "Invalid email or password. If you've just signed up, please check your email to confirm your account before logging in.";
        }
        return { success: false, error: errorMessage };
    }
    setView('dashboard');
    return { success: true };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentPage('home');
  };
  
  const renderDashboard = () => {
    const renderView = () => {
        switch (view) {
          case 'dashboard':
            return <Dashboard customers={customers} deliveries={deliveries} payments={payments} />;
          case 'customers':
            return <CustomerManager customers={customers} setCustomers={setCustomers} projectRef={projectRef} />;
          case 'deliveries':
            return <DeliveryManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} />;
          case 'bills':
            return <BillManager customers={customers} deliveries={deliveries} setDeliveries={setDeliveries} payments={payments} />;
          case 'payments':
            return <PaymentManager customers={customers} payments={payments} setPayments={setPayments} deliveries={deliveries} />;
          case 'cms':
            return <CmsManager content={websiteContent} setContent={setWebsiteContent} />;
          case 'database':
            return <DatabaseHelper projectRef={projectRef} errorMessage={fetchError?.replace('SCHEMA_MISMATCH: ', '') || ''} />;
          default:
            return <Dashboard customers={customers} deliveries={deliveries} payments={payments} />;
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
                    {fetchError && !fetchError.startsWith('SCHEMA_MISMATCH:') && (
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

  // Always show schema error first if it exists, for any user.
  if (fetchError?.startsWith('SCHEMA_MISMATCH:')) {
    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-gray-100">
            <DatabaseHelper projectRef={projectRef} errorMessage={fetchError.replace('SCHEMA_MISMATCH: ', '')} />
        </div>
    );
  }

  if (!websiteContent) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-600">Could not load website content. Please refresh the page.</p>
      </div>
    );
  }


  if (!isAuthenticated) {
      if (currentPage === 'login') {
          return <LoginPage onLogin={handleLogin} onSignUp={handleSignUp} onBackToHome={() => setCurrentPage('home')} />;
      }
      
      let pageContent;
      switch(currentPage) {
        case 'products':
          pageContent = <ProductsPage content={websiteContent.productsPage} />;
          break;
        case 'home':
        default:
          pageContent = <HomePage content={websiteContent} />;
          break;
      }

      return (
        <SharedLayout 
          onLoginClick={() => setCurrentPage('login')} 
          onNavigate={setCurrentPage}
        >
          {pageContent}
        </SharedLayout>
      );
  }

  return renderDashboard();
};

export default App;